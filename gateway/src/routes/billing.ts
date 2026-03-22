import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { db } from "../db.js";
import { clients, creditPacks, creditTransactions } from "../schema.js";
import { eq, sql } from "drizzle-orm";

const router = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || "https://bettherwith.tech";

function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY não configurado.");
  return new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" });
}

// ─── GET /v1/billing/packs ────────────────────────────────────────────────────
// Lista os pacotes disponíveis
router.get("/packs", async (_req: Request, res: Response) => {
  const packs = await db.select().from(creditPacks).where(eq(creditPacks.active, true));
  res.json({
    packs: packs.map((p) => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      priceReais: (p.priceReais / 100).toFixed(2),
      pricePerCredit: (p.priceReais / 100 / p.credits).toFixed(4),
    })),
  });
});

// ─── GET /v1/billing/balance ──────────────────────────────────────────────────
// Saldo atual do cliente autenticado (req.client vem do requireApiKey)
router.get("/balance", async (req: Request, res: Response) => {
  const clientId = req.client?.clientId;
  if (!clientId) return res.status(401).json({ success: false, message: "Não autenticado." });
  const [client] = await db.select({ credits: clients.credits, name: clients.name }).from(clients).where(eq(clients.id, clientId));
  if (!client) return res.status(404).json({ success: false, message: "Cliente não encontrado." });
  res.json({ credits: client.credits, name: client.name });
});

// ─── GET /v1/billing/transactions ────────────────────────────────────────────
// Histórico de transações do cliente autenticado
router.get("/transactions", async (req: Request, res: Response) => {
  const clientId = req.client?.clientId;
  if (!clientId) return res.status(401).json({ success: false, message: "Não autenticado." });
  const txs = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.clientId, clientId))
    .orderBy(sql`${creditTransactions.createdAt} DESC`)
    .limit(50);
  res.json({ transactions: txs });
});

// ─── POST /v1/billing/checkout ───────────────────────────────────────────────
// Cria sessão Stripe Checkout para compra de créditos
router.post("/checkout", async (req: Request, res: Response) => {
  const clientId = req.client?.clientId;
  if (!clientId) return res.status(401).json({ success: false, message: "Não autenticado." });

  const packId = req.body?.pack as string;
  if (!packId) return res.status(400).json({ success: false, message: "Campo 'pack' é obrigatório (starter | professional | enterprise)." });

  const [pack] = await db.select().from(creditPacks).where(eq(creditPacks.id, packId));
  if (!pack || !pack.active) {
    return res.status(400).json({ success: false, message: "Pacote inválido ou inativo." });
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return res.status(404).json({ success: false, message: "Cliente não encontrado." });

  try {
    const stripe = getStripe();

    // Obtém ou cria o Stripe Customer
    let stripeCustomerId = client.stripeCustomerId ?? undefined;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: client.email ?? undefined,
        name: client.name,
        metadata: { clientId },
      });
      stripeCustomerId = customer.id;
      await db.update(clients).set({ stripeCustomerId }).where(eq(clients.id, clientId));
    }

    // Monta line_items: usa Stripe Price ID se disponível, senão price_data dinâmico
    const lineItem = pack.stripePriceId
      ? { price: pack.stripePriceId, quantity: 1 }
      : {
          price_data: {
            currency: "brl",
            product_data: {
              name: `Score BW — ${pack.name}`,
              description: `${pack.credits} créditos de consulta`,
            },
            unit_amount: pack.priceReais,
          },
          quantity: 1,
        };

    // Cria o Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [lineItem],
      metadata: {
        clientId,
        packId,
        credits: String(pack.credits),
      },
      success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/billing/cancel`,
    });

    res.json({ success: true, checkoutUrl: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error("[Billing] Erro ao criar checkout:", err.message);
    res.status(500).json({ success: false, message: err.message || "Erro ao criar sessão de pagamento." });
  }
});

// ─── POST /webhooks/stripe ────────────────────────────────────────────────────
// Recebe eventos do Stripe (chamado diretamente pelo Stripe, sem autenticação de API key)
export async function handleStripeWebhook(req: Request, res: Response) {
  if (!STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET não configurado." });
  }

  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[Stripe Webhook] Assinatura inválida:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { clientId, packId, credits } = session.metadata ?? {};

    if (!clientId || !credits) {
      console.error("[Stripe Webhook] Metadados ausentes na sessão:", session.id);
      return res.json({ received: true });
    }

    const creditsToAdd = parseInt(credits, 10);
    if (isNaN(creditsToAdd) || creditsToAdd <= 0) {
      console.error("[Stripe Webhook] Créditos inválidos:", credits);
      return res.json({ received: true });
    }

    try {
      // Adiciona créditos atomicamente
      const [updated] = await db
        .update(clients)
        .set({ credits: sql`${clients.credits} + ${creditsToAdd}` })
        .where(eq(clients.id, clientId))
        .returning({ credits: clients.credits });

      if (updated) {
        await db.insert(creditTransactions).values({
          clientId,
          type: "purchase",
          credits: creditsToAdd,
          balanceAfter: updated.credits,
          description: `Compra pacote ${packId ?? "?"} (${creditsToAdd} créditos)`,
          stripeSessionId: session.id,
          packId: packId ?? null,
        });
        console.log(`[Billing] +${creditsToAdd} créditos adicionados ao cliente ${clientId}. Saldo: ${updated.credits}`);
      }
    } catch (err: any) {
      console.error("[Billing] Erro ao adicionar créditos:", err.message);
    }
  }

  res.json({ received: true });
}

export default router;

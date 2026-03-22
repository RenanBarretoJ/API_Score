import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import { clients, apiKeys, plans } from "../schema.js";
import { eq } from "drizzle-orm";
import { generateApiKey } from "../lib/api-key.js";

const router = Router();

// Limita o auto-cadastro: máximo 5 novos registros por IP por hora
const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip ?? req.socket?.remoteAddress ?? "unknown"),
  message: { success: false, message: "Muitos cadastros. Tente novamente em 1 hora." },
});

/**
 * POST /v1/register
 * Auto-cadastro público: cria um cliente no plano "credits" com 3 créditos de teste
 * e retorna a API Key gerada. A chave só é exibida uma vez.
 *
 * Body: { name, email, company? }
 */
router.post("/", registerLimit, async (req: Request, res: Response) => {
  const { name, email, company } = req.body ?? {};

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ success: false, message: "Campo 'name' é obrigatório." });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ success: false, message: "Campo 'email' válido é obrigatório." });
  }

  // Verifica se e-mail já está cadastrado
  const [existing] = await db.select({ id: clients.id }).from(clients).where(eq(clients.email, email.toLowerCase().trim()));
  if (existing) {
    return res.status(409).json({ success: false, message: "E-mail já cadastrado. Entre em contato para recuperar seu token." });
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, "credits"));
  if (!plan) {
    return res.status(500).json({ success: false, message: "Plano de créditos não encontrado. Contate o suporte." });
  }

  const [client] = await db
    .insert(clients)
    .values({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      company: typeof company === "string" && company.trim().length > 0 ? company.trim() : null,
      planId: "credits",
      credits: 3, // 3 créditos grátis para experimentar
      status: "active",
    })
    .returning();

  if (!client) {
    return res.status(500).json({ success: false, message: "Erro ao criar conta. Tente novamente." });
  }

  const { raw, prefix, hash } = generateApiKey();
  await db.insert(apiKeys).values({
    clientId: client.id,
    keyPrefix: prefix,
    keyHash: hash,
    scopes: ["score-bw:read"],
    rateLimitPerMin: 30,
  });

  console.log(`[register] Novo cliente: ${client.name} <${client.email}> id=${client.id}`);

  res.status(201).json({
    success: true,
    message: "Conta criada com sucesso! Você ganhou 3 créditos gratuitos para testar.",
    clientId: client.id,
    name: client.name,
    email: client.email,
    company: client.company ?? undefined,
    credits: 3,
    apiKey: raw,
    warning: "Salve sua API Key agora — ela não será exibida novamente.",
    nextStep: "Use POST /v1/billing/checkout com { pack: 'pack10' } para comprar mais créditos.",
  });
});

export default router;

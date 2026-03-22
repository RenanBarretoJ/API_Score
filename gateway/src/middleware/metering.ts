import { Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { usage, clients, creditTransactions } from "../schema.js";
import { eq, and, sql } from "drizzle-orm";

function currentMonth() { return new Date().getMonth() + 1; }
function currentYear() { return new Date().getFullYear(); }

export async function recordUsage(clientId: string, service: string) {
  const month = currentMonth();
  const year = currentYear();
  const rows = await db
    .select()
    .from(usage)
    .where(and(eq(usage.clientId, clientId), eq(usage.month, month), eq(usage.year, year)));
  const byService: Record<string, number> = (rows[0]?.byService as Record<string, number>) || {};
  byService[service] = (byService[service] || 0) + 1;
  const count = (rows[0]?.count ?? 0) + 1;
  if (rows[0]) {
    await db
      .update(usage)
      .set({ count, byService, updatedAt: new Date() })
      .where(eq(usage.id, rows[0].id));
  } else {
    await db.insert(usage).values({
      clientId,
      month,
      year,
      count: 1,
      byService: { [service]: 1 },
    });
  }
}

/** Desconta 1 crédito do cliente (plano "credits"). Retorna false se sem saldo. */
export async function deductCredit(clientId: string, service: string): Promise<boolean> {
  const [updated] = await db
    .update(clients)
    .set({ credits: sql`${clients.credits} - 1` })
    .where(and(eq(clients.id, clientId), sql`${clients.credits} > 0`))
    .returning({ credits: clients.credits });

  if (!updated) return false;

  await db.insert(creditTransactions).values({
    clientId,
    type: "usage",
    credits: -1,
    balanceAfter: updated.credits,
    description: `Consulta: ${service}`,
  });

  return true;
}

export async function checkQuota(req: Request, res: Response, next: NextFunction) {
  if (!req.client) return next();

  // Plano "paid" — sem limite
  if (req.client.planId === "paid") return next();

  // Plano "credits" — verifica saldo
  if (req.client.planId === "credits") {
    const [row] = await db
      .select({ credits: clients.credits })
      .from(clients)
      .where(eq(clients.id, req.client.clientId));

    if (!row || row.credits <= 0) {
      return res.status(402).json({
        success: false,
        message: "Saldo de créditos insuficiente. Adquira mais créditos em /v1/billing/checkout.",
        credits: row?.credits ?? 0,
      });
    }
    return next();
  }

  // Plano "free" — quota mensal
  const month = currentMonth();
  const year = currentYear();
  const rows = await db
    .select({ count: usage.count })
    .from(usage)
    .where(and(eq(usage.clientId, req.client.clientId), eq(usage.month, month), eq(usage.year, year)));
  const used = rows[0]?.count ?? 0;
  if (used >= req.client.monthlyQuota) {
    return res.status(429).json({
      success: false,
      message: `Cota mensal atingida (${req.client.monthlyQuota}). Faça upgrade para continuar.`,
    });
  }
  next();
}

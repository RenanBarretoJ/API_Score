import { Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { usage } from "../schema.js";
import { eq, and } from "drizzle-orm";

const now = new Date();
const month = now.getMonth() + 1;
const year = now.getFullYear();

export async function recordUsage(clientId: string, service: string) {
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

export async function checkQuota(req: Request, res: Response, next: NextFunction) {
  if (!req.client) return next();
  if (req.client.planId === "paid") return next();
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

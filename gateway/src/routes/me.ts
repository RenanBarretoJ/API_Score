import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { clients, plans, usage } from "../schema.js";
import { eq, and } from "drizzle-orm";

const router = Router();
const now = new Date();
const month = now.getMonth() + 1;
const year = now.getFullYear();

/** Dados do cliente autenticado (plano, cota, uso do mês). */
router.get("/", async (req: Request, res: Response) => {
  if (!req.client) {
    return res.status(401).json({ success: false, message: "Não autenticado." });
  }
  const [row] = await db
    .select({
      name: clients.name,
      email: clients.email,
      planId: clients.planId,
      planName: plans.name,
      monthlyQuota: plans.monthlyQuota,
    })
    .from(clients)
    .innerJoin(plans, eq(clients.planId, plans.id))
    .where(eq(clients.id, req.client.clientId));
  if (!row) {
    return res.status(404).json({ success: false, message: "Cliente não encontrado." });
  }
  const [usageRow] = await db
    .select({ count: usage.count, byService: usage.byService })
    .from(usage)
    .where(and(eq(usage.clientId, req.client.clientId), eq(usage.month, month), eq(usage.year, year)));
  const used = usageRow?.count ?? 0;
  const byService = (usageRow?.byService as Record<string, number>) ?? {};
  res.json({
    client: {
      name: row.name,
      email: row.email ?? undefined,
      planId: row.planId,
      planName: row.planName,
      monthlyQuota: row.monthlyQuota,
      usageThisMonth: used,
      remaining: row.monthlyQuota === 0 ? null : Math.max(0, row.monthlyQuota - used),
    },
    usage: { count: used, byService },
  });
});

/** Uso do mês atual (contador). */
router.get("/usage", async (req: Request, res: Response) => {
  if (!req.client) {
    return res.status(401).json({ success: false, message: "Não autenticado." });
  }
  const [row] = await db
    .select({ count: usage.count, byService: usage.byService })
    .from(usage)
    .where(and(eq(usage.clientId, req.client.clientId), eq(usage.month, month), eq(usage.year, year)));
  const count = row?.count ?? 0;
  const byService = (row?.byService as Record<string, number>) ?? {};
  res.json({ month, year, count, byService });
});

export default router;

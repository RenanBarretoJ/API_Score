import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { clients, apiKeys, plans, usage, queryLogs } from "../schema.js";
import { eq, and, desc } from "drizzle-orm";
import { generateApiKey } from "../lib/api-key.js";

const router = Router();

/** Listar clientes (com quantidade de chaves). */
router.get("/clients", async (_req: Request, res: Response) => {
  const list = await db.select().from(clients).orderBy(clients.createdAt);
  const keys = await db.select({ clientId: apiKeys.clientId }).from(apiKeys);
  const keyCount: Record<string, number> = {};
  for (const k of keys) {
    keyCount[k.clientId] = (keyCount[k.clientId] ?? 0) + 1;
  }
  const withPlans = await Promise.all(
    list.map(async (c) => {
      const [p] = await db.select({ name: plans.name, monthlyQuota: plans.monthlyQuota }).from(plans).where(eq(plans.id, c.planId));
      return {
        id: c.id,
        name: c.name,
        email: c.email ?? undefined,
        planId: c.planId,
        planName: p?.name,
        monthlyQuota: p?.monthlyQuota ?? 0,
        status: c.status,
        createdAt: c.createdAt,
        keyCount: keyCount[c.id] ?? 0,
      };
    })
  );
  res.json({ clients: withPlans });
});

/** Criar cliente e uma API Key (a key é retornada apenas nesta resposta). */
router.post("/clients", async (req: Request, res: Response) => {
  const name = req.body?.name;
  const email = req.body?.email;
  const planId = (req.body?.planId as string) || "free";
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ success: false, message: "Campo 'name' é obrigatório." });
  }
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) {
    return res.status(400).json({ success: false, message: "Plano inválido. Use 'free' ou 'paid'." });
  }
  const [client] = await db
    .insert(clients)
    .values({
      name: name.trim(),
      email: typeof email === "string" ? email.trim() || null : null,
      planId,
      status: "active",
    })
    .returning();
  if (!client) {
    return res.status(500).json({ success: false, message: "Erro ao criar cliente." });
  }
  const { raw, prefix, hash } = generateApiKey();
  await db.insert(apiKeys).values({
    clientId: client.id,
    keyPrefix: prefix,
    keyHash: hash,
    scopes: ["score-bw:read"],
    rateLimitPerMin: 30,
  });
  res.status(201).json({
    client: { id: client.id, name: client.name, email: client.email ?? undefined, planId: client.planId, status: client.status },
    apiKey: raw,
    message: "Guarde a API Key em local seguro; ela não será exibida novamente.",
  });
});

/** Gerar nova API Key para um cliente. */
router.post("/clients/:id/keys", async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!id) return res.status(400).json({ success: false, message: "ID inválido." });
  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) {
    return res.status(404).json({ success: false, message: "Cliente não encontrado." });
  }
  const { raw, prefix, hash } = generateApiKey();
  await db.insert(apiKeys).values({
    clientId: client.id,
    keyPrefix: prefix,
    keyHash: hash,
    scopes: ["score-bw:read"],
    rateLimitPerMin: 30,
  });
  res.status(201).json({
    apiKey: raw,
    message: "Guarde a API Key em local seguro; ela não será exibida novamente.",
  });
});

/** Uso por cliente. Query: ?month=3&year=2025 ou omitir para todos os meses. */
router.get("/clients/:id/usage", async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!id) return res.status(400).json({ success: false, message: "ID inválido." });
  const monthQ = req.query.month as string | undefined;
  const yearQ = req.query.year as string | undefined;

  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) {
    return res.status(404).json({ success: false, message: "Cliente não encontrado." });
  }

  if (monthQ && yearQ) {
    const month = parseInt(monthQ, 10);
    const year = parseInt(yearQ, 10);
    if (Number.isNaN(month) || Number.isNaN(year) || month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: "month (1-12) e year são obrigatórios quando informados." });
    }
    const [row] = await db
      .select()
      .from(usage)
      .where(and(eq(usage.clientId, id), eq(usage.month, month), eq(usage.year, year)));
    return res.json({
      clientId: id,
      clientName: client.name,
      month,
      year,
      count: row?.count ?? 0,
      byService: (row?.byService as Record<string, number>) ?? {},
    });
  }

  const rows = await db.select().from(usage).where(eq(usage.clientId, id)).orderBy(desc(usage.year), desc(usage.month));
  res.json({
    clientId: id,
    clientName: client.name,
    usage: rows.map((r) => ({ month: r.month, year: r.year, count: r.count, byService: r.byService })),
  });
});

/** Logs de consultas por cliente. Query: ?limit=100 */
router.get("/clients/:id/logs", async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!id) return res.status(400).json({ success: false, message: "ID inválido." });
  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) {
    return res.status(404).json({ success: false, message: "Cliente não encontrado." });
  }
  const limitQ = parseInt((req.query.limit as string) || "100", 10);
  const limit = Number.isNaN(limitQ) ? 100 : Math.max(1, Math.min(limitQ, 500));
  const rows = await db
    .select()
    .from(queryLogs)
    .where(eq(queryLogs.clientId, id))
    .orderBy(desc(queryLogs.createdAt))
    .limit(limit);
  res.json({
    clientId: id,
    clientName: client.name,
    logs: rows,
  });
});

export default router;

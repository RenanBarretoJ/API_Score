import { Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { apiKeys, clients, plans } from "../schema.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export type ClientContext = {
  clientId: string;
  planId: string;
  monthlyQuota: number;
  credits: number;
  keyId: string;
};

declare global {
  namespace Express {
    interface Request {
      client?: ClientContext;
    }
  }
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.headers["x-api-key"] as string;
  if (!rawKey || typeof rawKey !== "string") {
    return res.status(401).json({ success: false, message: "Header X-API-Key é obrigatório." });
  }
  const prefix = rawKey.slice(0, 20);
  const rows = await db
    .select({
      keyId: apiKeys.id,
      keyHash: apiKeys.keyHash,
      clientId: apiKeys.clientId,
      planId: clients.planId,
      monthlyQuota: plans.monthlyQuota,
      credits: clients.credits,
    })
    .from(apiKeys)
    .innerJoin(clients, eq(apiKeys.clientId, clients.id))
    .innerJoin(plans, eq(clients.planId, plans.id))
    .where(eq(apiKeys.keyPrefix, prefix));

  const row = rows[0];
  if (!row || hashKey(rawKey) !== row.keyHash) {
    return res.status(401).json({ success: false, message: "X-API-Key inválida." });
  }
  req.client = {
    clientId: row.clientId,
    planId: row.planId,
    monthlyQuota: row.monthlyQuota ?? 0,
    credits: row.credits ?? 0,
    keyId: row.keyId,
  };
  next();
}

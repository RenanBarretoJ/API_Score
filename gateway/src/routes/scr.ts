import { Router, Request, Response } from "express";
import { recordUsage, deductCredit } from "../middleware/metering.js";
import { db } from "../db.js";
import { queryLogs } from "../schema.js";

const router = Router();

const BASE = process.env.SCR_SERVICE_URL;
const SERVICE_KEY = process.env.SCR_SERVICE_KEY;

if (!BASE || !SERVICE_KEY) {
  console.warn("[Gateway/SCR] SCR_SERVICE_URL ou SCR_SERVICE_KEY não definidos; rotas SCR desativadas.");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBody(text: string): Record<string, unknown> | string {
  try { return JSON.parse(text); } catch { return text; }
}

async function saveLog(params: {
  req: Request;
  endpoint: string;
  documentType?: "cpf" | "cnpj";
  documentValue?: string;
  requestBody?: Record<string, unknown>;
  responseStatus: number;
  responseBody?: Record<string, unknown> | string | null;
  errorMessage?: string;
  durationMs: number;
}) {
  if (!params.req.client) return;
  await db.insert(queryLogs).values({
    clientId: params.req.client.clientId,
    service: "scr",
    endpoint: params.endpoint,
    documentType: params.documentType,
    documentValue: params.documentValue,
    requestBody: params.requestBody ?? {},
    responseStatus: params.responseStatus,
    responseBody: params.responseBody ?? null,
    errorMessage: params.errorMessage,
    durationMs: params.durationMs,
  });
}

/** Proxy genérico para o Replit SCR via POST */
async function proxyPost(
  req: Request,
  res: Response,
  replitPath: string,
  body: object,
  logMeta?: { documentType?: "cpf" | "cnpj"; documentValue?: string },
  deduct = true
) {
  const startedAt = Date.now();

  if (!BASE || !SERVICE_KEY) {
    await saveLog({ req, endpoint: replitPath, responseStatus: 503, responseBody: { success: false, message: "Serviço SCR não configurado." }, errorMessage: "SCR_SERVICE_URL ou SCR_SERVICE_KEY ausentes", durationMs: 0 });
    return res.status(503).json({ success: false, message: "Serviço SCR não configurado." });
  }

  const url = `${BASE.replace(/\/$/, "")}${replitPath}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": SERVICE_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });

    const text = await response.text();
    const parsed = parseBody(text);

    await saveLog({
      req,
      endpoint: replitPath,
      ...logMeta,
      requestBody: body as Record<string, unknown>,
      responseStatus: response.status,
      responseBody: parsed,
      durationMs: Date.now() - startedAt,
    });

    if (!response.ok) return res.status(response.status).send(text);

    if (req.client && deduct) {
      await recordUsage(req.client.clientId, "scr");
      if (req.client.planId === "credits") {
        await deductCredit(req.client.clientId, replitPath);
      }
    }

    try { return res.json(JSON.parse(text)); } catch { return res.type("text").send(text); }
  } catch (err: any) {
    console.error("[Gateway/SCR] Proxy:", err.message);
    await saveLog({ req, endpoint: replitPath, ...logMeta, requestBody: body as Record<string, unknown>, responseStatus: 502, responseBody: { success: false, message: err.message }, errorMessage: err.message, durationMs: Date.now() - startedAt });
    return res.status(502).json({ success: false, message: err.message || "Erro ao chamar serviço SCR." });
  }
}

/** Proxy genérico para o Replit SCR via GET */
async function proxyGet(
  req: Request,
  res: Response,
  replitPath: string,
  logMeta?: { documentType?: "cpf" | "cnpj"; documentValue?: string },
  deduct = true
) {
  const startedAt = Date.now();

  if (!BASE || !SERVICE_KEY) {
    return res.status(503).json({ success: false, message: "Serviço SCR não configurado." });
  }

  const url = `${BASE.replace(/\/$/, "")}${replitPath}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": SERVICE_KEY },
      signal: AbortSignal.timeout(30000),
    });

    const text = await response.text();
    const parsed = parseBody(text);

    await saveLog({
      req,
      endpoint: replitPath,
      ...logMeta,
      responseStatus: response.status,
      responseBody: parsed,
      durationMs: Date.now() - startedAt,
    });

    if (!response.ok) return res.status(response.status).send(text);

    if (req.client && deduct) {
      await recordUsage(req.client.clientId, "scr");
      if (req.client.planId === "credits") {
        await deductCredit(req.client.clientId, replitPath);
      }
    }

    try { return res.json(JSON.parse(text)); } catch { return res.type("text").send(text); }
  } catch (err: any) {
    console.error("[Gateway/SCR] Proxy GET:", err.message);
    await saveLog({ req, endpoint: replitPath, ...logMeta, responseStatus: 502, responseBody: { success: false, message: err.message }, errorMessage: err.message, durationMs: Date.now() - startedAt });
    return res.status(502).json({ success: false, message: err.message || "Erro ao chamar serviço SCR." });
  }
}

// ─── Rotas ───────────────────────────────────────────────────────────────────

/**
 * POST /v1/scr/score
 * Score PF (CPF) via Replit → /score
 */
router.post("/score", async (req, res) => {
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  await proxyPost(req, res, "/score", { ...req.body, cpf: clean }, { documentType: "cpf", documentValue: clean });
});

/**
 * POST /v1/scr/score-pj
 * Score PJ (CNPJ) via Replit → /api/score-pj
 */
router.post("/score-pj", async (req, res) => {
  const cnpj = req.body?.cnpj;
  const clean = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
  if (clean.length !== 14) {
    return res.status(400).json({ success: false, message: "CNPJ inválido ou não enviado." });
  }
  await proxyPost(req, res, "/api/score-pj", { ...req.body, cnpj: clean }, { documentType: "cnpj", documentValue: clean });
});

/**
 * POST /v1/scr/pdf
 * PDF completo via Replit → /pdf-long
 */
router.post("/pdf", async (req, res) => {
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  await proxyPost(req, res, "/pdf-long", { cpf: clean }, { documentType: "cpf", documentValue: clean });
});

/**
 * GET /v1/scr/historico/:cpf
 * Histórico de scores via Replit → /api/historico/{cpf}
 * Não desconta crédito (consulta interna de histórico)
 */
router.get("/historico/:cpf", async (req, res) => {
  const raw = req.params.cpf as string;
  const clean = raw.replace(/\D/g, "");
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido." });
  }
  await proxyGet(req, res, `/api/historico/${clean}`, { documentType: "cpf", documentValue: clean }, false);
});

/**
 * POST /v1/scr/scr
 * Consulta SCR (BACEN) via Replit → /api/scr
 */
router.post("/scr", async (req, res) => {
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  await proxyPost(req, res, "/api/scr", { ...req.body, cpf: clean }, { documentType: "cpf", documentValue: clean });
});

export default router;

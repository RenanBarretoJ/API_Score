import { Router, Request, Response } from "express";
import { recordUsage, deductCredit } from "../middleware/metering.js";
import { db } from "../db.js";
import { queryLogs } from "../schema.js";

const router = Router();

// ─── Configuração via variáveis de ambiente ──────────────────────────────────
const CLIENT_ID     = process.env.SERASA_CLIENT_ID;
const CLIENT_SECRET = process.env.SERASA_CLIENT_SECRET;

// URLs configuráveis — ajuste se a Serasa indicar endpoint diferente
const TOKEN_URL   = process.env.SERASA_TOKEN_URL   ?? "https://api.serasaexperian.com.br/security/v2/oauth/token";
const API_BASE    = process.env.SERASA_API_BASE_URL ?? "https://api.serasaexperian.com.br";
const PF_PATH     = process.env.SERASA_PF_PATH      ?? "/consumers/v1.0/relatorio-basico-pf";
const PJ_PATH     = process.env.SERASA_PJ_PATH      ?? "/companies/v1.0/relatorio-basico-pj";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn("[Gateway/Serasa] SERASA_CLIENT_ID ou SERASA_CLIENT_SECRET não definidos; rotas Serasa desativadas.");
}

// ─── Cache de token OAuth2 ───────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  const now = Date.now();

  // Reutiliza token se ainda válido (com margem de 60s)
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("SERASA_CLIENT_ID ou SERASA_CLIENT_SECRET não configurados.");
  }

  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const resp = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
    signal:  AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Serasa auth falhou (${resp.status}): ${text}`);
  }

  const data = await resp.json() as { access_token?: string; expires_in?: number };

  if (!data.access_token) {
    throw new Error("Serasa não retornou access_token.");
  }

  cachedToken     = data.access_token;
  tokenExpiresAt  = now + (data.expires_in ?? 7200) * 1000;

  console.log(`[Serasa] Token renovado. Expira em ${data.expires_in ?? 7200}s.`);
  return cachedToken;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBody(text: string): Record<string, unknown> | string {
  try { return JSON.parse(text); } catch { return text; }
}

async function saveLog(params: {
  req: Request;
  endpoint: string;
  documentType: "cpf" | "cnpj";
  documentValue: string;
  responseStatus: number;
  responseBody?: Record<string, unknown> | string | null;
  errorMessage?: string;
  durationMs: number;
}) {
  if (!params.req.client) return;
  await db.insert(queryLogs).values({
    clientId:       params.req.client.clientId,
    service:        "serasa",
    endpoint:       params.endpoint,
    documentType:   params.documentType,
    documentValue:  params.documentValue,
    requestBody:    {},
    responseStatus: params.responseStatus,
    responseBody:   params.responseBody ?? null,
    errorMessage:   params.errorMessage,
    durationMs:     params.durationMs,
  });
}

async function callSerasa(
  req: Request,
  res: Response,
  apiPath: string,
  document: string,
  documentType: "cpf" | "cnpj"
) {
  const startedAt = Date.now();

  if (!CLIENT_ID || !CLIENT_SECRET) {
    await saveLog({ req, endpoint: apiPath, documentType, documentValue: document, responseStatus: 503, responseBody: { success: false, message: "Serasa não configurado." }, errorMessage: "Credenciais ausentes", durationMs: 0 });
    return res.status(503).json({ success: false, message: "Serasa não configurado." });
  }

  try {
    const token   = await getToken();
    const url     = `${API_BASE}${apiPath}/${document}`;

    const response = await fetch(url, {
      method:  "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    const text   = await response.text();
    const parsed = parseBody(text);

    await saveLog({
      req,
      endpoint:       apiPath,
      documentType,
      documentValue:  document,
      responseStatus: response.status,
      responseBody:   parsed,
      durationMs:     Date.now() - startedAt,
    });

    if (!response.ok) {
      // Token expirado externamente → invalida cache e deixa cliente tentar de novo
      if (response.status === 401) cachedToken = null;
      return res.status(response.status).send(text);
    }

    if (req.client) {
      await recordUsage(req.client.clientId, "serasa");
      if (req.client.planId === "credits") {
        await deductCredit(req.client.clientId, apiPath);
      }
    }

    try { return res.json(JSON.parse(text)); } catch { return res.type("text").send(text); }

  } catch (err: any) {
    console.error("[Gateway/Serasa]", err.message);
    await saveLog({
      req,
      endpoint:       apiPath,
      documentType,
      documentValue:  document,
      responseStatus: 502,
      responseBody:   { success: false, message: err.message },
      errorMessage:   err.message,
      durationMs:     Date.now() - startedAt,
    });
    return res.status(502).json({ success: false, message: err.message || "Erro ao chamar Serasa." });
  }
}

// ─── Rotas ───────────────────────────────────────────────────────────────────

/**
 * GET /v1/serasa/pf/:cpf
 * Relatório básico PF (CPF) — consome 1 crédito
 */
router.get("/pf/:cpf", async (req, res) => {
  const raw   = req.params.cpf as string;
  const clean = raw.replace(/\D/g, "");
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido." });
  }
  await callSerasa(req, res, PF_PATH, clean, "cpf");
});

/**
 * GET /v1/serasa/pj/:cnpj
 * Relatório básico PJ (CNPJ) — consome 1 crédito
 */
router.get("/pj/:cnpj", async (req, res) => {
  const raw   = req.params.cnpj as string;
  const clean = raw.replace(/\D/g, "");
  if (clean.length !== 14) {
    return res.status(400).json({ success: false, message: "CNPJ inválido." });
  }
  await callSerasa(req, res, PJ_PATH, clean, "cnpj");
});

export default router;

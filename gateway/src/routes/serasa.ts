import { Router, Request, Response } from "express";
import { recordUsage, deductCredit } from "../middleware/metering.js";
import { db } from "../db.js";
import { queryLogs } from "../schema.js";

const router = Router();

// ─── Configuração ─────────────────────────────────────────────────────────────
const CLIENT_ID     = process.env.SERASA_CLIENT_ID;
const CLIENT_SECRET = process.env.SERASA_CLIENT_SECRET;

const TOKEN_URL = "https://api.serasaexperian.com.br/security/iam/v1/client-identities/login";
const API_BASE  = "https://api.serasaexperian.com.br";

// Custo em créditos por consulta Serasa
const SERASA_CREDIT_COST = 2;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn("[Gateway/Serasa] SERASA_CLIENT_ID ou SERASA_CLIENT_SECRET não definidos; rotas Serasa desativadas.");
}

// ─── Cache de token ───────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("SERASA_CLIENT_ID ou SERASA_CLIENT_SECRET não configurados.");
  }

  // Basic Auth: Base64(clientId:clientSecret)
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const resp = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body:   JSON.stringify({}),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Serasa auth falhou (${resp.status}): ${text}`);
  }

  const data = await resp.json() as {
    accessToken?: string;
    tokenType?:   string;
    expiresIn?:   number;
  };

  if (!data.accessToken) {
    throw new Error(`Serasa não retornou accessToken. Resposta: ${JSON.stringify(data)}`);
  }

  cachedToken    = data.accessToken;
  tokenExpiresAt = now + (data.expiresIn ?? 3600) * 1000;

  console.log(`[Serasa] Token renovado. Expira em ${data.expiresIn ?? 3600}s.`);
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

// ─── Proxy genérico Serasa (GET com X-Document-Id) ───────────────────────────

async function callSerasa(
  req: Request,
  res: Response,
  options: {
    apiPath:      string;
    reportName:   string;
    document:     string;
    documentType: "cpf" | "cnpj";
    features?:    string;
  }
) {
  const { apiPath, reportName, document, documentType, features } = options;
  const startedAt = Date.now();
  const logEndpoint = `${apiPath}?reportName=${reportName}`;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(503).json({ success: false, message: "Serasa não configurado." });
  }

  try {
    const token = await getToken();

    const qs = new URLSearchParams({ reportName });
    if (features) qs.set("optionalFeatures", features);

    const url = `${API_BASE}${apiPath}?${qs.toString()}`;

    const response = await fetch(url, {
      method:  "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
        "X-Document-Id": document,
      },
      signal: AbortSignal.timeout(30_000),
    });

    const text   = await response.text();
    const parsed = parseBody(text);

    await saveLog({
      req,
      endpoint:       logEndpoint,
      documentType,
      documentValue:  document,
      responseStatus: response.status,
      responseBody:   parsed,
      durationMs:     Date.now() - startedAt,
    });

    if (!response.ok) {
      if (response.status === 401) cachedToken = null;
      return res.status(response.status).send(text);
    }

    if (req.client) {
      await recordUsage(req.client.clientId, "serasa");
      if (req.client.planId === "credits") {
        await deductCredit(req.client.clientId, `serasa:${reportName}`, SERASA_CREDIT_COST);
      }
    }

    try { return res.json(JSON.parse(text)); } catch { return res.type("text").send(text); }

  } catch (err: any) {
    console.error(`[Gateway/Serasa] ${logEndpoint}:`, err.message);
    await saveLog({
      req,
      endpoint:       logEndpoint,
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

// ─── Rotas PF ────────────────────────────────────────────────────────────────

/**
 * GET /v1/serasa/pf/:cpf
 * Relatório básico PF — 2 créditos
 * Query opcional: ?features=SCORE,RENDA_ESTIMADA_PF
 */
router.get("/pf/:cpf", async (req, res) => {
  const clean = (req.params.cpf as string).replace(/\D/g, "");
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido." });
  }
  await callSerasa(req, res, {
    apiPath:      "/credit-services/person-information-report/v1/creditreport",
    reportName:   "RELATORIO_BASICO_PF_PME",
    document:     clean,
    documentType: "cpf",
    features:     req.query.features as string | undefined,
  });
});

/**
 * GET /v1/serasa/pf-avancado/:cpf
 * Relatório avançado + score PF — 2 créditos
 * Query opcional: ?features=SCORE,RENDA_ESTIMADA_PF
 */
router.get("/pf-avancado/:cpf", async (req, res) => {
  const clean = (req.params.cpf as string).replace(/\D/g, "");
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido." });
  }
  await callSerasa(req, res, {
    apiPath:      "/credit-services/person-information-report/v1/creditreport",
    reportName:   "RELATORIO_AVANCADO_TOP_SCORE_PF_PME",
    document:     clean,
    documentType: "cpf",
    features:     req.query.features as string | undefined,
  });
});

// ─── Rotas PJ ────────────────────────────────────────────────────────────────

/**
 * GET /v1/serasa/pj/:cnpj
 * Relatório básico PJ — 2 créditos
 */
router.get("/pj/:cnpj", async (req, res) => {
  const clean = (req.params.cnpj as string).replace(/\D/g, "");
  if (clean.length !== 14) {
    return res.status(400).json({ success: false, message: "CNPJ inválido." });
  }
  await callSerasa(req, res, {
    apiPath:      "/credit-services/business-information-report/v1/reports",
    reportName:   "RELATORIO_BASICO_PJ_PME",
    document:     clean,
    documentType: "cnpj",
    features:     req.query.features as string | undefined,
  });
});

export default router;

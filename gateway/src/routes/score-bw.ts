import { Router, Request, Response } from "express";
import { recordUsage } from "../middleware/metering.js";
import { db } from "../db.js";
import { queryLogs } from "../schema.js";

const router = Router();
const BASE = process.env.SCORE_BW_SERVICE_URL;
const SERVICE_KEY = process.env.GATEWAY_SERVICE_KEY;

if (!BASE || !SERVICE_KEY) {
  console.warn("[Gateway] SCORE_BW_SERVICE_URL ou GATEWAY_SERVICE_KEY não definidos; rotas Score BW desativadas.");
}

function parseResponseBody(text: string): Record<string, unknown> | string {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
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
    service: "score-bw",
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

async function proxy(
  req: Request,
  res: Response,
  path: string,
  body: object,
  logMeta?: { documentType?: "cpf" | "cnpj"; documentValue?: string },
  isJson = true
) {
  const startedAt = Date.now();
  if (!BASE || !SERVICE_KEY) {
    await saveLog({
      req,
      endpoint: path,
      responseStatus: 503,
      responseBody: { success: false, message: "Serviço Score BW não configurado." },
      errorMessage: "SCORE_BW_SERVICE_URL ou GATEWAY_SERVICE_KEY ausentes",
      durationMs: Date.now() - startedAt,
    });
    return res.status(503).json({ success: false, message: "Serviço Score BW não configurado." });
  }
  const url = `${BASE.replace(/\/$/, "")}${path}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SERVICE_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    const text = await response.text();
    const parsedBody = parseResponseBody(text);
    await saveLog({
      req,
      endpoint: path,
      documentType: logMeta?.documentType,
      documentValue: logMeta?.documentValue,
      requestBody: body as Record<string, unknown>,
      responseStatus: response.status,
      responseBody: parsedBody,
      durationMs: Date.now() - startedAt,
    });
    if (!response.ok) {
      return res.status(response.status).send(text);
    }
    if (req.client) await recordUsage(req.client.clientId, "score-bw");
    if (isJson) {
      try {
        return res.json(JSON.parse(text));
      } catch {
        return res.type("text").send(text);
      }
    }
    const buf = Buffer.from(text, "utf-8");
    res.setHeader("Content-Type", "application/pdf");
    res.send(buf);
  } catch (err: any) {
    console.error("[Gateway] Score BW proxy:", err.message);
    await saveLog({
      req,
      endpoint: path,
      documentType: logMeta?.documentType,
      documentValue: logMeta?.documentValue,
      requestBody: body as Record<string, unknown>,
      responseStatus: 502,
      responseBody: { success: false, message: err.message || "Erro ao chamar Score BW." },
      errorMessage: err.message,
      durationMs: Date.now() - startedAt,
    });
    return res.status(502).json({ success: false, message: err.message || "Erro ao chamar Score BW." });
  }
}

router.post("/score", async (req, res) => {
  const startedAt = Date.now();
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    await saveLog({
      req,
      endpoint: "/score",
      documentType: "cpf",
      documentValue: clean || undefined,
      requestBody: { cpf: req.body?.cpf, refresh: !!req.body?.refresh },
      responseStatus: 400,
      responseBody: { success: false, message: "CPF inválido ou não enviado." },
      errorMessage: "CPF inválido",
      durationMs: Date.now() - startedAt,
    });
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  await proxy(req, res, "/score", { cpf: clean, refresh: !!req.body?.refresh }, { documentType: "cpf", documentValue: clean });
});

router.post("/score-pj", async (req, res) => {
  const startedAt = Date.now();
  const cnpj = req.body?.cnpj;
  const clean = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
  if (clean.length !== 14) {
    await saveLog({
      req,
      endpoint: "/score-pj",
      documentType: "cnpj",
      documentValue: clean || undefined,
      requestBody: { cnpj: req.body?.cnpj, refresh: !!req.body?.refresh },
      responseStatus: 400,
      responseBody: { success: false, message: "CNPJ inválido ou não enviado." },
      errorMessage: "CNPJ inválido",
      durationMs: Date.now() - startedAt,
    });
    return res.status(400).json({ success: false, message: "CNPJ inválido ou não enviado." });
  }
  await proxy(req, res, "/score-pj", { cnpj: clean, refresh: !!req.body?.refresh }, { documentType: "cnpj", documentValue: clean });
});

router.post("/pdf", async (req, res) => {
  const startedAt = Date.now();
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    await saveLog({
      req,
      endpoint: "/pdf",
      documentType: "cpf",
      documentValue: clean || undefined,
      requestBody: { cpf: req.body?.cpf },
      responseStatus: 400,
      responseBody: { success: false, message: "CPF inválido ou não enviado." },
      errorMessage: "CPF inválido",
      durationMs: Date.now() - startedAt,
    });
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  const url = `${BASE?.replace(/\/$/, "")}/pdf`;
  if (!BASE || !SERVICE_KEY) {
    await saveLog({
      req,
      endpoint: "/pdf",
      documentType: "cpf",
      documentValue: clean,
      requestBody: { cpf: clean },
      responseStatus: 503,
      responseBody: { success: false, message: "Serviço Score BW não configurado." },
      errorMessage: "SCORE_BW_SERVICE_URL ou GATEWAY_SERVICE_KEY ausentes",
      durationMs: Date.now() - startedAt,
    });
    return res.status(503).json({ success: false, message: "Serviço Score BW não configurado." });
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": SERVICE_KEY },
      body: JSON.stringify({ cpf: clean }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const text = await response.text();
      await saveLog({
        req,
        endpoint: "/pdf",
        documentType: "cpf",
        documentValue: clean,
        requestBody: { cpf: clean },
        responseStatus: response.status,
        responseBody: parseResponseBody(text),
        durationMs: Date.now() - startedAt,
      });
      return res.status(response.status).send(text);
    }
    if (req.client) await recordUsage(req.client.clientId, "score-bw");
    const buf = await response.arrayBuffer();
    await saveLog({
      req,
      endpoint: "/pdf",
      documentType: "cpf",
      documentValue: clean,
      requestBody: { cpf: clean },
      responseStatus: 200,
      responseBody: { type: "application/pdf", sizeBytes: buf.byteLength },
      durationMs: Date.now() - startedAt,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=score-bw-${clean}.pdf`);
    res.send(Buffer.from(buf));
  } catch (err: any) {
    console.error("[Gateway] Score BW PDF:", err.message);
    await saveLog({
      req,
      endpoint: "/pdf",
      documentType: "cpf",
      documentValue: clean,
      requestBody: { cpf: clean },
      responseStatus: 502,
      responseBody: { success: false, message: err.message || "Erro ao gerar PDF." },
      errorMessage: err.message,
      durationMs: Date.now() - startedAt,
    });
    res.status(502).json({ success: false, message: err.message || "Erro ao gerar PDF." });
  }
});

router.post("/pdf-pj", async (req, res) => {
  const startedAt = Date.now();
  const cnpj = req.body?.cnpj;
  const clean = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
  if (clean.length !== 14) {
    await saveLog({
      req,
      endpoint: "/pdf-pj",
      documentType: "cnpj",
      documentValue: clean || undefined,
      requestBody: { cnpj: req.body?.cnpj },
      responseStatus: 400,
      responseBody: { success: false, message: "CNPJ inválido ou não enviado." },
      errorMessage: "CNPJ inválido",
      durationMs: Date.now() - startedAt,
    });
    return res.status(400).json({ success: false, message: "CNPJ inválido ou não enviado." });
  }
  const url = `${BASE?.replace(/\/$/, "")}/pdf-pj`;
  if (!BASE || !SERVICE_KEY) {
    await saveLog({
      req,
      endpoint: "/pdf-pj",
      documentType: "cnpj",
      documentValue: clean,
      requestBody: { cnpj: clean },
      responseStatus: 503,
      responseBody: { success: false, message: "Serviço Score BW não configurado." },
      errorMessage: "SCORE_BW_SERVICE_URL ou GATEWAY_SERVICE_KEY ausentes",
      durationMs: Date.now() - startedAt,
    });
    return res.status(503).json({ success: false, message: "Serviço Score BW não configurado." });
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": SERVICE_KEY },
      body: JSON.stringify({ cnpj: clean }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const text = await response.text();
      await saveLog({
        req,
        endpoint: "/pdf-pj",
        documentType: "cnpj",
        documentValue: clean,
        requestBody: { cnpj: clean },
        responseStatus: response.status,
        responseBody: parseResponseBody(text),
        durationMs: Date.now() - startedAt,
      });
      return res.status(response.status).send(text);
    }
    if (req.client) await recordUsage(req.client.clientId, "score-bw");
    const buf = await response.arrayBuffer();
    await saveLog({
      req,
      endpoint: "/pdf-pj",
      documentType: "cnpj",
      documentValue: clean,
      requestBody: { cnpj: clean },
      responseStatus: 200,
      responseBody: { type: "application/pdf", sizeBytes: buf.byteLength },
      durationMs: Date.now() - startedAt,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=score-bw-pj-${clean}.pdf`);
    res.send(Buffer.from(buf));
  } catch (err: any) {
    console.error("[Gateway] Score BW PDF PJ:", err.message);
    await saveLog({
      req,
      endpoint: "/pdf-pj",
      documentType: "cnpj",
      documentValue: clean,
      requestBody: { cnpj: clean },
      responseStatus: 502,
      responseBody: { success: false, message: err.message || "Erro ao gerar PDF." },
      errorMessage: err.message,
      durationMs: Date.now() - startedAt,
    });
    res.status(502).json({ success: false, message: err.message || "Erro ao gerar PDF." });
  }
});

export default router;

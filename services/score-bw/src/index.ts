import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pg from "pg";
import { consultarPessoa } from "./bigdatacorp/pessoas.js";
import { consultarEmpresa } from "./bigdatacorp/empresas.js";
import { calcularScorePF, calcularScorePJ } from "./scoring/scorer.js";

const app = express();
const PORT = parseInt(process.env.PORT || "4001", 10);

const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY || process.env.API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!process.env.BDC_LOGIN || !process.env.BDC_SENHA) {
  console.error("[FATAL] BDC_LOGIN e BDC_SENHA são obrigatórios");
  process.exit(1);
}

// --- DB para logs ---
let pool: pg.Pool | null = null;
if (DATABASE_URL) {
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("supabase.com") ? { rejectUnauthorized: false } : false,
  });
  pool.on("error", (err: Error) => console.error("[DB] Pool error:", err.message));
  console.log("[score-bw] DATABASE_URL configurado — logs ativos");
} else {
  console.warn("[score-bw] DATABASE_URL não configurado — logs desativados");
}

async function saveLog(params: {
  clientIp: string;
  endpoint: string;
  documentType: "cpf" | "cnpj";
  documentValue: string;
  requestBody: Record<string, unknown>;
  responseStatus: number;
  responseBody: any;
  errorMessage?: string;
  durationMs: number;
  score?: number | null;
  hasRestrictions?: boolean;
  bdcRawDataSize?: number;
}): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO bdc_query_logs
        (client_ip, endpoint, document_type, document_value, request_body,
         response_status, response_body, error_message, duration_ms,
         score, has_restrictions, bdc_raw_data_size, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [
        params.clientIp,
        params.endpoint,
        params.documentType,
        params.documentValue,
        JSON.stringify(params.requestBody),
        params.responseStatus,
        JSON.stringify(params.responseBody),
        params.errorMessage ?? null,
        params.durationMs,
        params.score ?? null,
        params.hasRestrictions ?? null,
        params.bdcRawDataSize ?? null,
      ]
    );
  } catch (err: any) {
    console.error("[score-bw] Erro ao salvar log:", err.message);
  }
}

async function ensureLogsTable(): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bdc_query_logs (
        id          BIGSERIAL PRIMARY KEY,
        client_ip   VARCHAR(64),
        endpoint    VARCHAR(128) NOT NULL,
        document_type VARCHAR(8) NOT NULL,
        document_value VARCHAR(32) NOT NULL,
        request_body  JSONB,
        response_status INTEGER NOT NULL,
        response_body   JSONB,
        error_message   VARCHAR(512),
        duration_ms     INTEGER NOT NULL DEFAULT 0,
        score           INTEGER,
        has_restrictions BOOLEAN,
        bdc_raw_data_size INTEGER,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS bdc_logs_doc_idx ON bdc_query_logs(document_value, created_at DESC)
    `);
    console.log("[score-bw] Tabela bdc_query_logs verificada");
  } catch (err: any) {
    console.error("[score-bw] Erro ao criar tabela de logs:", err.message);
  }
}

app.set("trust proxy", 1);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "score-bw", timestamp: new Date().toISOString() });
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "score-bw" });
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip ?? req.socket?.remoteAddress ?? "unknown"),
  message: { success: false, message: "Limite de requisições atingido. Tente em 1 minuto." },
});
app.use(limiter);

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-api-key"] as string;
  if (!PLATFORM_API_KEY || key !== PLATFORM_API_KEY) {
    return res.status(401).json({ success: false, message: "X-API-Key inválida ou não enviada." });
  }
  next();
}

// --- Score PF ---
app.post("/score", requireApiKey, async (req, res) => {
  const startedAt = Date.now();
  const cpf = req.body?.cpf;
  const refresh = !!req.body?.refresh;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  const clientIp = req.ip ?? "unknown";

  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }

  try {
    const result = await consultarPessoa(clean, refresh);
    const scored = calcularScorePF(result);
    const durationMs = Date.now() - startedAt;

    const responseBody = {
      success: true,
      cpf: clean,
      score: scored.score,
      score_label: scored.scoreLabel,
      has_restrictions: scored.hasRestrictions,
      alertas: scored.alertas,
      detalhes: scored.detalhes,
      from_cache: result.fromCache,
      data_consulta: new Date().toLocaleDateString("pt-BR"),
      raw: result.raw,
    };

    await saveLog({
      clientIp,
      endpoint: "/score",
      documentType: "cpf",
      documentValue: clean,
      requestBody: { cpf: clean, refresh },
      responseStatus: 200,
      responseBody,
      durationMs,
      score: scored.score,
      hasRestrictions: scored.hasRestrictions,
      bdcRawDataSize: JSON.stringify(result.raw).length,
    });

    console.log(`[score-bw] CPF ${clean} → score=${scored.score} (${scored.scoreLabel}) em ${durationMs}ms`);
    return res.json(responseBody);
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.error(`[score-bw] Erro CPF ${clean}:`, err.message);

    await saveLog({
      clientIp,
      endpoint: "/score",
      documentType: "cpf",
      documentValue: clean,
      requestBody: { cpf: clean, refresh },
      responseStatus: 502,
      responseBody: { success: false, message: err.message },
      errorMessage: err.message,
      durationMs,
    });

    return res.status(502).json({ success: false, message: err.message || "Erro ao consultar Big Data Corp." });
  }
});

// --- Score PJ ---
app.post("/score-pj", requireApiKey, async (req, res) => {
  const startedAt = Date.now();
  const cnpj = req.body?.cnpj;
  const refresh = !!req.body?.refresh;
  const clean = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
  const clientIp = req.ip ?? "unknown";

  if (clean.length !== 14) {
    return res.status(400).json({ success: false, message: "CNPJ inválido ou não enviado." });
  }

  try {
    const result = await consultarEmpresa(clean, refresh);
    const scored = calcularScorePJ(result);
    const durationMs = Date.now() - startedAt;

    const responseBody = {
      success: true,
      cnpj: clean,
      score: scored.score,
      score_label: scored.scoreLabel,
      has_restrictions: scored.hasRestrictions,
      alertas: scored.alertas,
      detalhes: scored.detalhes,
      from_cache: result.fromCache,
      data_consulta: new Date().toLocaleDateString("pt-BR"),
      raw: result.raw,
    };

    await saveLog({
      clientIp,
      endpoint: "/score-pj",
      documentType: "cnpj",
      documentValue: clean,
      requestBody: { cnpj: clean, refresh },
      responseStatus: 200,
      responseBody,
      durationMs,
      score: scored.score,
      hasRestrictions: scored.hasRestrictions,
      bdcRawDataSize: JSON.stringify(result.raw).length,
    });

    console.log(`[score-bw] CNPJ ${clean} → score=${scored.score} (${scored.scoreLabel}) em ${durationMs}ms`);
    return res.json(responseBody);
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.error(`[score-bw] Erro CNPJ ${clean}:`, err.message);

    await saveLog({
      clientIp,
      endpoint: "/score-pj",
      documentType: "cnpj",
      documentValue: clean,
      requestBody: { cnpj: clean, refresh },
      responseStatus: 502,
      responseBody: { success: false, message: err.message },
      errorMessage: err.message,
      durationMs,
    });

    return res.status(502).json({ success: false, message: err.message || "Erro ao consultar Big Data Corp." });
  }
});

// --- PDF PF (retorna raw data formatado, sem geração de PDF por enquanto) ---
app.post("/pdf", requireApiKey, async (req, res) => {
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  try {
    const result = await consultarPessoa(clean);
    const scored = calcularScorePF(result);
    return res.json({ success: true, cpf: clean, score: scored.score, detalhes: scored.detalhes, raw: result.raw });
  } catch (err: any) {
    return res.status(502).json({ success: false, message: err.message });
  }
});

// --- PDF PJ ---
app.post("/pdf-pj", requireApiKey, async (req, res) => {
  const cnpj = req.body?.cnpj;
  const clean = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
  if (clean.length !== 14) {
    return res.status(400).json({ success: false, message: "CNPJ inválido ou não enviado." });
  }
  try {
    const result = await consultarEmpresa(clean);
    const scored = calcularScorePJ(result);
    return res.json({ success: true, cnpj: clean, score: scored.score, detalhes: scored.detalhes, raw: result.raw });
  } catch (err: any) {
    return res.status(502).json({ success: false, message: err.message });
  }
});

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[score-bw] listening on port ${PORT}`);
  await ensureLogsTable();
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

process.on("uncaughtException", (err) => console.error("[score-bw] uncaughtException:", err.message));
process.on("unhandledRejection", (reason) => console.error("[score-bw] unhandledRejection:", reason));

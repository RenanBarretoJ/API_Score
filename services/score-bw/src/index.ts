import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = parseInt(process.env.PORT || "4001", 10);

const SCORE_BW_BASE_URL = process.env.SCORE_BW_BASE_URL;
const SCORE_BW_API_KEY = process.env.SCORE_BW_API_KEY;
const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY || process.env.API_KEY;

if (!SCORE_BW_BASE_URL || !SCORE_BW_API_KEY) {
  console.error("[FATAL] Defina SCORE_BW_BASE_URL e SCORE_BW_API_KEY");
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
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

async function proxyPost(path: string, body: object, res: Response) {
  const url = `${SCORE_BW_BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SCORE_BW_API_KEY!,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).send(text);
    }
    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.type("text").send(text);
    }
  } catch (err: any) {
    console.error(`[Score BW proxy] ${path}:`, err.message);
    return res.status(502).json({
      success: false,
      message: err.message || "Erro ao comunicar com o serviço Score BW.",
    });
  }
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "score-bw", timestamp: new Date().toISOString() });
});

app.post("/score", requireApiKey, async (req, res) => {
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  await proxyPost("/api/score", { cpf: clean, refresh: !!req.body?.refresh }, res);
});

app.post("/score-pj", requireApiKey, async (req, res) => {
  const cnpj = req.body?.cnpj;
  const clean = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
  if (clean.length !== 14) {
    return res.status(400).json({ success: false, message: "CNPJ inválido ou não enviado." });
  }
  await proxyPost("/api/score-pj", { cnpj: clean, refresh: !!req.body?.refresh }, res);
});

app.post("/pdf", requireApiKey, async (req, res) => {
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  const url = `${SCORE_BW_BASE_URL}/api/pdf-long`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SCORE_BW_API_KEY!,
      },
      body: JSON.stringify({ cpf: clean }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
    const buf = await response.arrayBuffer();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=score-bw-${clean}.pdf`);
    res.send(Buffer.from(buf));
  } catch (err: any) {
    console.error("[Score BW proxy] /pdf:", err.message);
    res.status(502).json({ success: false, message: err.message || "Erro ao gerar PDF." });
  }
});

app.post("/pdf-pj", requireApiKey, async (req, res) => {
  const cnpj = req.body?.cnpj;
  const clean = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
  if (clean.length !== 14) {
    return res.status(400).json({ success: false, message: "CNPJ inválido ou não enviado." });
  }
  const url = `${SCORE_BW_BASE_URL}/api/pdf-pj`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SCORE_BW_API_KEY!,
      },
      body: JSON.stringify({ cnpj: clean }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
    const buf = await response.arrayBuffer();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=score-bw-pj-${clean}.pdf`);
    res.send(Buffer.from(buf));
  } catch (err: any) {
    console.error("[Score BW proxy] /pdf-pj:", err.message);
    res.status(502).json({ success: false, message: err.message || "Erro ao gerar PDF." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[score-bw] listening on port ${PORT}`);
});

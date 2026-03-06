import { Router, Request, Response } from "express";
import { recordUsage } from "../middleware/metering.js";

const router = Router();
const BASE = process.env.SCORE_BW_SERVICE_URL;
const SERVICE_KEY = process.env.GATEWAY_SERVICE_KEY;

if (!BASE || !SERVICE_KEY) {
  console.warn("[Gateway] SCORE_BW_SERVICE_URL ou GATEWAY_SERVICE_KEY não definidos; rotas Score BW desativadas.");
}

async function proxy(
  req: Request,
  res: Response,
  path: string,
  body: object,
  isJson = true
) {
  if (!BASE || !SERVICE_KEY) {
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
    return res.status(502).json({ success: false, message: err.message || "Erro ao chamar Score BW." });
  }
}

router.post("/score", async (req, res) => {
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  await proxy(req, res, "/score", { cpf: clean, refresh: !!req.body?.refresh });
});

router.post("/score-pj", async (req, res) => {
  const cnpj = req.body?.cnpj;
  const clean = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
  if (clean.length !== 14) {
    return res.status(400).json({ success: false, message: "CNPJ inválido ou não enviado." });
  }
  await proxy(req, res, "/score-pj", { cnpj: clean, refresh: !!req.body?.refresh });
});

router.post("/pdf", async (req, res) => {
  const cpf = req.body?.cpf;
  const clean = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (clean.length !== 11) {
    return res.status(400).json({ success: false, message: "CPF inválido ou não enviado." });
  }
  const url = `${BASE?.replace(/\/$/, "")}/pdf`;
  if (!BASE || !SERVICE_KEY) {
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
      return res.status(response.status).send(await response.text());
    }
    if (req.client) await recordUsage(req.client.clientId, "score-bw");
    const buf = await response.arrayBuffer();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=score-bw-${clean}.pdf`);
    res.send(Buffer.from(buf));
  } catch (err: any) {
    console.error("[Gateway] Score BW PDF:", err.message);
    res.status(502).json({ success: false, message: err.message || "Erro ao gerar PDF." });
  }
});

router.post("/pdf-pj", async (req, res) => {
  const cnpj = req.body?.cnpj;
  const clean = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
  if (clean.length !== 14) {
    return res.status(400).json({ success: false, message: "CNPJ inválido ou não enviado." });
  }
  const url = `${BASE?.replace(/\/$/, "")}/pdf-pj`;
  if (!BASE || !SERVICE_KEY) {
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
      return res.status(response.status).send(await response.text());
    }
    if (req.client) await recordUsage(req.client.clientId, "score-bw");
    const buf = await response.arrayBuffer();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=score-bw-pj-${clean}.pdf`);
    res.send(Buffer.from(buf));
  } catch (err: any) {
    console.error("[Gateway] Score BW PDF PJ:", err.message);
    res.status(502).json({ success: false, message: err.message || "Erro ao gerar PDF." });
  }
});

export default router;

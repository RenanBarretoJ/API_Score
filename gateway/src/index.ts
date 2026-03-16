import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { requireApiKey } from "./middleware/auth.js";
import { checkQuota } from "./middleware/metering.js";
import { requireAdmin } from "./middleware/adminAuth.js";
import scoreBwRoutes from "./routes/score-bw.js";
import meRoutes from "./routes/me.js";
import adminRoutes from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// Necessário para req.ip correto atrás do proxy reverso do Render
app.set("trust proxy", 1);

// ─── Rotas que não precisam de nenhum middleware ────────────────────────────
// /health e / ANTES de tudo — se qualquer middleware crashar, o health ainda responde
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gateway", timestamp: new Date().toISOString() });
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "gateway" });
});
// ────────────────────────────────────────────────────────────────────────────

// CORS — permite que o frontend (browser) chame a API
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, X-Admin-Key");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.ip ?? req.socket?.remoteAddress ?? "unknown"),
    message: { success: false, message: "Muitas requisições. Tente em 1 minuto." },
  })
);

// ─── Rotas autenticadas ─────────────────────────────────────────────────────
app.use("/v1/score-bw", requireApiKey, checkQuota, scoreBwRoutes);
app.use("/v1/me", requireApiKey, meRoutes);
app.use("/admin", requireAdmin, adminRoutes);

app.get("/dev", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/dev.html"));
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Rota não encontrada." });
});
// ────────────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[gateway] listening on port ${PORT}`);
  console.log(`[gateway] DATABASE_URL: ${process.env.DATABASE_URL ? "ok" : "NÃO DEFINIDA"}`);
  console.log(`[gateway] SCORE_BW_SERVICE_URL: ${process.env.SCORE_BW_SERVICE_URL ?? "não definida"}`);
});

// Node.js fecha keep-alive após 5s por padrão.
// Render's load balancer mantém conexões por 60s.
// Sem isso, Render tenta reusar conexões já fechadas e retorna "Not Found".
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

process.on("uncaughtException", (err) => {
  console.error("[gateway] Erro não capturado:", err.message, err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[gateway] Promise rejeitada não tratada:", reason);
  process.exit(1);
});

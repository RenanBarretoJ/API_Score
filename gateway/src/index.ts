import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
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

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { success: false, message: "Muitas requisições. Tente em 1 minuto." },
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gateway", timestamp: new Date().toISOString() });
});

app.use("/v1/score-bw", requireApiKey, checkQuota, scoreBwRoutes);
app.use("/v1/me", requireApiKey, meRoutes);
app.use("/admin", requireAdmin, adminRoutes);

app.get("/dev", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/dev.html"));
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Rota não encontrada." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[gateway] listening on port ${PORT}`);
});

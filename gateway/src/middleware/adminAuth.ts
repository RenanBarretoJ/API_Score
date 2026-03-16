import { Request, Response, NextFunction } from "express";

const ADMIN_KEY = process.env.ADMIN_SECRET;

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_KEY) {
    return res.status(503).json({ success: false, message: "Admin não configurado (ADMIN_SECRET)." });
  }
  const key = req.headers["x-admin-key"] as string;
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, message: "Header X-Admin-Key inválido ou ausente." });
  }
  next();
}

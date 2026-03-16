import crypto from "crypto";

const KEY_PREFIX = "bw_live_";

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = KEY_PREFIX + crypto.randomBytes(18).toString("base64url");
  return { raw, prefix: raw.slice(0, 20), hash: hashKey(raw) };
}

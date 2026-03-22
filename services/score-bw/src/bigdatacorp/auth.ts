const BDC_BASE_URL = "https://plataforma.bigdatacorp.com.br";

interface TokenCache {
  token: string;
  tokenId: string;
  expiresAt: number;
}

let cached: TokenCache | null = null;

export async function getBDCToken(): Promise<{ token: string; tokenId: string }> {
  if (cached && Date.now() < cached.expiresAt) {
    return { token: cached.token, tokenId: cached.tokenId };
  }

  const login = process.env.BDC_LOGIN;
  const senha = process.env.BDC_SENHA;

  if (!login || !senha) {
    throw new Error("BDC_LOGIN ou BDC_SENHA não configurados");
  }

  console.log("[BDC Auth] Gerando novo token JWT...");

  const response = await fetch(`${BDC_BASE_URL}/tokens/gerar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "AccessToken": login,
      "TokenSecret": senha,
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BDC Auth falhou: ${response.status} - ${text}`);
  }

  const data = await response.json() as any;
  const token = data.token || data.Token || data.access_token;
  const tokenId = data.tokenId || data.TokenId || data.token_id || "";

  if (!token) {
    throw new Error(`BDC Auth: token não retornado. Resposta: ${JSON.stringify(data)}`);
  }

  // Cache por 20h (token válido 24h)
  cached = {
    token,
    tokenId,
    expiresAt: Date.now() + 20 * 60 * 60 * 1000,
  };

  console.log(`[BDC Auth] Token gerado com sucesso (TokenID: ${tokenId || "N/A"})`);
  return { token, tokenId };
}

export function clearBDCTokenCache(): void {
  cached = null;
}

export { BDC_BASE_URL };

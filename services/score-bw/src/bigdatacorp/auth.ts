const BDC_BASE_URL = "https://plataforma.bigdatacorp.com.br";

interface TokenCache {
  token: string;
  tokenId: string;
  expiresAt: number;
}

let cached: TokenCache | null = null;

export async function getBDCToken(): Promise<{ token: string; tokenId: string }> {
  // 1) Cache em memória ainda válido
  if (cached && Date.now() < cached.expiresAt) {
    return { token: cached.token, tokenId: cached.tokenId };
  }

  // 2) Token estático via variável de ambiente (gerado pelo painel BDC)
  const staticToken = process.env.BDC_TOKEN;
  const staticTokenId = process.env.BDC_TOKEN_ID || "";

  if (staticToken) {
    cached = {
      token: staticToken,
      tokenId: staticTokenId,
      expiresAt: Date.now() + 20 * 60 * 60 * 1000,
    };
    console.log("[BDC Auth] Usando token estático (BDC_TOKEN)");
    return { token: staticToken, tokenId: staticTokenId };
  }

  // 3) Geração dinâmica via login/senha
  const login = process.env.BDC_LOGIN;
  const senha = process.env.BDC_SENHA;

  if (!login || !senha) {
    throw new Error("Configure BDC_TOKEN ou (BDC_LOGIN + BDC_SENHA)");
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
  const token = data.token || data.Token || data.access_token || data.AccessToken;
  const tokenId = data.tokenId || data.TokenId || data.token_id || data.id || "";

  if (!token) {
    throw new Error(`BDC Auth: token não retornado. Resposta: ${JSON.stringify(data)}`);
  }

  cached = {
    token,
    tokenId,
    expiresAt: Date.now() + 20 * 60 * 60 * 1000,
  };

  console.log(`[BDC Auth] Token gerado (TokenID: ${tokenId || "N/A"})`);
  return { token, tokenId };
}

export function clearBDCTokenCache(): void {
  cached = null;
}

export { BDC_BASE_URL };

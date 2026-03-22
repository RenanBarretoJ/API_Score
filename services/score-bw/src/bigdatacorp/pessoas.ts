import { getBDCToken, BDC_BASE_URL } from "./auth.js";

const DATASETS_PF = [
  "basic_data",
  "financial_data",
  "collections",
  "processes",
  "kyc",
  "flags_and_features",
  "media_profile_and_exposure",
  "vehicles",
  "financial_risk",
  "online_betting_propensity",
];

export interface BDCPessoaResult {
  raw: any;
  flattened: Record<string, any>;
  fromCache: boolean;
}

function flattenObject(obj: any, prefix = "", result: Record<string, any> = {}): Record<string, any> {
  if (obj === null || obj === undefined) return result;

  for (const key of Object.keys(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (Array.isArray(value)) {
      result[newKey] = value;
      result[`${newKey}.Count`] = value.length;
    } else if (typeof value === "object" && value !== null) {
      flattenObject(value, newKey, result);
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

export async function consultarPessoa(cpf: string, refresh = false): Promise<BDCPessoaResult> {
  const clean = cpf.replace(/\D/g, "");
  const { token, tokenId } = await getBDCToken();

  console.log(`[BDC Pessoas] Consultando CPF ${clean} (datasets: ${DATASETS_PF.length})`);

  const body: any = {
    q: `doc{${clean}}`,
    datasets: DATASETS_PF.join(","),
  };

  if (refresh) {
    body.Refresh = true;
  }

  const response = await fetch(`${BDC_BASE_URL}/pessoas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "AccessToken": token,
      "TokenId": tokenId,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BDC Pessoas: ${response.status} - ${text}`);
  }

  const raw = await response.json() as any;
  const resultItem = raw?.Result?.[0] ?? {};

  console.log(`[BDC Pessoas] CPF ${clean} consultado. QueryId: ${raw?.QueryId ?? "N/A"}`);

  // Flatten a partir do primeiro item do Result (onde estão os dados da pessoa)
  const flattened = flattenObject(resultItem);

  return { raw, flattened, fromCache: false };
}

import { getBDCToken, BDC_BASE_URL } from "./auth.js";

const DATASETS_PJ = [
  "basic_data",
  "registration_data",
  "financial_data",
  "processes",
  "kyc",
  "financial_risk",
  "owners_kyc",
  "dynamic_qsa_data",
];

export interface BDCEmpresaResult {
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

export async function consultarEmpresa(cnpj: string, refresh = false): Promise<BDCEmpresaResult> {
  const clean = cnpj.replace(/\D/g, "");
  const { token, tokenId } = await getBDCToken();

  console.log(`[BDC Empresas] Consultando CNPJ ${clean} (datasets: ${DATASETS_PJ.length})`);

  const body: any = {
    q: `doc{${clean}}`,
    datasets: DATASETS_PJ.join(","),
  };

  if (refresh) {
    body.Refresh = true;
  }

  const response = await fetch(`${BDC_BASE_URL}/empresas`, {
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
    throw new Error(`BDC Empresas: ${response.status} - ${text}`);
  }

  const raw = await response.json() as any;

  console.log(`[BDC Empresas] CNPJ ${clean} consultado. Status: ${raw?.Status?.[0]?.Code ?? "N/A"}`);

  const flattened = flattenObject(raw);

  return { raw, flattened, fromCache: false };
}

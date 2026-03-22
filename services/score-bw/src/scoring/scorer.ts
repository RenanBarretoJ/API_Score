/**
 * Scorer PF — calcula score 0-1000 a partir dos dados da Big Data Corp.
 *
 * Pesos baseados nos datasets:
 *  - financial_risk      → risco financeiro principal
 *  - collections         → inadimplência ativa
 *  - processes           → processos judiciais
 *  - kyc                 → PEP / sanções
 *  - financial_data      → renda / patrimônio
 *  - online_betting      → apostas online (fator de risco)
 *  - flags_and_features  → scores internos BDC (quando disponíveis)
 */

export interface ScorePFInput {
  raw: any;
  flattened: Record<string, any>;
}

export interface ScorePJInput {
  raw: any;
  flattened: Record<string, any>;
}

export interface ScoreResult {
  score: number;               // 0-1000
  scoreLabel: string;          // "Muito Alto", "Alto", "Médio", "Baixo", "Muito Baixo"
  hasRestrictions: boolean;
  alertas: {
    alerta_geral: boolean;
    alerta_pep: boolean;
    alerta_sancao: boolean;
    alerta_obito: boolean;
    alerta_processos: boolean;
    alerta_inadimplencia: boolean;
    alerta_apostas: boolean;
  };
  detalhes: {
    nome?: string;
    idade?: number | null;
    renda_estimada?: number | null;
    score_bdc?: number | null;
    total_processos?: number;
    total_cobrancas?: number;
    pep?: boolean;
    obito?: boolean;
  };
}

function safeNum(val: any, fallback = 0): number {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function safeBool(val: any): boolean {
  if (typeof val === "boolean") return val;
  if (val === 1 || val === "true" || val === "True") return true;
  return false;
}

export function calcularScorePF(input: ScorePFInput): ScoreResult {
  const f = input.flattened;
  const raw = input.raw;

  // --- Extrair campos relevantes ---

  // Score interno da BDC (flags_and_features) — se disponível, usa como base
  const bdcScore = safeNum(
    f["FlagsAndFeatures.FinancialRiskScore"] ??
    f["FlagsAndFeatures.Score"] ??
    f["FinancialRisk.Score"] ??
    null, -1
  );

  const nome = f["BasicData.Name"] || f["BasicData.TaxIdName"] || "";
  const idade = safeNum(f["BasicData.Age"] ?? null, -1);
  const obito = safeBool(f["BasicData.DeathIndication"] ?? f["BasicData.IsDead"]);

  // Inadimplência / Cobranças
  const totalCobrancas = safeNum(
    f["Collections.TotalCount"] ??
    f["Collections.Count"] ??
    raw?.Collections?.TotalCount ?? 0
  );

  // Processos
  const totalProcessos = safeNum(
    f["Processes.TotalCount"] ??
    f["Processes.Count"] ??
    raw?.Processes?.TotalCount ?? 0
  );
  const processosReu = safeNum(
    f["Processes.TotalAsDefendant"] ??
    f["Processes.TotalCountAsDefendant"] ?? 0
  );

  // KYC / PEP / Sanções
  const isPEP = safeBool(
    f["Kyc.IsCurrentlyPEP"] ??
    f["KycData.IsCurrentlyPEP"] ??
    raw?.Kyc?.IsCurrentlyPEP
  );
  const isSancionado = safeBool(
    f["Kyc.IsCurrentlySanctioned"] ??
    f["KycData.IsCurrentlySanctioned"] ??
    raw?.Kyc?.IsCurrentlySanctioned
  );

  // Renda
  const rendaEstimada = safeNum(
    f["FinancialData.EstimatedIncome"] ??
    f["FinancialData.Income"] ??
    raw?.FinancialData?.EstimatedIncome ?? 0
  );

  // Apostas online (passagens nos últimos 30/90 dias)
  const apostas30d = safeNum(
    f["OnlineBettingPropensity.Passagens30Days"] ??
    f["OnlineBettingPropensity.Passagens30d"] ?? 0
  );
  const apostas90d = safeNum(
    f["OnlineBettingPropensity.Passagens90Days"] ??
    f["OnlineBettingPropensity.Passagens90d"] ?? 0
  );

  // --- Cálculo do score ---

  // Se BDC tem score nativo entre 0-1000, usa como base
  let score: number;

  if (bdcScore >= 0 && bdcScore <= 1000) {
    score = bdcScore;
  } else {
    // Começa em 700 (neutro) e vai ajustando
    score = 700;

    // Penalidades
    if (obito) score = 0;
    if (isSancionado) score -= 300;
    if (isPEP) score -= 100;
    if (totalCobrancas > 0) score -= Math.min(totalCobrancas * 30, 200);
    if (processosReu > 0) score -= Math.min(processosReu * 20, 150);
    if (totalProcessos > 5) score -= 50;
    if (apostas30d > 3) score -= 50;
    if (apostas90d > 10) score -= 30;

    // Bônus
    if (rendaEstimada > 10000) score += 50;
    if (rendaEstimada > 30000) score += 50;
    if (totalCobrancas === 0 && totalProcessos === 0) score += 80;

    score = Math.max(0, Math.min(1000, Math.round(score)));
  }

  const alertaGeral = obito || isSancionado || isPEP || totalCobrancas > 0 || processosReu > 2;

  return {
    score,
    scoreLabel: labelFromScore(score),
    hasRestrictions: alertaGeral,
    alertas: {
      alerta_geral: alertaGeral,
      alerta_pep: isPEP,
      alerta_sancao: isSancionado,
      alerta_obito: obito,
      alerta_processos: totalProcessos > 0,
      alerta_inadimplencia: totalCobrancas > 0,
      alerta_apostas: apostas30d > 3,
    },
    detalhes: {
      nome,
      idade: idade >= 0 ? idade : null,
      renda_estimada: rendaEstimada > 0 ? rendaEstimada : null,
      score_bdc: bdcScore >= 0 ? bdcScore : null,
      total_processos: totalProcessos,
      total_cobrancas: totalCobrancas,
      pep: isPEP,
      obito,
    },
  };
}

export function calcularScorePJ(input: ScorePJInput): ScoreResult {
  const f = input.flattened;
  const raw = input.raw;

  const nome = f["BasicData.OfficialName"] ?? f["BasicData.TradeName"] ?? f["BasicData.Name"] ?? "";

  const totalProcessos = safeNum(
    f["Processes.TotalCount"] ??
    f["Processes.Count"] ??
    raw?.Processes?.TotalCount ?? 0
  );

  const isSancionado = safeBool(
    f["Kyc.IsCurrentlySanctioned"] ??
    f["KycData.IsCurrentlySanctioned"] ??
    raw?.Kyc?.IsCurrentlySanctioned
  );

  const socios = raw?.DynamicQsaData?.PartnerData || [];
  const sociosPEP = socios.filter((s: any) =>
    safeBool(s?.KycData?.IsCurrentlyPEP ?? s?.Kyc?.IsCurrentlyPEP)
  ).length;

  let score = 700;

  if (isSancionado) score -= 300;
  if (sociosPEP > 0) score -= Math.min(sociosPEP * 80, 200);
  if (totalProcessos > 0) score -= Math.min(totalProcessos * 15, 150);
  if (totalProcessos === 0 && !isSancionado) score += 100;

  score = Math.max(0, Math.min(1000, Math.round(score)));

  const alertaGeral = isSancionado || sociosPEP > 0 || totalProcessos > 5;

  return {
    score,
    scoreLabel: labelFromScore(score),
    hasRestrictions: alertaGeral,
    alertas: {
      alerta_geral: alertaGeral,
      alerta_pep: sociosPEP > 0,
      alerta_sancao: isSancionado,
      alerta_obito: false,
      alerta_processos: totalProcessos > 0,
      alerta_inadimplencia: false,
      alerta_apostas: false,
    },
    detalhes: {
      nome,
      idade: null,
      renda_estimada: null,
      score_bdc: null,
      total_processos: totalProcessos,
      total_cobrancas: 0,
      pep: sociosPEP > 0,
      obito: false,
    },
  };
}

function labelFromScore(score: number): string {
  if (score >= 800) return "Muito Alto";
  if (score >= 600) return "Alto";
  if (score >= 400) return "Médio";
  if (score >= 200) return "Baixo";
  return "Muito Baixo";
}

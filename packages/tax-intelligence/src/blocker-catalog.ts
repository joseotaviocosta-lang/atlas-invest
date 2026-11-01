/**
 * Canonical-code → intelligence-category catalog (ADR-311 §5).
 *
 * Every entry reuses an existing canonical reason/quality code. Unknown codes
 * fall back to OTHER_CANONICAL_BLOCKER — never invented semantics.
 * Priority tiers: P1 blocks current calculation (100), P2 owner-actionable
 * (60), P3 external-document dependency (40), P4 historical/non-blocking (20),
 * P5 informational (10).
 */
import type { CtiActionId, CtiBlockerCategory } from './types';

export interface BlockerCatalogEntry {
  readonly category: CtiBlockerCategory;
  readonly title: string;
  readonly explanation: string;
  readonly actionId: CtiActionId;
  readonly priority: number;
}

function entry(
  category: CtiBlockerCategory,
  title: string,
  explanation: string,
  actionId: CtiActionId,
  priority: number,
): BlockerCatalogEntry {
  return Object.freeze({ category, title, explanation, actionId, priority });
}

export const BLOCKER_CATALOG: Readonly<Record<string, BlockerCatalogEntry>> = Object.freeze({
  MISSING_RULE_SET: entry(
    'MISSING_RULE_SET',
    'Sem regra fiscal vigente',
    'Não há conjunto de regras fiscais vigente para esta apuração. O Atlas não calcula imposto sem regra oficial verificada.',
    'OPEN_TAX_QUALITY',
    100,
  ),
  AMBIGUOUS_RULE_SET: entry(
    'MISSING_RULE_SET',
    'Regra fiscal ambígua',
    'Há sobreposição de vigência entre conjuntos de regras. A apuração permanece bloqueada até a configuração ser corrigida.',
    'OPEN_TAX_QUALITY',
    100,
  ),
  UNKNOWN_COST_BASIS: entry(
    'COST_BASIS_INCOMPLETE',
    'Custo de aquisição incompleto',
    'Há posições com custo de aquisição desconhecido. Sem esse custo, o Atlas não calcula o resultado tributável com segurança.',
    'REVIEW_POSITIONS',
    100,
  ),
  MISSING_CANONICAL_COST_BASIS: entry(
    'COST_BASIS_INCOMPLETE',
    'Custo de aquisição incompleto',
    'Há posições com custo de aquisição desconhecido. Sem esse custo, o Atlas não calcula o resultado tributável com segurança.',
    'REVIEW_POSITIONS',
    100,
  ),
  UNKNOWN_OPENING_COST_BASIS: entry(
    'COST_BASIS_INCOMPLETE',
    'Custo de abertura desconhecido',
    'O custo histórico de posições anteriores ao livro está sem comprovação. Confirme a posição de abertura na apuração anual.',
    'OPEN_ANNUAL_READINESS',
    60,
  ),
  INCOMPLETE_ANNUAL_POSITION_COST: entry(
    'COST_BASIS_INCOMPLETE',
    'Custo de encerramento incompleto',
    'O custo histórico de 31/12 está incompleto para este ativo. A declaração anual exige o custo comprovado.',
    'OPEN_ANNUAL_READINESS',
    60,
  ),
  INCOMPLETE_WITHHOLDING_CLASSIFICATION: entry(
    'MISSING_WITHHOLDING_DATA',
    'Retenção na fonte sem classificação',
    'Há retenções (IRRF) cuja categoria não pode ser determinada. A apuração permanece bloqueada até a classificação.',
    'OPEN_TAX_QUALITY',
    60,
  ),
  MISSING_WITHHOLDING_REPORT: entry(
    'MISSING_WITHHOLDING_DATA',
    'Informe de retenção ausente',
    'Falta o informe de rendimentos/retencão para comprovar valores retidos na fonte.',
    'OPEN_TAX_QUALITY',
    60,
  ),
  MISSING_WITHHOLDING_INPUT: entry(
    'MISSING_WITHHOLDING_DATA',
    'Dado de retenção ausente',
    'Falta registrar a retenção na fonte desta apuração. Sem ela, o cálculo não pode ser concluído.',
    'OPEN_TAX_QUALITY',
    60,
  ),
  UNVERIFIED_WITHHOLDING: entry(
    'MISSING_WITHHOLDING_DATA',
    'Retenção não verificada',
    'Os valores de retenção informados ainda não foram verificados contra documento.',
    'OPEN_TAX_QUALITY',
    60,
  ),
  FII_ELIGIBILITY_UNVERIFIED: entry(
    'MISSING_FII_TAX_DATA',
    'Condição de isenção de FII não verificada',
    'Os requisitos de isenção de rendimentos de FII ainda não foram confirmados.',
    'OPEN_ANNUAL_READINESS',
    60,
  ),
  UNKNOWN_ASSET_TAX_CLASSIFICATION: entry(
    'UNKNOWN_OPERATION_CLASSIFICATION',
    'Classificação fiscal desconhecida',
    'Há ativos cuja categoria fiscal não pôde ser determinada. Revise os dados cadastrais do ativo.',
    'OPEN_DATA_QUALITY',
    60,
  ),
  UNKNOWN_ASSET_TAX_CATEGORY: entry(
    'UNKNOWN_OPERATION_CLASSIFICATION',
    'Classificação fiscal desconhecida',
    'Há ativos cuja categoria fiscal não pôde ser determinada. Revise os dados cadastrais do ativo.',
    'OPEN_DATA_QUALITY',
    60,
  ),
  MISSING_INSTITUTION_IDENTITY: entry(
    'UNKNOWN_OPERATION_CLASSIFICATION',
    'Corretora não identificada',
    'Há operações sem identificação da instituição intermediária. Informe a corretora responsável.',
    'OPEN_DATA_QUALITY',
    60,
  ),
  EQUITY_MATCHER_FAILED: entry(
    'UNKNOWN_OPERATION_CLASSIFICATION',
    'Classificação de operações falhou',
    'O classificador de operações não conseguiu concluir. A apuração permanece bloqueada.',
    'OPEN_DATA_QUALITY',
    60,
  ),
  ELECTION_REQUIRED: entry(
    'EVIDENCE_REQUIRED',
    'Eleição de compensação pendente',
    'Falta registrar a eleição de compensação de prejuízos desta competência.',
    'OPEN_TAX',
    60,
  ),
  TRANSITION_EVIDENCE_REQUIRED: entry(
    'EVIDENCE_REQUIRED',
    'Evidência de transição pendente',
    'Falta comprovação documental da regra de transição aplicável a este rendimento.',
    'OPEN_ANNUAL_READINESS',
    60,
  ),
  PENDING_TAXPAYER_CONFIRMATIONS: entry(
    'EVIDENCE_REQUIRED',
    'Confirmações do contribuinte pendentes',
    'Há itens aguardando sua confirmação explícita na apuração anual.',
    'OPEN_ANNUAL_READINESS',
    60,
  ),
  STALE_TAXPAYER_CONFIRMATIONS: entry(
    'EVIDENCE_REQUIRED',
    'Confirmações desatualizadas',
    'Dados subjacentes mudaram após sua confirmação. Revalide os itens indicados.',
    'OPEN_ANNUAL_READINESS',
    60,
  ),
  PENDING_DARF_PAYMENT_EVIDENCE: entry(
    'EVIDENCE_REQUIRED',
    'Evidência de pagamento pendente',
    'Falta registrar a evidência de pagamento deste DARF.',
    'OPEN_OBLIGATION',
    60,
  ),
  PRIOR_COMPETENCE_BLOCKED: entry(
    'OTHER_CANONICAL_BLOCKER',
    'Competência anterior bloqueada',
    'Uma competência anterior está bloqueada e impede a conclusão desta apuração. Resolva a pendência anterior primeiro.',
    'OPEN_TAX',
    100,
  ),
  UNKNOWN_OPENING_LOSS_BALANCE: entry(
    'EVIDENCE_REQUIRED',
    'Saldo de prejuízo anterior desconhecido',
    'O saldo de prejuízos a compensar de períodos anteriores não está comprovado.',
    'OPEN_TAX',
    60,
  ),
  MISSING_OFFICIAL_DEADLINE: entry(
    'OTHER_CANONICAL_BLOCKER',
    'Vencimento oficial indisponível',
    'O vencimento oficial ainda não foi publicado pela autoridade. Nenhum prazo é presumido.',
    'OPEN_OBLIGATION',
    60,
  ),
  IN_PROGRESS_COMPETENCE: entry(
    'OTHER_CANONICAL_BLOCKER',
    'Competência em andamento',
    'Esta competência ainda está aberta; os dados podem mudar até o fechamento.',
    'OPEN_TAX',
    10,
  ),
});

/** Fail-closed fallback for any canonical code absent from the catalog. */
export const UNKNOWN_BLOCKER_FALLBACK: BlockerCatalogEntry = Object.freeze({
  category: 'OTHER_CANONICAL_BLOCKER',
  title: 'Pendência fiscal não classificada',
  explanation:
    'Há uma pendência registrada pelo motor fiscal que ainda não possui explicação detalhada. Revise a qualidade dos dados.',
  actionId: 'OPEN_TAX_QUALITY',
  priority: 60,
} as BlockerCatalogEntry);

export function lookupBlocker(code: string): { code: string; entry: BlockerCatalogEntry } {
  const found = (BLOCKER_CATALOG as Record<string, BlockerCatalogEntry>)[code];
  if (found) return { code, entry: found };
  return { code, entry: UNKNOWN_BLOCKER_FALLBACK };
}

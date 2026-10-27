/**
 * Phase 5S-D — data maintenance actionability policy (pure, zero I/O).
 *
 * 5R-E diagnoses problems; this module classifies what can be done
 * about each one using only writers that already exist. No auto-fix,
 * no score, no new detection rules. Deterministic: the same issue
 * code always yields the same maintenance status, everywhere the
 * policy is applied (portfolio maintenance, position quality,
 * operations preview).
 */

/** What can be done about a diagnosed issue. */
export const MAINTENANCE_STATUSES = [
  'ACTIONABLE',
  'NAVIGABLE',
  'UNSUPPORTED',
  'STRUCTURAL',
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

/**
 * Maintenance action vocabulary (v1). Only actions backed by an
 * existing safe path exist here:
 * - REFRESH_MARKET_DATA / REFRESH_FX_DATA: existing provider refresh
 *   endpoints the user may trigger (never automatic).
 * - REVIEW_RECONCILIATION: the 5S-B human review workspace.
 * - VIEW_*: navigation to existing read surfaces.
 * - NONE: nothing safe to do (unsupported or structural).
 * Deliberately absent: RECTIFY_TRANSACTION (5R-E issues carry no
 * transaction identity, so no issue can name its root transaction —
 * see STEP 39/40), MANUAL_MARKET_DATA (provenance/precedence
 * deferred — MANUAL_MARKET_DATA_DEFERRED), EDIT_ASSET_METADATA
 * (identity is immutable), any direct financial override.
 */
export const MAINTENANCE_ACTION_TYPES = [
  'REFRESH_MARKET_DATA',
  'REFRESH_FX_DATA',
  'REVIEW_RECONCILIATION',
  'VIEW_OPERATIONS',
  'VIEW_POSITION',
  'VIEW_MARKET_DATA',
  'VIEW_REVIEWS',
  'NONE',
] as const;
export type MaintenanceActionType = (typeof MAINTENANCE_ACTION_TYPES)[number];

export interface MaintenanceAction {
  status: MaintenanceStatus;
  actionType: MaintenanceActionType;
  /** Existing route or endpoint template (`:portfolioId`, `:assetId`). Null when there is nowhere safe to go. */
  route: string | null;
  explanation: string;
  /** Safety boundary for this action, when one applies. */
  safetyNote: string | null;
}

const STRUCTURAL_EXPLANATION =
  'O Atlas não possui uma fonte canônica para esse dado, por isso ele é uma limitação estrutural e não uma pendência corrigível.';

const MAINTENANCE_POLICY: Record<string, MaintenanceAction> = {
  MISSING_PRICE: {
    status: 'ACTIONABLE',
    actionType: 'REFRESH_MARKET_DATA',
    route: '/market',
    explanation:
      'Existe uma cotação ausente para um ativo da carteira. A atualização de dados de mercado do provedor pode resolver, quando o ativo for coberto.',
    safetyNote:
      'A atualização usa apenas o provedor configurado e nunca fabrica cotações. Se o ativo não for coberto, a pendência permanece.',
  },
  STALE_PRICE: {
    status: 'NAVIGABLE',
    actionType: 'VIEW_MARKET_DATA',
    route: '/portfolio/assets/:assetId?portfolioId=:portfolioId',
    explanation:
      'A cotação em uso está desatualizada. Cotação desatualizada não significa dado errado; revise a posição antes de decidir.',
    safetyNote: null,
  },
  INCOMPLETE_COST_BASIS: {
    status: 'NAVIGABLE',
    actionType: 'VIEW_OPERATIONS',
    route: '/portfolio?tab=operations&portfolioId=:portfolioId',
    explanation:
      'O custo de base está incompleto. O diagnóstico não identifica qual operação originou a lacuna; localize a operação no livro-razão e, se for uma compra ou venda incorreta, use Corrigir operação (o original é sempre preservado).',
    safetyNote:
      'O custo nunca é editado diretamente: ele resulta de fatos econômicos. Apenas retificação append-only de operações BUY/SELL.',
  },
  NO_FX_TRANSLATION: {
    status: 'ACTIONABLE',
    actionType: 'REFRESH_FX_DATA',
    route: '/api/v1/fx/:baseCurrency/:quoteCurrency/update',
    explanation:
      'Falta taxa de câmbio para conversão. A atualização de câmbio do provedor pode resolver.',
    safetyNote:
      'A atualização usa apenas o provedor configurado. Lacunas históricas nunca são preenchidas com a cotação atual.',
  },
  MIXED_CURRENCIES_WITHOUT_TRANSLATION: {
    status: 'NAVIGABLE',
    actionType: 'VIEW_OPERATIONS',
    route: '/portfolio?tab=operations&portfolioId=:portfolioId',
    explanation:
      'A carteira possui moedas distintas sem conversão disponível. Revise as operações e os dados de mercado das moedas envolvidas.',
    safetyNote: null,
  },
  RECONCILIATION_DIVERGENT: {
    status: 'NAVIGABLE',
    actionType: 'REVIEW_RECONCILIATION',
    route: '/reviews?portfolioId=:portfolioId',
    explanation:
      'Há divergência entre fonte e operações locais. A revisão humana no espaço de reconciliação decide o que corresponde.',
    safetyNote: null,
  },
  RECONCILIATION_MISSING_LOCAL: {
    status: 'NAVIGABLE',
    actionType: 'REVIEW_RECONCILIATION',
    route: '/reviews?portfolioId=:portfolioId',
    explanation:
      'A fonte possui registros sem correspondência local. Revise no espaço de reconciliação.',
    safetyNote: null,
  },
  RECONCILIATION_MISSING_SOURCE: {
    status: 'NAVIGABLE',
    actionType: 'REVIEW_RECONCILIATION',
    route: '/reviews?portfolioId=:portfolioId',
    explanation:
      'Há operações locais sem correspondência na fonte. Revise no espaço de reconciliação.',
    safetyNote: null,
  },
  RECONCILIATION_UNRESOLVED: {
    status: 'NAVIGABLE',
    actionType: 'REVIEW_RECONCILIATION',
    route: '/reviews?portfolioId=:portfolioId',
    explanation:
      'Há pares de reconciliação ainda não decididos. A decisão é sempre humana e nunca altera o histórico.',
    safetyNote: null,
  },
  PENDING_INTEGRATION_REVIEW: {
    status: 'NAVIGABLE',
    actionType: 'VIEW_REVIEWS',
    route: '/reviews?portfolioId=:portfolioId',
    explanation: 'Há execuções de integração aguardando revisão. Nenhuma decisão é automática.',
    safetyNote: null,
  },
  ISSUER_CLASSIFICATION_NOT_AVAILABLE: {
    status: 'STRUCTURAL',
    actionType: 'NONE',
    route: null,
    explanation: STRUCTURAL_EXPLANATION,
    safetyNote: null,
  },
  SECTOR_CLASSIFICATION_NOT_AVAILABLE: {
    status: 'STRUCTURAL',
    actionType: 'NONE',
    route: null,
    explanation: STRUCTURAL_EXPLANATION,
    safetyNote: null,
  },
};

/**
 * Classifies one diagnosed issue code. Unknown codes are UNSUPPORTED
 * (never silently actionable): only writers that exist may be
 * offered, and no writer was invented for unknown codes.
 */
export function deriveMaintenanceAction(code: string): MaintenanceAction {
  return (
    MAINTENANCE_POLICY[code] ?? {
      status: 'UNSUPPORTED',
      actionType: 'NONE',
      route: null,
      explanation:
        'O Atlas identifica esta limitação, mas ainda não possui um fluxo seguro para alterá-la.',
      safetyNote: null,
    }
  );
}

export function isMaintenanceStatus(value: string): value is MaintenanceStatus {
  return (MAINTENANCE_STATUSES as readonly string[]).includes(value);
}

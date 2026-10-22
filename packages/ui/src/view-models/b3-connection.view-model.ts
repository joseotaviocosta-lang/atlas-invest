/**
 * Phase 5N — B3 connection product contract (pure, shared, dependency-free).
 *
 * Single source of truth for how the B3 product surface is presented on
 * every client. Technical engine states (5L `SyncState`, 5M sync results,
 * dedupe verdicts, reconciliation verdicts) are mapped here to human
 * pt-BR copy. No I/O, no floats, no network, no secrets.
 *
 * Product honesty rules enforced by this module:
 * - B3 availability (product capability) is SEPARATE from sync state
 *   (connection runtime). `SYNCED` never implies `AVAILABLE`.
 * - Default availability is `PREPARING`. Only an explicit opt-in flag
 *   yields `AVAILABLE`, and even then no real B3 transport exists in 5N.
 * - Copy never promises a live official integration, real-time data,
 *   universal coverage, or automatic writes without review.
 */

export const B3_INTEGRATION_AVAILABILITIES = ['PREPARING', 'AVAILABLE', 'UNAVAILABLE'] as const;
export type B3IntegrationAvailability = (typeof B3_INTEGRATION_AVAILABILITIES)[number];

export interface B3AvailabilityInput {
  /**
   * Explicit future opt-in only. Accepts boolean or the string form used by
   * build-time flags (`NEXT_PUBLIC_B3_REAL_CONNECTION_ENABLED`). Anything
   * else — including absence — resolves to the safe default.
   */
  realConnectionEnabled?: boolean | string;
}

/**
 * Resolves product availability. Safe by default: without an explicit
 * opt-in the integration is `PREPARING`. `UNAVAILABLE` is reserved for a
 * future explicit capability-off signal; it is never produced today.
 */
export function resolveB3IntegrationAvailability(
  input: B3AvailabilityInput = {},
): B3IntegrationAvailability {
  const enabled = input.realConnectionEnabled;
  if (enabled === true || enabled === 'true') {
    return 'AVAILABLE';
  }
  return 'PREPARING';
}

/**
 * Presentation states of the three import methods on the Importar/Conectar hub.
 * Actions are semantic (the page maps them to concrete navigation); there is a
 * single catalog for every viewport, so no action exists only on desktop.
 */
export const B3_IMPORT_METHOD_ACTIONS = ['b3-explain', 'csv-anchor', 'manual-operations'] as const;
export type B3ImportMethodAction = (typeof B3_IMPORT_METHOD_ACTIONS)[number];

export interface B3ImportMethod {
  id: 'b3' | 'csv' | 'manual';
  title: string;
  subtitle: string;
  description: string;
  badge: string | null;
  ctaLabel: string;
  action: B3ImportMethodAction;
}

export const B3_IMPORT_METHOD_CATALOG: readonly B3ImportMethod[] = [
  {
    id: 'b3',
    title: 'B3',
    subtitle: 'Sincronização automática',
    description:
      'Conecte os investimentos registrados na B3 para manter a carteira sincronizada automaticamente.',
    badge: 'Em preparação',
    ctaLabel: 'Saiba como funcionará',
    action: 'b3-explain',
  },
  {
    id: 'csv',
    title: 'Importar arquivo',
    subtitle: 'CSV da corretora',
    description: 'Importe operações usando um arquivo compatível e revise tudo antes de confirmar.',
    badge: null,
    ctaLabel: 'Importar arquivo',
    action: 'csv-anchor',
  },
  {
    id: 'manual',
    title: 'Adicionar manualmente',
    subtitle: 'Ajustes e lançamentos',
    description:
      'Cadastre uma operação individual quando precisar fazer um ajuste ou incluir algo manualmente.',
    badge: null,
    ctaLabel: 'Adicionar operação',
    action: 'manual-operations',
  },
];

/** Copy shown when the explicit simulation opt-in is active (dev/test only). */
export const B3_SIMULATION_NOTICE =
  'Ambiente de simulação: os dados exibidos são fictícios e nenhum dado real é acessado.';

export interface B3ExplanationSection {
  title: string;
  body: string;
}

export const B3_EXPLANATION_SECTIONS: readonly B3ExplanationSection[] = [
  {
    title: 'O que será sincronizado',
    body: 'Quando a integração estiver disponível, ela poderá trazer posições, compras e vendas, movimentações de custódia e os eventos suportados pelo Atlas. A cobertura exata será informada no lançamento — nem todo tipo de evento estará disponível de imediato.',
  },
  {
    title: 'Atualização dos dados',
    body: 'Os dados disponibilizados pela fonte podem ter defasagem em relação ao pregão atual. O Atlas sempre mostra a data de referência dos dados sincronizados.',
  },
  {
    title: 'Você no controle',
    body: 'A conexão dependerá da sua autorização, e você poderá revogar o acesso quando quiser. Registros encontrados passam por revisão antes de entrar na carteira, e divergências nunca são corrigidas sem a sua decisão.',
  },
  {
    title: 'Segurança',
    body: 'O Atlas não pedirá a senha da sua corretora para essa integração. Nenhuma conexão automática existe hoje: esta tela descreve o funcionamento planejado.',
  },
];

/**
 * Technical sync states mirrored from the 5L contract. Mirrored as a local
 * union (not an import) to keep `@atlas/ui` dependency-free; parity with
 * `SyncState` in `@atlas/import-engine` is enforced by the web test suite.
 */
export const B3_SYNC_STATES = [
  'NOT_CONNECTED',
  'AWAITING_AUTHORIZATION',
  'AUTHORIZED',
  'SYNCING',
  'SYNCED',
  'PARTIAL',
  'REQUIRES_REAUTHORIZATION',
  'ERROR',
  'REVOKED',
] as const;
export type B3SyncState = (typeof B3_SYNC_STATES)[number];

export type B3PresentationTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface B3StatePresentation {
  label: string;
  tone: B3PresentationTone;
  description: string;
  cta: string | null;
}

export const B3_SYNC_STATE_PRESENTATION: Record<B3SyncState, B3StatePresentation> = {
  NOT_CONNECTED: {
    label: 'Não conectado',
    tone: 'neutral',
    description: 'Nenhuma fonte automática vinculada a esta carteira.',
    cta: 'Saiba como funcionará',
  },
  AWAITING_AUTHORIZATION: {
    label: 'Aguardando autorização',
    tone: 'info',
    description: 'Você iniciou a conexão. Conclua a autorização para continuar.',
    cta: 'Concluir autorização',
  },
  AUTHORIZED: {
    label: 'Autorizado',
    tone: 'info',
    description: 'Fonte autorizada. Você pode sincronizar quando quiser.',
    cta: 'Sincronizar agora',
  },
  SYNCING: {
    label: 'Sincronizando',
    tone: 'info',
    description: 'Buscando os registros mais recentes. Isso pode levar alguns segundos.',
    cta: null,
  },
  SYNCED: {
    label: 'Sincronizado',
    tone: 'success',
    description: 'Dados atualizados. Revise os registros antes de confirmar.',
    cta: 'Revisar registros',
  },
  PARTIAL: {
    label: 'Sincronização parcial',
    tone: 'warning',
    description: 'Parte dos registros não pôde ser lida. Nada foi concluído automaticamente.',
    cta: 'Ver o que falta',
  },
  REQUIRES_REAUTHORIZATION: {
    label: 'Nova autorização necessária',
    tone: 'warning',
    description: 'A autorização expirou. Autorize novamente para continuar sincronizando.',
    cta: 'Autorizar novamente',
  },
  ERROR: {
    label: 'Não foi possível sincronizar',
    tone: 'danger',
    description: 'Ocorreu uma falha na leitura. Nenhum dado foi alterado.',
    cta: 'Tentar novamente',
  },
  REVOKED: {
    label: 'Acesso revogado',
    tone: 'neutral',
    description: 'O acesso foi revogado. Seus dados já importados permanecem na carteira.',
    cta: 'Entender como reconectar',
  },
};

export const B3_DUPLICATE_KINDS = [
  'NEW',
  'EXACT_DUPLICATE',
  'PROBABLE_DUPLICATE',
  'CONFLICT',
] as const;
export type B3DuplicateKind = (typeof B3_DUPLICATE_KINDS)[number];

export const B3_DUPLICATE_PRESENTATION: Record<B3DuplicateKind, B3StatePresentation> = {
  NEW: {
    label: 'Nova operação',
    tone: 'info',
    description: 'Ainda não existe no livro-razão.',
    cta: null,
  },
  EXACT_DUPLICATE: {
    label: 'Já importado',
    tone: 'neutral',
    description: 'Registro idêntico a um lançamento existente. Será ignorado automaticamente.',
    cta: null,
  },
  PROBABLE_DUPLICATE: {
    label: 'Possível duplicidade',
    tone: 'warning',
    description: 'Muito parecido com um lançamento existente. Exige sua revisão.',
    cta: 'Revisar',
  },
  CONFLICT: {
    label: 'Conflito de dados',
    tone: 'danger',
    description: 'Mesmo identificador com valores diferentes. Exige decisão explícita.',
    cta: 'Decidir',
  },
};

export const B3_RECONCILIATION_STATUSES = [
  'MATCHED',
  'DIVERGENT',
  'MISSING_LOCAL',
  'MISSING_SOURCE',
  'UNRESOLVED',
] as const;
export type B3ReconciliationStatus = (typeof B3_RECONCILIATION_STATUSES)[number];

export const B3_RECONCILIATION_PRESENTATION: Record<B3ReconciliationStatus, B3StatePresentation> = {
  MATCHED: {
    label: 'Posição conferida',
    tone: 'success',
    description: 'A carteira e a fonte concordam para este ativo.',
    cta: null,
  },
  DIVERGENT: {
    label: 'Diferença encontrada',
    tone: 'warning',
    description:
      'Os valores não coincidem. Nada foi corrigido automaticamente: a diferença aguarda sua decisão.',
    cta: 'Ver diferença',
  },
  MISSING_LOCAL: {
    label: 'Ativo só na fonte',
    tone: 'info',
    description: 'Encontrado na fonte, mas ainda não existe na carteira.',
    cta: null,
  },
  MISSING_SOURCE: {
    label: 'Ativo só na carteira',
    tone: 'info',
    description: 'Existe na carteira, mas não apareceu na fonte.',
    cta: null,
  },
  UNRESOLVED: {
    label: 'Não foi possível conciliar',
    tone: 'neutral',
    description: 'Os dados não permitiram concluir a comparação para este ativo.',
    cta: null,
  },
};

export interface B3SyncSummaryInput {
  newCount: number;
  knownCount: number;
  reviewCount: number;
  unsupportedCount: number;
  partial: boolean;
}

export interface B3SyncSummaryLine {
  text: string;
  tone: B3PresentationTone;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/**
 * Turns 5M sync-result counts into human lines. Partial results are never
 * framed as success, and unsupported rows are always surfaced — the UI must
 * never suggest "everything was imported" when `unsupportedCount > 0`.
 */
export function buildB3SyncSummaryLines(input: B3SyncSummaryInput): B3SyncSummaryLine[] {
  const lines: B3SyncSummaryLine[] = [];
  if (input.partial) {
    lines.push({
      text: 'Sincronização parcial: parte dos registros não pôde ser lida.',
      tone: 'warning',
    });
  }
  if (input.newCount > 0) {
    lines.push({
      text: `${pluralize(input.newCount, 'nova operação encontrada', 'novas operações encontradas')}.`,
      tone: 'info',
    });
  }
  if (input.knownCount > 0) {
    lines.push({
      text: `${pluralize(input.knownCount, 'registro já conhecido', 'registros já conhecidos')}.`,
      tone: 'neutral',
    });
  }
  if (input.reviewCount > 0) {
    lines.push({
      text: `${pluralize(input.reviewCount, 'item precisa', 'itens precisam')} de revisão.`,
      tone: 'warning',
    });
  }
  if (input.unsupportedCount > 0) {
    lines.push({
      text: `${pluralize(input.unsupportedCount, 'evento ainda não suportado', 'eventos ainda não suportados')} — nada foi descartado.`,
      tone: 'warning',
    });
  }
  if (lines.length === 0) {
    lines.push({ text: 'Nenhum registro novo na fonte.', tone: 'neutral' });
  }
  return lines;
}

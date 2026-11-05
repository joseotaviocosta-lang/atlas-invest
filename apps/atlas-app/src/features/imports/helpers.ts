import type {
  ClientSourceHint,
  EffectiveRowState,
  PreviewCandidate,
} from './types';

export function detectClientSourceType(fileName: string, isXlsx: boolean): ClientSourceHint {
  if (!isXlsx) {
    return { sourceType: 'GENERIC_CSV', formatName: 'Arquivo CSV Genérico' };
  }
  const lowered = fileName.toLowerCase();
  if (lowered.includes('anual') || lowered.includes('consolidado')) {
    return {
      sourceType: 'B3_ANNUAL_REPORT_XLSX',
      formatName: 'Área do Investidor B3 — Relatório Consolidado Anual (Posição Inicial)',
    };
  }
  if (lowered.includes('moviment')) {
    return {
      sourceType: 'B3_MOVEMENT_XLSX',
      formatName: 'Área do Investidor B3 — Movimentação',
    };
  }
  return {
    sourceType: 'B3_NEGOTIATION_XLSX',
    formatName: 'Área do Investidor B3 — Negociação',
  };
}

export interface EffectiveRow {
  state: EffectiveRowState;
  reason: string | null;
}

export interface RowDecisionState {
  skipped: boolean;
  forceImport: boolean;
  assetOverrideId?: string;
  accountOverrideId?: string;
  resolution?: {
    reason: string;
    declaredSettlementDate?: string;
  };
}

const RESOLUTION_ISSUE_CODES = new Set(['UNKNOWN_ASSET', 'AMBIGUOUS_ASSET', 'ACCOUNT_REQUIRED']);

export function getEffectiveRowState(
  candidate: PreviewCandidate,
  decision?: RowDecisionState
): EffectiveRow {
  if (decision?.skipped) {
    return { state: 'skipped', reason: null };
  }
  if (candidate.duplicate === 'CONFLICT') {
    return {
      state: 'blocked',
      reason: 'Identificador externo com valores divergentes: ignore a linha',
    };
  }
  if (candidate.duplicate === 'PROBABLE_DUPLICATE') {
    if (decision?.forceImport) {
      return { state: 'importable', reason: null };
    }
    return {
      state: 'blocked',
      reason: 'Possível duplicada: ignore a linha ou marque "Importar mesmo assim"',
    };
  }
  if (candidate.status === 'READY') {
    return { state: 'importable', reason: null };
  }
  if (candidate.status === 'DUPLICATE') {
    return { state: 'auto_skipped', reason: 'Operação já existe no livro-razão' };
  }
  if (candidate.status === 'UNSUPPORTED') {
    return { state: 'auto_skipped', reason: 'Tipo de operação ainda não suportado' };
  }
  if (candidate.status === 'INVALID') {
    return { state: 'blocked', reason: 'Linha inválida: corrija o arquivo ou ignore a linha' };
  }
  if (candidate.status === 'NEEDS_REVIEW' && candidate.unsettledExceptionEligible) {
    if (decision?.resolution) {
      const reason = decision.resolution.reason.trim();
      if (reason.length > 0 && reason.length <= 500) {
        return {
          state: 'importable',
          reason: 'Resolução de trade pré-baseline não liquidado no snapshot',
        };
      }
      return {
        state: 'blocked',
        reason: 'Complete o motivo (1–500 caracteres)',
      };
    }
  }

  const onlyResolutionIssues =
    candidate.issues.length > 0 &&
    candidate.issues.every((issue) => RESOLUTION_ISSUE_CODES.has(issue.code));

  if (!onlyResolutionIssues) {
    return { state: 'pending', reason: 'Linha pendente de revisão: não será importada agora' };
  }

  const assetOk = candidate.assetId !== null || Boolean(decision?.assetOverrideId);
  const accountOk = candidate.accountId !== null || Boolean(decision?.accountOverrideId);

  if (assetOk && accountOk) {
    return { state: 'importable', reason: null };
  }

  return { state: 'pending', reason: 'Resolva, ignore a linha, ou confirme sem ela' };
}

export interface ConfirmEligibility {
  importableCount: number;
  blockedCount: number;
  pendingCount: number;
  skippedCount: number;
  autoSkippedCount: number;
  canConfirm: boolean;
  hint: string | null;
}

export function getConfirmEligibility(
  rows: Array<{ candidate: PreviewCandidate; decision?: RowDecisionState }>
): ConfirmEligibility {
  let importableCount = 0;
  let blockedCount = 0;
  let pendingCount = 0;
  let skippedCount = 0;
  let autoSkippedCount = 0;

  for (const row of rows) {
    const effective = getEffectiveRowState(row.candidate, row.decision);
    if (effective.state === 'importable') importableCount += 1;
    else if (effective.state === 'blocked') blockedCount += 1;
    else if (effective.state === 'pending') pendingCount += 1;
    else if (effective.state === 'skipped') skippedCount += 1;
    else autoSkippedCount += 1;
  }

  if (blockedCount > 0) {
    return {
      importableCount,
      blockedCount,
      pendingCount,
      skippedCount,
      autoSkippedCount,
      canConfirm: false,
      hint: `Resolva ou ignore ${blockedCount === 1 ? 'a linha bloqueada' : `as ${blockedCount} linhas bloqueadas`} para confirmar.`,
    };
  }

  if (importableCount === 0) {
    return {
      importableCount,
      blockedCount,
      pendingCount,
      skippedCount,
      autoSkippedCount,
      canConfirm: false,
      hint: 'Nenhuma operação será importada. Revise as decisões ou escolha outro arquivo.',
    };
  }

  if (pendingCount > 0) {
    return {
      importableCount,
      blockedCount,
      pendingCount,
      skippedCount,
      autoSkippedCount,
      canConfirm: true,
      hint: `${pendingCount === 1 ? '1 item precisa' : `${pendingCount} itens precisam`} de revisão e não ${pendingCount === 1 ? 'será importado' : 'serão importados'} agora.`,
    };
  }

  return {
    importableCount,
    blockedCount,
    pendingCount,
    skippedCount,
    autoSkippedCount,
    canConfirm: true,
    hint: null,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

import { formatCurrency, formatPercentage } from '../formatters';
import { ExplanationEvidenceVM } from './portfolio-ai-explanation.view-model';

/**
 * Portfolio AI Conversation View Model (Phase 3S, ADR-186–ADR-192)
 *
 * Safe client presentation for multi-turn conversation and thread models:
 * - Zero financial calculations (formatting only)
 * - Renders original historical evidence snapshots for prior assistant messages
 * - Explicit badges for Historical and Hypothetical facts
 * - Never converts previous AI prose into financial truth
 */

export interface AiConversationListItemDto {
  id: string;
  portfolioId: string;
  title: string | null;
  archivedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface AiConversationMessageDto {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  status: 'ANSWERED' | 'UNSUPPORTED' | 'PROVIDER_ERROR';
  intent?: string | null;
  evidenceSnapshot?: Array<{
    factId: string;
    category?: string;
    metric: string;
    scope: string;
    value: string | null;
    unit: string;
    nature?: string;
    status?: string;
    asOf?: string;
    period?: { startDate: string; endDate: string } | string;
  }> | null;
  limitations?: string[];
  provider?: string | null;
  model?: string | null;
  providerRequestId?: string | null;
  createdAt: string | Date;
}

export interface AiConversationListItemVM {
  id: string;
  portfolioId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AiConversationMessageVM {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  isUser: boolean;
  isAssistant: boolean;
  content: string;
  status: 'ANSWERED' | 'UNSUPPORTED' | 'PROVIDER_ERROR';
  isAnswered: boolean;
  isUnsupported: boolean;
  isProviderError: boolean;
  intent: string | null;
  evidence: ExplanationEvidenceVM[];
  limitations: string[];
  hasEvidence: boolean;
  hasLimitations: boolean;
  providerInfo?: {
    provider: string;
    model: string;
  };
  createdAt: string;
}

export interface AiConversationDetailVM {
  conversation: AiConversationListItemVM;
  messages: AiConversationMessageVM[];
  hasMessages: boolean;
}

export type AiStreamProgressStage =
  'CLASSIFYING' | 'GROUNDING' | 'GENERATING' | 'VALIDATING' | 'RENDERING';

export interface AiStreamStateVM {
  isStreaming: boolean;
  stage: AiStreamProgressStage | null;
  stageMessage: string | null;
  error: string | null;
}

const METRIC_LABELS: Record<string, string> = {
  CURRENT_MARKET_VALUE: 'Patrimônio Atual',
  TOTAL_COST: 'Custo Total',
  TOTAL_PROFIT_LOSS: 'Lucro/Prejuízo Total',
  TWR: 'Retorno Ponderado no Tempo (TWR)',
  XIRR: 'Taxa Interna de Retorno (XIRR)',
  VOLATILITY: 'Volatilidade Anualizada',
  MAX_DRAWDOWN: 'Queda Máxima (Max Drawdown)',
  CURRENT_DRAWDOWN: 'Drawdown Atual',
  SHARPE_RATIO: 'Índice de Sharpe',
  SORTINO_RATIO: 'Índice de Sortino',
  BETA: 'Beta vs Ibovespa',
  CORRELATION: 'Correlação',
  TRACKING_ERROR: 'Tracking Error',
  ALPHA: 'Alfa de Jensen',
  INFORMATION_RATIO: 'Information Ratio',
  TREYNOR_RATIO: 'Índice de Treynor',
  VAR_95: 'Value at Risk (95%)',
  CVAR_95: 'Conditional VaR (95%)',
  DIFFERENCE: 'Diferença vs Benchmark',
  STRESSED_VALUE: 'Valor Estressado (Cenário)',
  ESTIMATED_IMPACT: 'Impacto Estimado (Cenário)',
};

export function mapToAiConversationListItemVM(
  dto: AiConversationListItemDto,
): AiConversationListItemVM {
  return {
    id: dto.id,
    portfolioId: dto.portfolioId,
    title: dto.title || 'Conversa sem título',
    createdAt: typeof dto.createdAt === 'string' ? dto.createdAt : dto.createdAt.toISOString(),
    updatedAt: typeof dto.updatedAt === 'string' ? dto.updatedAt : dto.updatedAt.toISOString(),
    archivedAt: dto.archivedAt
      ? typeof dto.archivedAt === 'string'
        ? dto.archivedAt
        : dto.archivedAt.toISOString()
      : null,
  };
}

export function mapToAiConversationMessageVM(
  dto: AiConversationMessageDto,
): AiConversationMessageVM {
  const isUser = dto.role === 'USER';
  const isAssistant = dto.role === 'ASSISTANT';
  const isAnswered = dto.status === 'ANSWERED';
  const isUnsupported = dto.status === 'UNSUPPORTED';
  const isProviderError = dto.status === 'PROVIDER_ERROR';

  const rawEvidence = dto.evidenceSnapshot || [];
  const evidence: ExplanationEvidenceVM[] = rawEvidence.map((item) => {
    const rawValue = item.value ?? '—';
    let valueFormatted = rawValue;
    if (item.value != null && item.unit === 'PERCENTAGE') {
      valueFormatted = formatPercentage(item.value, { showSign: false });
    } else if (item.value != null && (item.unit === 'MONEY' || item.unit === 'CURRENCY')) {
      valueFormatted = formatCurrency(item.value, { currencyCode: item.scope });
    } else if (item.unit === 'RATIO') {
      valueFormatted = rawValue;
    }

    let natureBadge: 'HISTORICO' | 'HIPOTESE' | 'ANALITICO' = 'ANALITICO';
    let natureBadgeLabel = 'Fato';
    if (item.nature === 'HYPOTHETICAL') {
      natureBadge = 'HIPOTESE';
      natureBadgeLabel = 'Hipótese';
    } else if (item.nature === 'HISTORICAL') {
      natureBadge = 'HISTORICO';
      natureBadgeLabel = 'Histórico';
    }

    const label = METRIC_LABELS[item.metric] || item.metric;

    return {
      factId: item.factId,
      category: item.category || 'ANALYSIS',
      metric: item.metric,
      scope: item.scope,
      valueRaw: rawValue,
      valueFormatted,
      unit: item.unit,
      natureBadge,
      natureBadgeLabel,
      status: item.status || 'AVAILABLE',
      label,
    };
  });

  return {
    id: dto.id,
    conversationId: dto.conversationId,
    role: dto.role,
    isUser,
    isAssistant,
    content: dto.content,
    status: dto.status,
    isAnswered,
    isUnsupported,
    isProviderError,
    intent: dto.intent || null,
    evidence,
    limitations: dto.limitations || [],
    hasEvidence: evidence.length > 0,
    hasLimitations: (dto.limitations || []).length > 0,
    providerInfo:
      dto.provider && dto.model
        ? {
            provider: dto.provider,
            model: dto.model,
          }
        : undefined,
    createdAt: typeof dto.createdAt === 'string' ? dto.createdAt : dto.createdAt.toISOString(),
  };
}

export function mapToAiConversationDetailVM(
  conversation: AiConversationListItemDto,
  messages: AiConversationMessageDto[],
): AiConversationDetailVM {
  const convVM = mapToAiConversationListItemVM(conversation);
  const msgVMs = messages.map(mapToAiConversationMessageVM);

  return {
    conversation: convVM,
    messages: msgVMs,
    hasMessages: msgVMs.length > 0,
  };
}

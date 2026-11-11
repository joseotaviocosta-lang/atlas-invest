import type { NewsEventUpdateReason, PortfolioNewsInboxResponseDto } from './types';

export function formatUpdateReasonLabel(reason: NewsEventUpdateReason): string {
  switch (reason) {
    case 'OFFICIAL_SOURCE_ADDED':
      return '🏛 Confirmação oficial (CVM / B3) adicionada';
    case 'MATERIALITY_CHANGED':
      return 'Materialidade alterada';
    case 'SENTIMENT_CHANGED':
      return 'Sentimento revisado';
    case 'NEW_DOCUMENT_VERSION':
      return 'Nova versão ou retificação oficial';
    case 'NEW_MATERIAL_INFORMATION':
      return 'Nova informação relevante incorporada';
    case 'SOURCE_SET_CHANGED':
    default:
      return 'Evento atualizado desde a última consulta';
  }
}

export function formatUpdateReasonsSummary(reasons?: NewsEventUpdateReason[]): string | null {
  if (!reasons || reasons.length === 0) return null;
  return reasons.slice(0, 2).map(formatUpdateReasonLabel).join(' • ');
}

export function applyOptimisticSeenToCache(
  current: { data: PortfolioNewsInboxResponseDto } | undefined,
  params: { canonicalEventIds?: string[]; markAllNew?: boolean; seenAt: string },
): { data: PortfolioNewsInboxResponseDto } | undefined {
  if (!current?.data) return current;

  const inbox = current.data;
  const targetSet = params.canonicalEventIds ? new Set(params.canonicalEventIds) : null;
  const markAll = Boolean(params.markAllNew);

  const shouldMark = (canonicalEventId: string, state?: string): boolean => {
    if (targetSet && targetSet.has(canonicalEventId)) return true;
    if (markAll && (state === 'NEW' || state === 'UPDATED')) return true;
    return false;
  };

  let newEventsCount = 0;
  let newMaterialEventsCount = 0;
  let updatedEventsCount = 0;
  let seenEventsCount = 0;

  const nextEvents = inbox.events.map((ev) => {
    const marked = shouldMark(ev.canonicalEventId || ev.id, ev.state);
    const nextState = marked ? ('SEEN' as const) : ev.state;

    if (nextState === 'NEW') {
      newEventsCount++;
      if (ev.materiality === 'CRITICAL' || ev.materiality === 'HIGH') {
        newMaterialEventsCount++;
      }
    } else if (nextState === 'UPDATED') {
      updatedEventsCount++;
    } else if (nextState === 'SEEN') {
      seenEventsCount++;
    }

    if (!marked) return ev;
    return {
      ...ev,
      state: 'SEEN' as const,
      isNew: false,
      isUpdated: false,
      isSeen: true,
      lastSeenByUserAt: params.seenAt,
      updateReasons: undefined,
    };
  });

  const nextDigest = inbox.digest
    ? {
        ...inbox.digest,
        newEventsCount: inbox.digest.newEventsCount !== undefined ? newEventsCount : undefined,
        newMaterialEventsCount:
          inbox.digest.newMaterialEventsCount !== undefined ? newMaterialEventsCount : undefined,
        updatedEventsCount: inbox.digest.updatedEventsCount !== undefined ? updatedEventsCount : undefined,
        seenEventsCount: inbox.digest.seenEventsCount !== undefined ? seenEventsCount : undefined,
        items: inbox.digest.items.map((item) => {
          if (!shouldMark(item.canonicalEventId || item.id, item.state)) return item;
          return {
            ...item,
            state: 'SEEN' as const,
            isNew: false,
            isUpdated: false,
            isSeen: true,
            updateReasons: undefined,
          };
        }),
      }
    : undefined;

  return {
    data: {
      ...inbox,
      events: nextEvents,
      digest: nextDigest,
      metrics: {
        ...inbox.metrics,
        newEventsCount: inbox.metrics.newEventsCount !== undefined ? newEventsCount : undefined,
        newMaterialEventsCount:
          inbox.metrics.newMaterialEventsCount !== undefined ? newMaterialEventsCount : undefined,
        updatedEventsCount: inbox.metrics.updatedEventsCount !== undefined ? updatedEventsCount : undefined,
        seenEventsCount: inbox.metrics.seenEventsCount !== undefined ? seenEventsCount : undefined,
      },
      newsState: inbox.newsState
        ? {
            ...inbox.newsState,
            newEventsCount,
            newMaterialEventsCount,
            updatedEventsCount,
            seenEventsCount,
          }
        : undefined,
    },
  };
}

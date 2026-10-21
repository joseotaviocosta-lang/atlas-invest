'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  colors,
  spacing,
  borderRadius,
  taxComplianceActionCenterQueryKey,
  taxComplianceCalendarQueryKey,
  mapToTaxComplianceActionItemListViewModel,
  mapToTaxComplianceCalendarListViewModel,
  groupTaxComplianceCalendarByDate,
  TAX_ACTION_CENTER_SUPPORT_DISCLAIMER,
  TAX_ACTION_CENTER_STALE_MESSAGE,
  TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING,
  TAX_ACTION_CENTER_REMINDER_NOT_RESOLVED_WARNING,
  type RawTaxComplianceActionItem,
  type RawTaxComplianceActionCenterSummary,
  type RawTaxComplianceCalendarEvent,
  type TaxComplianceActionItemViewModel,
  type TaxComplianceActionSection,
} from '@atlas/ui';
import {
  Card,
  Skeleton,
  ErrorState,
  EmptyState,
  SectionHeader,
  Badge,
  Button,
} from '@/components/ui';

const SECTION_ORDER: readonly TaxComplianceActionSection[] = [
  'attention',
  'upcoming',
  'review',
  'completed',
  'informational',
];

const SECTION_TITLES: Record<TaxComplianceActionSection, string> = {
  attention: 'Precisa de atenção',
  upcoming: 'Próximos vencimentos',
  review: 'Em revisão',
  completed: 'Concluídos recentemente',
  informational: 'Informativos',
};

const MIN_TOUCH_PX = 44;

function currentYear(): number {
  return new Date().getFullYear();
}

function monthBounds(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function ActionCard({ item }: { item: TaxComplianceActionItemViewModel }) {
  return (
    <div
      data-testid={`action-center-item-${item.actionKey}`}
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: `${borderRadius.md}px`,
        padding: `${spacing.sm}px`,
        marginBottom: `${spacing.sm}px`,
        background: colors.surface,
      }}
    >
      <div
        style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Badge variant={item.statusVariant}>{item.statusLabel}</Badge>
        <Badge variant="neutral">{item.priorityLabel}</Badge>
        <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>{item.kindLabel}</span>
      </div>
      <div style={{ fontWeight: 600, marginTop: `${spacing.xs}px` }}>{item.title}</div>
      <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '2px' }}>
        {item.summary}
      </div>
      <div
        style={{
          display: 'flex',
          gap: `${spacing.sm}px`,
          marginTop: `${spacing.xs}px`,
          fontSize: '0.75rem',
          color: colors.textMuted,
          flexWrap: 'wrap',
        }}
      >
        <span>Vencimento: {item.dueDateFormatted}</span>
        <span>Valor: {item.amountFormatted}</span>
        {item.exerciseLabel && <span>{item.exerciseLabel}</span>}
        {item.paymentEvidenceLabel && <span>Comprovante: {item.paymentEvidenceLabel}</span>}
      </div>
      {item.isStale && (
        <div
          role="alert"
          style={{ fontSize: '0.8125rem', color: colors.warning, marginTop: `${spacing.xs}px` }}
        >
          {TAX_ACTION_CENTER_STALE_MESSAGE}
        </div>
      )}
      {item.paymentEvidenceStatus === 'USER_REPORTED_MATCH' && (
        <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '2px' }}>
          {TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING}
        </div>
      )}
      <div style={{ fontSize: '0.8125rem', marginTop: `${spacing.xs}px` }}>
        Próxima ação: <strong>{item.nextActionLabel}</strong>
      </div>
    </div>
  );
}

export function TaxComplianceActionCenterSection() {
  const authReady = useAuthReady();
  const [year, setYear] = useState(2025);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState({ year: 2025, month: 1 });

  useEffect(() => {
    const now = new Date();
    setYear(currentYear());
    setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
  }, []);

  const qs = useMemo(() => {
    const params = new URLSearchParams({ calendarYear: String(year), limit: '100' });
    if (statusFilter) params.set('status', statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    return params.toString();
  }, [year, statusFilter, priorityFilter]);

  const {
    data: rawItems,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: taxComplianceActionCenterQueryKey(year, {
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
    }),
    queryFn: async () => {
      const res = await apiClient.get<{
        data: RawTaxComplianceActionItem[];
        meta: { summary: RawTaxComplianceActionCenterSummary; totalCount: number };
      }>(`/api/v1/fiscal/compliance/action-center?${qs}`);
      return res;
    },
    enabled: authReady,
    staleTime: 30_000,
  });

  const bounds = useMemo(
    () => monthBounds(calendarMonth.year, calendarMonth.month),
    [calendarMonth],
  );

  const { data: rawEvents } = useQuery({
    queryKey: taxComplianceCalendarQueryKey(bounds.from, bounds.to),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxComplianceCalendarEvent[] }>(
        `/api/v1/fiscal/compliance/calendar?from=${bounds.from}&to=${bounds.to}`,
      );
      return res.data;
    },
    enabled: authReady,
    staleTime: 30_000,
  });

  const items = useMemo(
    () => mapToTaxComplianceActionItemListViewModel(rawItems?.data ?? null),
    [rawItems],
  );
  const summary = rawItems?.meta?.summary ?? null;

  const grouped = useMemo(() => {
    const map = new Map<TaxComplianceActionSection, TaxComplianceActionItemViewModel[]>();
    for (const item of items) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return map;
  }, [items]);

  const events = useMemo(
    () => mapToTaxComplianceCalendarListViewModel(rawEvents ?? null),
    [rawEvents],
  );
  const agenda = useMemo(() => groupTaxComplianceCalendarByDate(events), [events]);
  const selectedAgenda = selectedDate
    ? (agenda.find((group) => group.date === selectedDate) ?? null)
    : null;

  // Calendar grid: weeks starting Monday, civil dates only (no fiscal math).
  const gridCells = useMemo(() => {
    const first = new Date(calendarMonth.year, calendarMonth.month - 1, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calendarMonth.year, calendarMonth.month, 0).getDate();
    const cells: Array<{ date: string; day: number; inMonth: boolean } | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({
        date: `${calendarMonth.year}-${String(calendarMonth.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        inMonth: true,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  const eventDates = useMemo(() => new Set(events.map((event) => event.eventDate)), [events]);

  function shiftMonth(delta: number) {
    setCalendarMonth((prev) => {
      const base = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: base.getFullYear(), month: base.getMonth() + 1 };
    });
    setSelectedDate(null);
  }

  return (
    <Card style={{ padding: `${spacing.base}px`, marginTop: `${spacing.base}px` }}>
      <SectionHeader
        title="Central de ações fiscais"
        description="O que fazer agora, o que vem a seguir e o que já foi concluído — combinado a partir das obrigações, comprovantes, lembretes e revisão anual."
      />

      {isLoading && <Skeleton />}
      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Falha ao carregar a central de ações.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          title="Nenhuma ação fiscal pendente"
          description="Não há obrigações ou revisões exigindo atenção neste período."
        />
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
          {summary && (
            <div
              data-testid="action-center-summary"
              style={{
                display: 'flex',
                gap: `${spacing.sm}px`,
                flexWrap: 'wrap',
                marginBottom: `${spacing.base}px`,
              }}
            >
              <Badge variant="danger">Atenção: {summary.needsAttention}</Badge>
              <Badge variant="warning">Vence hoje: {summary.dueToday}</Badge>
              <Badge variant="info">Próximos: {summary.upcoming}</Badge>
              <Badge variant="warning">Em revisão: {summary.requiresReview}</Badge>
              <Badge variant="success">Concluídos: {summary.completed}</Badge>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: `${spacing.sm}px`,
              marginBottom: `${spacing.base}px`,
              flexWrap: 'wrap',
            }}
          >
            <label style={{ fontSize: '0.8125rem' }}>
              Status:{' '}
              <select
                aria-label="Filtrar por status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                style={{ minHeight: `${MIN_TOUCH_PX}px` }}
              >
                <option value="">Todos</option>
                <option value="OVERDUE">Em atraso</option>
                <option value="DUE_TODAY">Vence hoje</option>
                <option value="UPCOMING">Próximo</option>
                <option value="REQUIRES_REVIEW">Em revisão</option>
                <option value="WAITING_USER">Aguardando você</option>
                <option value="ACTION_REQUIRED">Ação necessária</option>
                <option value="COMPLETED">Concluído</option>
                <option value="INFORMATIONAL">Informativo</option>
              </select>
            </label>
            <label style={{ fontSize: '0.8125rem' }}>
              Prioridade:{' '}
              <select
                aria-label="Filtrar por prioridade"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
                style={{ minHeight: `${MIN_TOUCH_PX}px` }}
              >
                <option value="">Todas</option>
                <option value="CRITICAL">Crítica</option>
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Média</option>
                <option value="LOW">Baixa</option>
              </select>
            </label>
          </div>

          {SECTION_ORDER.map((section) => {
            const sectionItems = grouped.get(section) ?? [];
            if (sectionItems.length === 0) return null;
            return (
              <section key={section} aria-label={SECTION_TITLES[section]}>
                <h3
                  style={{ fontSize: '0.9375rem', margin: `${spacing.base}px 0 ${spacing.sm}px` }}
                >
                  {SECTION_TITLES[section]} ({sectionItems.length})
                </h3>
                {sectionItems.map((item) => (
                  <ActionCard key={item.actionKey} item={item} />
                ))}
              </section>
            );
          })}

          <section aria-label="Calendário fiscal" style={{ marginTop: `${spacing.base}px` }}>
            <h3 style={{ fontSize: '0.9375rem' }}>Calendário fiscal</h3>
            <div
              style={{
                display: 'flex',
                gap: `${spacing.sm}px`,
                alignItems: 'center',
                margin: `${spacing.sm}px 0`,
              }}
            >
              <Button variant="secondary" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
                ←
              </Button>
              <span aria-live="polite" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {String(calendarMonth.month).padStart(2, '0')}/{calendarMonth.year}
              </span>
              <Button variant="secondary" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
                →
              </Button>
            </div>
            <div
              role="grid"
              aria-label="Calendário mensal fiscal"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '2px',
              }}
            >
              {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, index) => (
                <div
                  key={index}
                  style={{
                    fontSize: '0.6875rem',
                    color: colors.textMuted,
                    textAlign: 'center',
                    padding: '4px 0',
                  }}
                >
                  {day}
                </div>
              ))}
              {gridCells.map((cell, index) =>
                cell === null ? (
                  <div key={`empty-${index}`} />
                ) : (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => setSelectedDate(cell.date)}
                    aria-label={`Ver agenda de ${cell.date}`}
                    aria-pressed={selectedDate === cell.date}
                    style={{
                      minHeight: `${MIN_TOUCH_PX}px`,
                      border:
                        selectedDate === cell.date
                          ? `2px solid ${colors.accent}`
                          : `1px solid ${colors.border}`,
                      borderRadius: `${borderRadius.sm}px`,
                      background: eventDates.has(cell.date)
                        ? colors.surfaceElevated
                        : colors.surface,
                      fontWeight: eventDates.has(cell.date) ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {cell.day}
                    {eventDates.has(cell.date) && (
                      <span aria-hidden="true" style={{ display: 'block', fontSize: '0.625rem' }}>
                        •
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
            {selectedAgenda ? (
              <div style={{ marginTop: `${spacing.sm}px` }} aria-live="polite">
                <h4 style={{ fontSize: '0.875rem' }}>Agenda — {selectedAgenda.dateFormatted}</h4>
                {selectedAgenda.events.map((event) => (
                  <div key={event.eventKey} style={{ fontSize: '0.8125rem', padding: '4px 0' }}>
                    <strong>{event.eventTypeLabel}</strong> — {event.title}
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  marginTop: `${spacing.sm}px`,
                  fontSize: '0.8125rem',
                  color: colors.textMuted,
                }}
              >
                Selecione um dia para ver a agenda. Valores aparecem somente após abrir o item
                autenticado.
              </div>
            )}
          </section>

          <div
            style={{
              marginTop: `${spacing.base}px`,
              fontSize: '0.75rem',
              color: colors.textMuted,
              lineHeight: 1.6,
            }}
          >
            {TAX_ACTION_CENTER_SUPPORT_DISCLAIMER}.{' '}
            {TAX_ACTION_CENTER_REMINDER_NOT_RESOLVED_WARNING}
          </div>
        </>
      )}
    </Card>
  );
}

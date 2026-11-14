import { useState } from 'react';
import { useMonthlyPortfolioProgress } from '../useDecisionBrief';
import type { PortfolioMonthlyProgressEntryDto } from '../types';

interface MonthlyProgressTimelineSectionProps {
  portfolioId: string | null | undefined;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function formatCompetence(comp: string): string {
  const [y, m] = comp.split('-');
  const monthIdx = parseInt(m ?? '1', 10) - 1;
  const name = MONTH_NAMES[monthIdx] ?? m;
  return `${name}/${y}`;
}

const STATUS_LABELS: Record<PortfolioMonthlyProgressEntryDto['monthStatus'], string> = {
  NO_GOAL: 'Sem meta',
  GOAL_ONLY: 'Meta definida',
  PLAN_OPEN: 'Plano em aberto',
  PLAN_COMPLETED: 'Plano concluído',
  MULTIPLE_PLANS: 'Múltiplos planos',
};

const STATUS_STYLES: Record<PortfolioMonthlyProgressEntryDto['monthStatus'], string> = {
  NO_GOAL: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  GOAL_ONLY: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  PLAN_OPEN: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  PLAN_COMPLETED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  MULTIPLE_PLANS: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
};

export function MonthlyProgressTimelineSection({ portfolioId }: MonthlyProgressTimelineSectionProps) {
  const { data: timeline, isLoading, error } = useMonthlyPortfolioProgress(portfolioId);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  if (!portfolioId) return null;

  if (isLoading) {
    return (
      <div
        data-testid="monthly-progress-loading"
        className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] p-6 text-sm text-[var(--text-secondary)]"
      >
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <span>Carregando evolução mensal da carteira...</span>
        </div>
      </div>
    );
  }

  if (error || !timeline) {
    return (
      <div
        data-testid="monthly-progress-error"
        className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-300"
      >
        Não foi possível carregar o histórico de evolução mensal.
      </div>
    );
  }

  const { summary, months, currentPortfolioState, safeCopy } = timeline;

  const toggleMonth = (comp: string) => {
    setExpandedMonths((prev) => ({ ...prev, [comp]: !prev[comp] }));
  };

  return (
    <section
      data-testid="monthly-progress-timeline-section"
      className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] p-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Evolução mensal</h2>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]">
              {timeline.fromMonth} a {timeline.toMonth} ({summary.monthsCount} meses)
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Acompanhamento histórico comprovável de metas, planos de aporte e compras registradas no ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
            data-testid="toggle-view-mode-btn"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface)] min-h-[32px]"
          >
            {viewMode === 'cards' ? 'Ver como tabela' : 'Ver como cards'}
          </button>
        </div>
      </div>

      {/* KPI Summary Banner */}
      <div
        data-testid="monthly-progress-summary-banner"
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-xs">
          <div className="text-[var(--text-secondary)]">Meta configurada</div>
          <div className="mt-1 text-sm font-bold text-[var(--text-primary)]">
            R$ {summary.totalGoalAmount}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            em {summary.goalsConfiguredMonths} de {summary.monthsCount} meses
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-xs">
          <div className="text-[var(--text-secondary)]">Total planejado</div>
          <div className="mt-1 text-sm font-bold text-[var(--text-primary)]">
            R$ {summary.totalPlannedAmount}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            em {summary.plansCreated} planos criados
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-xs">
          <div className="text-[var(--text-secondary)]">Total confirmado</div>
          <div className="mt-1 text-sm font-bold text-emerald-400">
            R$ {summary.totalConfirmedAmount}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            em {summary.plansCompleted} planos concluídos
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-xs">
          <div className="text-[var(--text-secondary)]">Compras registradas</div>
          <div className="mt-1 text-sm font-bold text-[var(--accent)]">
            R$ {summary.totalPurchaseActivityAmount}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            operações BUY no ledger
          </div>
        </div>
      </div>

      {/* Current State Card (Isolated, never conflated with past) */}
      {currentPortfolioState && (
        <div
          data-testid="current-portfolio-state-card"
          className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 pb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sky-300">Situação atual da carteira</span>
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">
                Estado presente (não retroativo)
              </span>
            </div>
            {currentPortfolioState.totalEquity && (
              <div className="font-bold text-sky-200">
                Patrimônio atual: R$ {currentPortfolioState.totalEquity}
              </div>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span>
              Posições com cotação: {currentPortfolioState.valuedPositions} de {currentPortfolioState.totalPositions}
            </span>
            <span className="mx-1">•</span>
            <span>
              Qualidade: {currentPortfolioState.valuationQuality === 'FULL_PORTFOLIO' ? 'Completa' : 'Apenas posições valorizadas'}
            </span>
          </div>
          {currentPortfolioState.currentPositions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {currentPortfolioState.currentPositions.map((pos) => (
                <span
                  key={pos.assetId}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-2 py-1 text-[11px]"
                >
                  <strong className="text-[var(--text-primary)]">{pos.ticker}:</strong>{' '}
                  <span className="text-[var(--text-secondary)]">{pos.weightPercent}%</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Safety & Honesty Warnings */}
      <div
        data-testid="history-disclaimer-card"
        className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-300"
      >
        <div className="font-semibold text-amber-200">Integridade dos dados históricos</div>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px] text-amber-300/90">
          <li>{safeCopy.historicalValuationNote}</li>
          <li>{safeCopy.historicalTargetNote}</li>
          <li>{safeCopy.cashSourceNote}</li>
        </ul>
      </div>

      {/* View Mode: Cards */}
      {viewMode === 'cards' && (
        <div
          data-testid="monthly-progress-cards-container"
          className="mt-5 space-y-3"
        >
          {months.map((m) => {
            const isExpanded = Boolean(expandedMonths[m.competence]);
            return (
              <div
                key={m.competence}
                data-testid={`month-card-${m.competence}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--text-primary)]">
                      {formatCompetence(m.competence)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        STATUS_STYLES[m.monthStatus]
                      }`}
                    >
                      {STATUS_LABELS[m.monthStatus]}
                    </span>
                  </div>

                  {m.plans.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleMonth(m.competence)}
                      data-testid={`toggle-plan-details-${m.competence}`}
                      className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                    >
                      {isExpanded
                        ? 'Ocultar planos'
                        : `${m.plans.length} ${m.plans.length === 1 ? 'plano' : 'planos'} ▾`}
                    </button>
                  )}
                </div>

                {/* Metrics Grid */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Meta mensal</div>
                    <div className="mt-0.5 font-semibold text-[var(--text-primary)]">
                      {m.goal ? `R$ ${m.goal.amount}` : '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Planejado em planos</div>
                    <div className="mt-0.5 font-semibold text-[var(--text-primary)]">
                      {m.totalPlannedCents > 0 ? `R$ ${m.totalPlannedAmount}` : '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Confirmado</div>
                    <div className="mt-0.5 font-semibold text-emerald-400">
                      R$ {m.totalConfirmedAmount}
                    </div>
                    {m.totalCandidateCents > 0 && (
                      <div className="text-[9px] text-amber-400" data-testid={`month-candidates-${m.competence}`}>
                        Possíveis correspondências: R$ {m.totalCandidateAmount}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Compras registradas</div>
                    <div className="mt-0.5 font-semibold text-[var(--accent)]">
                      R$ {m.purchaseActivityAmount}
                    </div>
                    <div className="text-[9px] text-[var(--text-secondary)]">
                      {m.purchaseTransactionCount} {m.purchaseTransactionCount === 1 ? 'compra' : 'compras'}
                    </div>
                  </div>
                </div>

                {/* Plans List when Expanded or when 1 plan */}
                {isExpanded && m.plans.length > 0 && (
                  <div
                    data-testid={`plans-list-${m.competence}`}
                    className="mt-3 space-y-2 border-t border-[var(--border)] pt-3"
                  >
                    {m.plans.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] p-2.5"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--text-primary)]">{p.name}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                p.status === 'COMPLETED'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}
                            >
                              {p.status === 'COMPLETED' ? 'Concluído' : 'Em aberto'}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-[var(--text-secondary)]">
                            Planejado: R$ {p.plannedAmount} • Confirmado: R$ {p.confirmedAmount} ({p.completionPercent}%)
                            {p.candidateCents > 0 && (
                              <span className="text-amber-400" data-testid={`plan-candidate-${p.id}`}>
                                {` • Possíveis correspondências: R$ ${p.candidateAmount}`}
                              </span>
                            )}
                            {p.completedAt && ` • Encerrado em ${p.completedAt.slice(0, 10)}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Informative Month Warning */}
                {m.warnings.length > 0 && (
                  <div className="mt-2 text-[10px] text-[var(--text-secondary)]">
                    {m.warnings[0]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* View Mode: Table Fallback (Accessibility) */}
      {viewMode === 'table' && (
        <div className="mt-5 overflow-x-auto">
          <table
            data-testid="monthly-progress-table"
            className="w-full text-left text-xs"
          >
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                <th className="pb-2 font-semibold">Competência</th>
                <th className="pb-2 font-semibold">Meta</th>
                <th className="pb-2 font-semibold">Planejado</th>
                <th className="pb-2 font-semibold">Confirmado</th>
                <th className="pb-2 font-semibold">Compras no Ledger</th>
                <th className="pb-2 font-semibold">Planos</th>
                <th className="pb-2 font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {months.map((m) => (
                <tr key={m.competence} className="hover:bg-[var(--surface-elevated)]">
                  <td className="py-2.5 font-medium text-[var(--text-primary)]">
                    {formatCompetence(m.competence)}
                  </td>
                  <td className="py-2.5 text-[var(--text-secondary)]">
                    {m.goal ? `R$ ${m.goal.amount}` : '—'}
                  </td>
                  <td className="py-2.5 text-[var(--text-secondary)]">
                    {m.totalPlannedCents > 0 ? `R$ ${m.totalPlannedAmount}` : '—'}
                  </td>
                  <td className="py-2.5 font-semibold text-emerald-400">
                    R$ {m.totalConfirmedAmount}
                  </td>
                  <td className="py-2.5 text-[var(--text-primary)]">
                    R$ {m.purchaseActivityAmount} ({m.purchaseTransactionCount})
                  </td>
                  <td className="py-2.5 text-[var(--text-secondary)]">
                    {m.completedPlanCount}/{m.plans.length}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        STATUS_STYLES[m.monthStatus]
                      }`}
                    >
                      {STATUS_LABELS[m.monthStatus]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

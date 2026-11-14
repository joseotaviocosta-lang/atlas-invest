import React, { useState } from 'react';
import { useDecisionBrief, useContributionProgress } from '../useDecisionBrief';
import type {
  DecisionTierDto,
  PortfolioDecisionPriorityItemDto,
  ContributionPlanProgressDto,
} from '../types';

interface DecisionBriefSectionProps {
  portfolioId: string | null;
}

const TIER_LABELS: Record<DecisionTierDto, string> = {
  HIGH_PRIORITY: 'Prioridade para análise',
  REVIEW: 'Merece revisão',
  WATCH: 'Acompanhar',
  INSUFFICIENT_DATA: 'Dados insuficientes',
};

const TIER_STYLES: Record<DecisionTierDto, string> = {
  HIGH_PRIORITY: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  REVIEW: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  WATCH: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  INSUFFICIENT_DATA: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: 'Confiança alta',
  MEDIUM: 'Confiança média',
  LOW: 'Confiança baixa',
  INSUFFICIENT_DATA: 'Dados insuficientes',
};

const QUALITY_STYLES: Record<'BOA' | 'PARCIAL' | 'LIMITADA', string> = {
  BOA: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  PARCIAL: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  LIMITADA: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

const QUALITY_LABELS: Record<'BOA' | 'PARCIAL' | 'LIMITADA', string> = {
  BOA: 'Qualidade boa',
  PARCIAL: 'Qualidade parcial',
  LIMITADA: 'Qualidade limitada',
};

function isSafeHttpUrl(url?: string): url is string {
  if (!url) return false;
  return url.startsWith('https://') || url.startsWith('http://');
}

function ContributionProgressCard({
  progress,
}: {
  progress: ContributionPlanProgressDto;
}) {
  const { overall, plan, assets, unplannedAssets, dataQuality } = progress;

  return (
    <div
      data-testid="contribution-progress-tracking-card"
      className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Acompanhamento do aporte — {progress.periodStart.slice(0, 7)}
            </h3>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
              {plan.source === 'PERSISTED_PLAN' ? 'Plano salvo' : plan.source === 'SAVED_GOAL' ? 'Meta salva' : 'Simulação'}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            {progress.sourceTransparencyNote}
          </p>
          {plan.plannedDate && (
            <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
              Base planejada em {plan.plannedDate}
            </p>
          )}
          {!plan.baselineStable && (
            <p className="mt-0.5 text-[10px] text-amber-400">
              A distribuição planejada é recalculada com os dados atuais e pode mudar ao longo do tempo.
            </p>
          )}
        </div>

        <div className="text-right">
          <div className="text-base font-bold tabular-nums text-[var(--text-primary)]">
            {overall.completionPercent}%
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">
            R$ {overall.actualAmount} / R$ {overall.plannedAmount}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex justify-between text-[11px] text-[var(--text-secondary)] mb-1">
          <span>Progresso do plano</span>
          <span>{overall.cappedCompletionPercent}% concluído</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
          <div
            className={`h-full transition-all duration-300 ${
              overall.completionPercent >= 100
                ? 'bg-emerald-500'
                : overall.completionPercent > 0
                ? 'bg-[var(--accent)]'
                : 'bg-transparent'
            }`}
            style={{ width: `${overall.cappedCompletionPercent}%` }}
          />
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="text-[10px] text-[var(--text-secondary)]">Planejado</span>
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            R$ {overall.plannedAmount}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="text-[10px] text-[var(--text-secondary)]">Compras registradas</span>
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            R$ {overall.actualAmount}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="text-[10px] text-[var(--text-secondary)]">Restante do plano</span>
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            R$ {overall.remainingAmount}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="text-[10px] text-[var(--text-secondary)]">Acima do plano</span>
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            R$ {overall.overPlanAmount}
          </div>
        </div>
      </div>

      {/* Asset Table */}
      {assets.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold text-[var(--text-primary)] mb-2">
            Distribuição planejada vs. movimentos registrados
          </h4>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-[11px]">
              <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                <tr>
                  <th className="p-2">Ativo</th>
                  <th className="p-2 text-right">Planejado</th>
                  <th className="p-2 text-right">Realizado</th>
                  <th className="p-2 text-right">Restante</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {assets.map((asset) => (
                  <tr key={asset.assetId} data-testid={`tracking-asset-row-${asset.ticker}`}>
                    <td className="p-2 font-medium text-[var(--text-primary)]">
                      {asset.ticker}
                    </td>
                    <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">
                      R$ {(asset.plannedCents / 100).toFixed(2)}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                      R$ {(asset.actualCents / 100).toFixed(2)}
                    </td>
                    <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">
                      R$ {(asset.remainingCents / 100).toFixed(2)}
                    </td>
                    <td className="p-2 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          asset.status === 'COMPLETE'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : asset.status === 'PARTIAL'
                            ? 'bg-sky-500/15 text-sky-400'
                            : asset.status === 'OVER_PLAN'
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-zinc-500/15 text-zinc-400'
                        }`}
                      >
                        {asset.status === 'COMPLETE'
                          ? 'Concluído'
                          : asset.status === 'PARTIAL'
                          ? 'Parcial'
                          : asset.status === 'OVER_PLAN'
                          ? 'Acima do plano'
                          : 'Não iniciado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unplanned Purchases */}
      {unplannedAssets.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold text-[var(--text-primary)] mb-2">
            Compras fora do plano original
          </h4>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-[11px]">
              <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                <tr>
                  <th className="p-2">Ativo</th>
                  <th className="p-2 text-right">Valor comprado</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {unplannedAssets.map((asset) => (
                  <tr key={asset.assetId} data-testid={`tracking-unplanned-row-${asset.ticker}`}>
                    <td className="p-2 font-medium text-[var(--text-primary)]">
                      {asset.ticker}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                      R$ {(asset.actualCents / 100).toFixed(2)}
                    </td>
                    <td className="p-2 text-center">
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        Fora do plano
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deviations Insights */}
      {progress.largestDeviations.length > 0 && (
        <div className="mt-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[11px] text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Desvios observados: </span>
          <ul className="mt-1 list-disc space-y-0.5 pl-3.5">
            {progress.largestDeviations.map((dev, idx) => (
              <li key={idx}>{dev}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Partial valuation & cash limitation notes */}
      <div className="mt-3 space-y-1 text-[10px] text-[var(--text-secondary)]">
        {dataQuality.isPartialValuation && (
          <p className="text-amber-400">
            ⚠️ Progresso estrutural calculado apenas sobre posições avaliadas ({dataQuality.valuedPositions}/{dataQuality.totalPositions}).
          </p>
        )}
        <p className="italic">{progress.cashSourceLimitationNote}</p>
        <p className="italic">{progress.structuralProgress.attributionDisclaimer}</p>
      </div>
    </div>
  );
}

function PriorityCard({
  item,
  onScrollToRadar,
}: {
  item: PortfolioDecisionPriorityItemDto;
  onScrollToRadar: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      data-testid={`decision-brief-card-${item.ticker}`}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface)] text-xs font-semibold text-[var(--text-secondary)]">
              {item.rank}
            </span>
            <h3 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              {item.ticker}
            </h3>
            <span className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
              {item.assetType === 'FII' ? 'FII' : 'AÇÃO'}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TIER_STYLES[item.decisionTier]}`}
            >
              {TIER_LABELS[item.decisionTier]}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{item.name}</p>
        </div>

        <div className="text-right">
          <div className="text-lg font-bold tabular-nums text-[var(--text-primary)]">
            {item.opportunityScore}
            <span className="text-xs font-normal text-[var(--text-secondary)]">/100</span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {CONFIDENCE_LABELS[item.confidence] ?? item.confidence}
          </div>
        </div>
      </div>

      {item.whyNow[0] && (
        <p className="mt-3 text-sm text-[var(--text-primary)]">{item.whyNow[0]}</p>
      )}

      {(item.cautions.length > 0 || item.dataGaps.length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {item.cautions.slice(0, 2).map((caution, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300"
            >
              <span aria-hidden="true">!</span>
              <span className="line-clamp-1">{caution}</span>
            </span>
          ))}
          {item.dataGaps.slice(0, 1).map((gap, idx) => (
            <span
              key={`gap-${idx}`}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-xs text-zinc-300"
            >
              <span className="line-clamp-1">{gap}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface)]"
        >
          {expanded ? 'Ocultar detalhes ▲' : 'Ver detalhes ▼'}
        </button>

        <button
          type="button"
          onClick={onScrollToRadar}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Ver análise completa ↓
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3 text-xs">
          {item.whyNow.length > 0 && (
            <div>
              <h4 className="font-semibold text-[var(--text-primary)]">Por que estudar agora</h4>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[var(--text-secondary)]">
                {item.whyNow.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {item.cautions.length > 0 && (
            <div>
              <h4 className="font-semibold text-amber-300">Cautelas</h4>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-200/90">
                {item.cautions.map((caution, idx) => (
                  <li key={idx}>{caution}</li>
                ))}
              </ul>
            </div>
          )}

          {item.dataGaps.length > 0 && (
            <div>
              <h4 className="font-semibold text-[var(--text-secondary)]">Lacunas de dados</h4>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[var(--text-secondary)]">
                {item.dataGaps.map((gap, idx) => (
                  <li key={idx}>{gap}</li>
                ))}
              </ul>
            </div>
          )}

          {item.recentChanges.length > 0 && (
            <div>
              <h4 className="font-semibold text-[var(--text-primary)]">Mudanças recentes</h4>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[var(--text-secondary)]">
                {item.recentChanges.map((change, idx) => (
                  <li key={idx} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{change.label}</span>
                    {isSafeHttpUrl(change.canonicalUrl) && (
                      <a
                        href={change.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                      >
                        Ver notícia ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.newsContext && (
            <div>
              <h4 className="font-semibold text-[var(--text-primary)]">Notícia em destaque</h4>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface)] px-2.5 py-1.5">
                <span className="min-w-0 flex-1 text-[var(--text-primary)]">
                  {item.newsContext.isOfficial && (
                    <span className="mr-1.5 rounded bg-sky-500/20 px-1 py-0.5 text-[10px] font-semibold text-sky-300">
                      OFICIAL
                    </span>
                  )}
                  {item.newsContext.headline}
                </span>
                {isSafeHttpUrl(item.newsContext.canonicalUrl) && (
                  <a
                    href={item.newsContext.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                  >
                    Ver notícia ↗
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function DecisionBriefSection({ portfolioId }: DecisionBriefSectionProps) {
  const [draftAmount, setDraftAmount] = useState('');
  const [appliedAmount, setAppliedAmount] = useState<string | undefined>(undefined);
  const [inputError, setInputError] = useState<string | null>(null);
  const [selectedScenarioTab, setSelectedScenarioTab] = useState<'CAUTIOUS' | 'BALANCED' | 'OPPORTUNITY_FOCUS'>('BALANCED');
  const [showProjection, setShowProjection] = useState(false);

  const {
    data: brief,
    isLoading,
    isError,
    error,
    refresh,
    isRefreshing,
    simulateContribution,
    isSimulating,
    simulationResult,
    resetSimulation,
    compareContributionScenarios,
    isComparing,
    comparisonResult,
    resetComparison,
    projectPortfolio,
    isProjecting,
    projectionResult,
    resetProjection,
    projectScenarios,
    isProjectingScenarios,
    projectedScenariosResult,
    resetProjectedScenarios,
  } = useDecisionBrief(portfolioId, appliedAmount);

  const { data: progressResult } = useContributionProgress(
    portfolioId,
    appliedAmount ? { contributionAmount: appliedAmount } : undefined,
  );

  if (!portfolioId) {
    return null;
  }

  const handleScrollToRadar = () => {
    const el = document.getElementById('opportunity-radar');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleApplySimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = draftAmount.trim().replace(',', '.');
    if (!normalized) {
      setAppliedAmount(undefined);
      setInputError(null);
      resetSimulation();
      resetComparison();
      resetProjection();
      resetProjectedScenarios();
      setShowProjection(false);
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(normalized) || /^0+(\.0{1,2})?$/.test(normalized)) {
      setInputError('Informe um valor positivo com até 2 casas decimais (ex.: 1000.00).');
      return;
    }
    setInputError(null);
    setAppliedAmount(normalized);
    try {
      await simulateContribution({ amount: normalized });
      resetComparison();
      resetProjection();
      resetProjectedScenarios();
      setShowProjection(false);
    } catch {
      // Error handled via simulationError
    }
  };

  const handleCompareScenarios = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const normalized = draftAmount.trim().replace(',', '.');
    if (!normalized) {
      setInputError('Informe um valor de aporte para comparar cenários.');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(normalized) || /^0+(\.0{1,2})?$/.test(normalized)) {
      setInputError('Informe um valor positivo com até 2 casas decimais (ex.: 1000.00).');
      return;
    }
    setInputError(null);
    setAppliedAmount(normalized);
    try {
      await compareContributionScenarios({ amount: normalized });
      resetSimulation();
      resetProjection();
      resetProjectedScenarios();
      setShowProjection(false);
    } catch {
      // Error handled via comparisonError
    }
  };

  const handleLoadProjection = async () => {
    const normalized = draftAmount.trim().replace(',', '.') || appliedAmount;
    if (!normalized) return;
    try {
      if (comparisonResult) {
        await projectScenarios({ amount: normalized });
      } else {
        await projectPortfolio({ amount: normalized });
      }
      setShowProjection(true);
    } catch {
      // handled
    }
  };

  const handleClearSimulation = () => {
    setDraftAmount('');
    setAppliedAmount(undefined);
    setInputError(null);
    resetSimulation();
    resetComparison();
    resetProjection();
    resetProjectedScenarios();
    setShowProjection(false);
  };

  if (isLoading) {
    return (
      <section
        aria-label="Decisão de aporte"
        className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-44 rounded bg-[var(--surface-elevated)]" />
          <div className="h-4 w-72 rounded bg-[var(--surface-elevated)]" />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="h-28 rounded-xl bg-[var(--surface-elevated)]" />
            <div className="h-28 rounded-xl bg-[var(--surface-elevated)]" />
            <div className="h-28 rounded-xl bg-[var(--surface-elevated)]" />
          </div>
        </div>
      </section>
    );
  }

  if (isError || !brief) {
    return (
      <section
        aria-label="Decisão de aporte"
        className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Decisão de aporte</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {error instanceof Error
                ? error.message
                : 'Não foi possível carregar o resumo diário de decisão.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
          >
            Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  const topThree = brief.topPriorities.slice(0, 3);
  const isEmpty = brief.dataQuality.totalAssets === 0 || topThree.length === 0;

  return (
    <section
      aria-label="Decisão de aporte"
      data-testid="decision-brief-section"
      className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Decisão de aporte</h2>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${QUALITY_STYLES[brief.dataQuality.label]}`}
            >
              {QUALITY_LABELS[brief.dataQuality.label]}
            </span>
          </div>
          {brief.summary.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--text-secondary)]">
              {brief.summary.map((line, idx) => (
                <li key={idx} className={idx === 0 ? 'text-sm font-medium text-[var(--text-primary)]' : ''}>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
        >
          {isRefreshing ? 'Atualizando...' : 'Atualizar análise'}
        </button>
      </div>

      {/* Data Quality Coverage */}
      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {brief.dataQuality.sufficientCount} ativos com base suficiente ·{' '}
            {brief.dataQuality.incompleteCount} com dados incompletos (de {brief.dataQuality.totalAssets})
          </span>
          <span className="tabular-nums text-[var(--text-primary)]">
            Preços {brief.dataQuality.priceCoveragePercent}% · Fundamentos{' '}
            {brief.dataQuality.fundamentalsCoveragePercent}% · Notícias{' '}
            {brief.dataQuality.newsCoveragePercent}%
          </span>
        </div>
        {(brief.dataQuality.officialProviderStatus === 'OFFICIAL_PROVIDER_PARTIAL' ||
          brief.dataQuality.officialProviderStatus === 'OFFICIAL_PROVIDER_UNAVAILABLE' ||
          brief.dataQuality.officialProviderStatus === 'OFFICIAL_PROVIDER_STALE_CACHE') && (
          <p className="mt-1.5 text-amber-300">
            {brief.dataQuality.officialProviderStatus === 'OFFICIAL_PROVIDER_UNAVAILABLE'
              ? 'Fontes oficiais indisponíveis no momento — cobertura de notícias baseada nos demais provedores.'
              : brief.dataQuality.officialProviderStatus === 'OFFICIAL_PROVIDER_STALE_CACHE'
                ? 'Fontes oficiais em cache temporário — cobertura parcial de notícias nesta execução.'
                : 'Fontes oficiais: cobertura parcial nesta execução.'}
          </p>
        )}
      </div>

      {/* Optional read-only contribution simulation */}
      <form
        onSubmit={handleApplySimulation}
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3.5 py-2.5"
      >
        <div className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Contexto de aporte: </span>
          {brief.contributionContext.simulationNote ??
            (brief.contributionContext.plannedAmount
              ? `Meta mensal declarada: ${brief.contributionContext.currency} ${brief.contributionContext.plannedAmount} (apenas referência informativa).`
              : 'Nenhum valor de aporte definido. O Atlas prioriza estudo sem inventar valores.')}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="simulate-contribution-input" className="sr-only">
            Simular aporte (R$)
          </label>
          <input
            id="simulate-contribution-input"
            data-testid="decision-brief-contribution-input"
            type="text"
            inputMode="decimal"
            value={draftAmount}
            onChange={(e) => setDraftAmount(e.target.value)}
            placeholder="Simular aporte (ex: 1000.00)"
            className="h-9 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
          />
          <button
            type="submit"
            data-testid="decision-brief-simulate-button"
            disabled={isSimulating || isComparing}
            className="h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSimulating ? 'Simulando...' : 'Simular distribuição'}
          </button>
          <button
            type="button"
            data-testid="decision-brief-compare-button"
            disabled={isSimulating || isComparing}
            onClick={() => void handleCompareScenarios()}
            className="h-9 rounded-lg border border-[var(--accent)] bg-transparent px-3 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
          >
            {isComparing ? 'Comparando...' : 'Comparar cenários'}
          </button>
          {(appliedAmount || simulationResult || comparisonResult) && (
            <button
              type="button"
              onClick={handleClearSimulation}
              className="h-9 rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Limpar
            </button>
          )}
        </div>
        {inputError && (
          <p className="w-full text-xs text-rose-400" role="alert">
            {inputError}
          </p>
        )}
      </form>

      {/* APP-16T: Contribution Allocation Simulation Results Panel */}
      {simulationResult && (
        <div
          data-testid="contribution-simulation-panel"
          className="mt-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--surface-elevated)] p-4 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Proposta simulada de distribuição — {simulationResult.currency} {simulationResult.contributionAmount}
              </h3>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                Alocado: {simulationResult.currency} {simulationResult.allocatedAmount} · Não alocado: {simulationResult.currency} {simulationResult.unallocatedAmount}
              </p>
            </div>
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
              {simulationResult.dataQuality.allocatedAssetsCount} ativo(s) simulado(s)
            </span>
          </div>

          {simulationResult.warnings.length > 0 && (
            <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
              {simulationResult.warnings.map((w, idx) => (
                <p key={idx} className="leading-relaxed">
                  {w}
                </p>
              ))}
            </div>
          )}

          {simulationResult.allocations.length > 0 ? (
            <div className="mt-3 grid gap-2.5 md:grid-cols-3">
              {simulationResult.allocations.map((alloc) => (
                <div
                  key={alloc.assetId || alloc.ticker}
                  data-testid={`simulation-card-${alloc.ticker}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-sm text-[var(--text-primary)]">{alloc.ticker}</span>
                    <span className="font-semibold text-xs text-[var(--accent)]">
                      {simulationResult.currency} {alloc.targetAmount} ({alloc.allocationPercent}%)
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {alloc.estimatedUnits !== null
                      ? `≈ ${alloc.estimatedUnits} unidades (a R$ ${alloc.unitPrice})`
                      : 'Quantidade não estimada — cotação desatualizada'}
                  </div>
                  {alloc.reasons.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-3.5 text-[10px] text-[var(--text-secondary)]">
                      {alloc.reasons.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--text-secondary)]">
              {simulationResult.warnings[0] || 'Nenhum ativo elegível para alocação neste valor de aporte.'}
            </div>
          )}

          {simulationResult.excludedAssets.length > 0 && (
            <div className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--text-secondary)]">
              <span className="font-semibold">Ativos não incluídos na distribuição: </span>
              {simulationResult.excludedAssets.map((ex) => `${ex.ticker} (${ex.reason})`).join(', ')}
            </div>
          )}

          {/* Action button to view projected portfolio */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-[11px] text-[var(--text-secondary)]">
              Deseja visualizar como a carteira e as classes ficariam após este aporte?
            </span>
            <button
              type="button"
              data-testid="decision-brief-view-projection-button"
              disabled={isProjecting}
              onClick={() => void handleLoadProjection()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50"
            >
              {isProjecting ? 'Calculando projeção...' : 'Ver carteira projetada'}
            </button>
          </div>

          <p className="mt-3 text-[10px] text-[var(--text-secondary)] italic">
            Simulação informativa. Nenhuma ordem é criada ou enviada.
          </p>
        </div>
      )}

      {/* APP-16U: Contribution Scenario Comparison Results Panel */}
      {comparisonResult && (
        <div
          data-testid="scenario-comparison-panel"
          className="mt-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--surface-elevated)] p-4 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Comparação de cenários — {comparisonResult.currency} {comparisonResult.contributionAmount}
              </h3>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                Simulações independentes para o mesmo valor de aporte sob diferentes critérios de priorização.
              </p>
            </div>
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
              3 cenários simulados
            </span>
          </div>

          {/* Scenario Selection Tabs */}
          <div
            role="tablist"
            aria-label="Cenários de simulação"
            className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] pb-2.5"
          >
            {comparisonResult.scenarios.map((scen) => {
              const isSelected = selectedScenarioTab === scen.id;
              const testId =
                scen.id === 'CAUTIOUS'
                  ? 'scenario-tab-cautious'
                  : scen.id === 'BALANCED'
                    ? 'scenario-tab-balanced'
                    : 'scenario-tab-opportunity';

              return (
                <button
                  key={scen.id}
                  type="button"
                  role="tab"
                  id={`tab-${scen.id.toLowerCase()}`}
                  aria-selected={isSelected}
                  data-testid={testId}
                  onClick={() => setSelectedScenarioTab(scen.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {scen.label}
                </button>
              );
            })}
          </div>

          {/* Active Scenario Details */}
          {(() => {
            const activeScenario =
              comparisonResult.scenarios.find((s) => s.id === selectedScenarioTab) ??
              comparisonResult.scenarios[1] ??
              comparisonResult.scenarios[0];
            if (!activeScenario) return null;

            return (
              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--text-secondary)] italic">
                    <span className="font-semibold text-[var(--text-primary)] not-italic">{activeScenario.label}: </span>
                    {activeScenario.description}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Alocado: {comparisonResult.currency} {activeScenario.allocatedAmount} · Não alocado: {comparisonResult.currency} {activeScenario.unallocatedAmount}
                  </p>
                </div>

                {activeScenario.warnings.length > 0 && (
                  <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                    {activeScenario.warnings.map((w, idx) => (
                      <p key={idx} className="leading-relaxed">
                        {w}
                      </p>
                    ))}
                  </div>
                )}

                {activeScenario.allocations.length > 0 ? (
                  <div className="mt-3 grid gap-2.5 md:grid-cols-3">
                    {activeScenario.allocations.map((alloc) => (
                      <div
                        key={alloc.assetId || alloc.ticker}
                        data-testid={`simulation-card-${alloc.ticker}`}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-sm text-[var(--text-primary)]">{alloc.ticker}</span>
                          <span className="font-semibold text-xs text-[var(--accent)]">
                            {comparisonResult.currency} {alloc.targetAmount} ({alloc.allocationPercent}%)
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                          {alloc.estimatedUnits !== null
                            ? `≈ ${alloc.estimatedUnits} unidades (a R$ ${alloc.unitPrice})`
                            : 'Quantidade não estimada — cotação desatualizada'}
                        </div>
                        {alloc.reasons.length > 0 && (
                          <ul className="mt-2 list-disc space-y-0.5 pl-3.5 text-[10px] text-[var(--text-secondary)]">
                            {alloc.reasons.map((r, idx) => (
                              <li key={idx}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--text-secondary)]">
                    {activeScenario.warnings[0] || 'Nenhum ativo elegível para alocação neste cenário com este valor.'}
                  </div>
                )}

                {activeScenario.excludedAssets.length > 0 && (
                  <div className="mt-3 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-secondary)]">
                    <span className="font-semibold">Ativos não incluídos neste cenário: </span>
                    {activeScenario.excludedAssets.map((ex) => `${ex.ticker} (${ex.reason})`).join(', ')}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Comparison Insights */}
          {comparisonResult.comparisonInsights.length > 0 && (
            <div
              data-testid="scenario-comparison-insights"
              className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <h4 className="font-bold text-xs text-[var(--text-primary)]">
                Destaques comparativos entre cenários:
              </h4>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-[var(--text-secondary)]">
                {comparisonResult.comparisonInsights.map((insight, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Comparative Table / Stack */}
          {comparisonResult.scenarios.some((s) => s.allocations.length > 0) && (
            <div data-testid="scenario-comparison-table" className="mt-4">
              <h4 className="font-bold text-xs text-[var(--text-primary)] mb-2">
                Resumo comparativo de alocação por ativo:
              </h4>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-hidden rounded-lg border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface)] text-[var(--text-secondary)]">
                    <tr>
                      <th className="p-2.5 font-semibold">Ativo</th>
                      <th className="p-2.5 font-semibold text-right">Mais cauteloso</th>
                      <th className="p-2.5 font-semibold text-right">Balanceado</th>
                      <th className="p-2.5 font-semibold text-right">Mais foco em oportunidades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-[var(--surface-elevated)]">
                    {Array.from(
                      new Set(
                        comparisonResult.scenarios.flatMap((s) => s.allocations.map((a) => a.ticker)),
                      ),
                    ).map((ticker) => {
                      const cAlloc = comparisonResult.scenarios.find((s) => s.id === 'CAUTIOUS')?.allocations.find((a) => a.ticker === ticker);
                      const bAlloc = comparisonResult.scenarios.find((s) => s.id === 'BALANCED')?.allocations.find((a) => a.ticker === ticker);
                      const oAlloc = comparisonResult.scenarios.find((s) => s.id === 'OPPORTUNITY_FOCUS')?.allocations.find((a) => a.ticker === ticker);

                      return (
                        <tr key={ticker} className="hover:bg-[var(--surface)]/50">
                          <td className="p-2.5 font-bold text-[var(--text-primary)]">{ticker}</td>
                          <td className="p-2.5 text-right text-[var(--text-secondary)]">
                            {cAlloc ? `${cAlloc.allocationPercent}% (${comparisonResult.currency} ${cAlloc.targetAmount})` : '—'}
                          </td>
                          <td className="p-2.5 text-right font-medium text-[var(--text-primary)]">
                            {bAlloc ? `${bAlloc.allocationPercent}% (${comparisonResult.currency} ${bAlloc.targetAmount})` : '—'}
                          </td>
                          <td className="p-2.5 text-right text-[var(--accent)] font-medium">
                            {oAlloc ? `${oAlloc.allocationPercent}% (${comparisonResult.currency} ${oAlloc.targetAmount})` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stack View */}
              <div className="md:hidden space-y-2">
                {Array.from(
                  new Set(
                    comparisonResult.scenarios.flatMap((s) => s.allocations.map((a) => a.ticker)),
                  ),
                ).map((ticker) => {
                  const cAlloc = comparisonResult.scenarios.find((s) => s.id === 'CAUTIOUS')?.allocations.find((a) => a.ticker === ticker);
                  const bAlloc = comparisonResult.scenarios.find((s) => s.id === 'BALANCED')?.allocations.find((a) => a.ticker === ticker);
                  const oAlloc = comparisonResult.scenarios.find((s) => s.id === 'OPPORTUNITY_FOCUS')?.allocations.find((a) => a.ticker === ticker);

                  return (
                    <div
                      key={ticker}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs"
                    >
                      <span className="font-bold text-sm text-[var(--text-primary)]">{ticker}</span>
                      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px] text-[var(--text-secondary)]">
                        <div>
                          <div className="text-[10px] text-[var(--text-secondary)]">Cauteloso</div>
                          <div className="font-semibold">{cAlloc ? `${cAlloc.allocationPercent}%` : '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-secondary)]">Balanceado</div>
                          <div className="font-semibold text-[var(--text-primary)]">{bAlloc ? `${bAlloc.allocationPercent}%` : '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-secondary)]">Oportunidade</div>
                          <div className="font-semibold text-[var(--accent)]">{oAlloc ? `${oAlloc.allocationPercent}%` : '—'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action button to view projected portfolio comparison */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-[11px] text-[var(--text-secondary)]">
              Deseja projetar o impacto de cada cenário sobre a composição da carteira?
            </span>
            <button
              type="button"
              data-testid="decision-brief-view-scenarios-projection-button"
              disabled={isProjectingScenarios}
              onClick={() => void handleLoadProjection()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50"
            >
              {isProjectingScenarios ? 'Calculando projeções...' : 'Ver projeção dos cenários'}
            </button>
          </div>

          <p className="mt-3 text-[10px] text-[var(--text-secondary)] italic">
            Os cenários são simulações informativas. Nenhuma ordem é criada ou enviada.
          </p>
        </div>
      )}

      {/* APP-16V: Projected Portfolio After Contribution Panel */}
      {showProjection && (projectionResult || projectedScenariosResult) && (
        <div
          data-testid="portfolio-projection-panel"
          className="mt-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--surface-elevated)] p-4 text-xs"
        >
          {projectionResult && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Projeção da carteira pós-aporte — R$ {projectionResult.contributionAmount}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    Como a carteira ficaria caso a distribuição simulada fosse concretizada (com cotações e preços constantes).
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                    Alocado: R$ {projectionResult.allocatedAmount}
                  </span>
                  {projectionResult.unallocatedCents > 0 && (
                    <span className="ml-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                      Não alocado: R$ {projectionResult.unallocatedAmount}
                    </span>
                  )}
                  {projectionResult.dataQuality && (
                    <span
                      data-testid="projection-quality-badge"
                      className={`ml-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                        projectionResult.dataQuality.projectionComplete
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {projectionResult.dataQuality.valuedAssets}/{projectionResult.dataQuality.totalAssets} posições avaliadas
                    </span>
                  )}
                </div>
              </div>

              {projectionResult.dataQuality?.weightBasis === 'VALUED_POSITIONS_ONLY' && (
                <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">
                  Valuation parcial: pesos calculados apenas sobre as posições com valuation disponível. A projeção não cobre 100% da carteira.
                </div>
              )}

              {/* Warnings */}
              {projectionResult.warnings.length > 0 && (
                <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                  {projectionResult.warnings.map((w, idx) => (
                    <p key={idx} className="leading-relaxed">
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {/* Progress and Concentration Metrics */}
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 md:grid-cols-4">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                  <span className="text-[10px] text-[var(--text-secondary)]">Ativos Projetados</span>
                  <div className="mt-1 font-bold text-sm text-[var(--text-primary)]">
                    R$ {projectionResult.after.investedAssetValue}
                  </div>
                  <div className="text-[10px] text-emerald-400">
                    + R$ {projectionResult.deltas.investedAssetValueDelta}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                  <span className="text-[10px] text-[var(--text-secondary)]">Evolução dos Gaps</span>
                  <div className="mt-1 font-bold text-sm text-[var(--text-primary)]">
                    {projectionResult.targetProgress.improvedCount} classe(s) melhorada(s)
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    {projectionResult.targetProgress.worsenedCount} piorada(s) · {projectionResult.targetProgress.unchangedCount} sem alteração
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                  <span className="text-[10px] text-[var(--text-secondary)]">Maior Ativo</span>
                  <div className="mt-1 font-bold text-sm text-[var(--text-primary)]">
                    {projectionResult.concentration.largestAssetTickerAfter ?? '—'} ({projectionResult.concentration.largestAssetWeightAfter}%)
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    Antes: {projectionResult.concentration.largestAssetTickerBefore ?? '—'} ({projectionResult.concentration.largestAssetWeightBefore}%)
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                  <span className="text-[10px] text-[var(--text-secondary)]">Concentração Top 3</span>
                  <div className="mt-1 font-bold text-sm text-[var(--text-primary)]">
                    {projectionResult.concentration.top3WeightAfter}%
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    Antes: {projectionResult.concentration.top3WeightBefore}% ({projectionResult.concentration.deltaTop3Weight >= 0 ? `+${projectionResult.concentration.deltaTop3Weight}` : projectionResult.concentration.deltaTop3Weight} pp)
                  </div>
                </div>
              </div>

              {/* Class Projection Breakdown */}
              <div className="mt-3.5">
                <h4 className="font-semibold text-xs text-[var(--text-primary)]">
                  Projeção por Classe de Ativos
                </h4>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {projectionResult.classProjection.map((cls) => {
                    const statusColor =
                      cls.status === 'IMPROVED'
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                        : cls.status === 'WORSENED'
                          ? 'border-rose-500/30 bg-rose-500/5 text-rose-400'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]';

                    return (
                      <div
                        key={cls.classId}
                        data-testid={`projected-class-${cls.classId}`}
                        className={`rounded-lg border p-3 ${statusColor}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-[var(--text-primary)]">{cls.label}</span>
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold border border-current">
                            {cls.status === 'IMPROVED'
                              ? cls.isPartial ? 'APROXIMOU (ESTIMATIVA)' : 'APROXIMOU DA META'
                              : cls.status === 'WORSENED'
                                ? cls.isPartial ? 'DISTANCIOU (ESTIMATIVA)' : 'DISTANCIOU DA META'
                                : cls.status === 'UNCHANGED'
                                  ? 'ESTÁVEL'
                                  : 'SEM META'}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-[10px] text-[var(--text-secondary)]">Peso Atual</span>
                            <div className="font-semibold text-[var(--text-secondary)]">{cls.beforeWeightPercent}%</div>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--text-secondary)]">Peso Projetado</span>
                            <div className="font-bold text-[var(--text-primary)]">{cls.afterWeightPercent}%</div>
                          </div>
                        </div>
                        {cls.targetWeightPercent !== undefined && (
                          <div className="mt-1.5 border-t border-current/20 pt-1 text-[10px]">
                            Meta: {cls.targetWeightPercent}% · Gap projetado: {cls.afterGapPercent! >= 0 ? `+${cls.afterGapPercent}%` : `${cls.afterGapPercent}%`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assets Projection Breakdown */}
              <div className="mt-3.5">
                <h4 className="font-semibold text-xs text-[var(--text-primary)]">
                  Projeção por Ativo
                </h4>
                <div className="mt-2 space-y-1.5">
                  {projectionResult.assetProjection.map((asset) => (
                    <div
                      key={asset.assetId}
                      data-testid={`projected-asset-${asset.ticker}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                    >
                      <div className="min-w-[120px]">
                        <span className="font-bold text-[var(--text-primary)]">{asset.ticker}</span>
                        <span className="ml-1 text-[10px] text-[var(--text-secondary)]">({asset.name})</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-[11px]">
                        <div>
                          <span className="text-[10px] text-[var(--text-secondary)]">Aporte simulado: </span>
                          <span className="font-semibold text-[var(--accent)]">
                            {asset.contributionCents > 0 ? `R$ ${asset.simulatedContribution}` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--text-secondary)]">Peso: </span>
                          <span>
                            {asset.beforeWeightPercent !== null ? `${asset.beforeWeightPercent}%` : 'Indisponível'} →{' '}
                          </span>
                          <strong className="text-[var(--text-primary)]">
                            {asset.afterWeightPercent !== null ? `${asset.afterWeightPercent}%` : 'Indisponível'}
                          </strong>
                          {asset.deltaWeightPercent !== null && (
                            <span className="ml-1 text-[10px] text-[var(--text-secondary)]">
                              ({asset.deltaWeightPercent >= 0 ? `+${asset.deltaWeightPercent}` : asset.deltaWeightPercent} pp)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {projectedScenariosResult && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Projeção comparada dos 3 cenários — R$ {projectedScenariosResult.contributionAmount}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    Comparativo da carteira projetada em cada modo de distribuição com base nas mesmas premissas de preço.
                  </p>
                </div>
              </div>

              {/* Scenario cards side by side */}
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {projectedScenariosResult.scenarios.map((scen) => (
                  <div
                    key={scen.scenarioId}
                    data-testid={`projected-scenario-card-${scen.scenarioId}`}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs"
                  >
                    <span className="font-bold text-sm text-[var(--text-primary)]">{scen.scenarioLabel}</span>
                    <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{scen.description}</p>
                    <div className="mt-2.5 space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Valor projetado:</span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          R$ {scen.projection.after.investedAssetValue}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Gaps melhorados:</span>
                        <span className="font-semibold text-emerald-400">
                          {scen.projection.targetProgress.improvedCount} classe(s)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Maior ativo pós-aporte:</span>
                        <span>
                          {scen.projection.concentration.largestAssetTickerAfter} ({scen.projection.concentration.largestAssetWeightAfter}%)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Top 3 concentração:</span>
                        <span>{scen.projection.concentration.top3WeightAfter}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {projectedScenariosResult.comparisonInsights.length > 0 && (
                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[11px] text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">Observações comparativas: </span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-3.5">
                    {projectedScenariosResult.comparisonInsights.map((ins, idx) => (
                      <li key={idx}>{ins}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <p className="mt-3 text-[10px] text-[var(--text-secondary)] italic">
            Projeções matemáticas informativas. Não consideram valorização de cotas nem proventos futuros. Zero ordens emitidas.
          </p>
        </div>
      )}

      {/* Contribution Plan Progress Tracking (APP-16W) */}
      {progressResult && (
        <ContributionProgressCard progress={progressResult} />
      )}

      {isEmpty ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-secondary)]">
          Nenhum ativo elegível encontrado nesta carteira para priorização de estudo no momento.
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {topThree.map((item) => (
              <PriorityCard
                key={item.assetId || item.ticker}
                item={item}
                onScrollToRadar={handleScrollToRadar}
              />
            ))}
          </div>

          {brief.fiiRotation && (
            <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3.5 text-xs">
              <div className="flex items-center gap-2 font-semibold text-sky-300">
                <span>Giro de proventos de FIIs (proventos estimados)</span>
              </div>
              <p className="mt-1 text-[var(--text-primary)]">{brief.fiiRotation.summaryText}</p>
            </div>
          )}

          {brief.recentMaterialChanges && brief.recentMaterialChanges.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5 text-xs">
              <h3 className="font-semibold text-[var(--text-primary)]">
                O que mudou desde a última análise
              </h3>
              <ul className="mt-1.5 space-y-1 text-[var(--text-secondary)]">
                {brief.recentMaterialChanges.slice(0, 5).map((chg, idx) => (
                  <li key={idx} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong className="text-[var(--text-primary)]">{chg.ticker}:</strong>{' '}
                      {chg.label}
                    </span>
                    {isSafeHttpUrl(chg.canonicalUrl) && (
                      <a
                        href={chg.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                      >
                        Ver notícia ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-[11px] text-[var(--text-secondary)]">
        Síntese informativa baseada nos dados atuais da carteira ({brief.modelVersion}). Não constitui recomendação de compra ou venda nem executa ordens.
      </p>
    </section>
  );
}

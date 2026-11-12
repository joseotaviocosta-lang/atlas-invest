import React, { useState } from 'react';
import { useDecisionBrief } from '../useDecisionBrief';
import type {
  DecisionTierDto,
  PortfolioDecisionPriorityItemDto,
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

  const { data: brief, isLoading, isError, error, refresh, isRefreshing } = useDecisionBrief(
    portfolioId,
    appliedAmount,
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

  const handleApplySimulation = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = draftAmount.trim().replace(',', '.');
    if (!normalized) {
      setAppliedAmount(undefined);
      setInputError(null);
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(normalized) || /^0+(\.0{1,2})?$/.test(normalized)) {
      setInputError('Informe um valor positivo com até 2 casas decimais (ex.: 1000.00).');
      return;
    }
    setInputError(null);
    setAppliedAmount(normalized);
  };

  const handleClearSimulation = () => {
    setDraftAmount('');
    setAppliedAmount(undefined);
    setInputError(null);
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
            type="text"
            inputMode="decimal"
            value={draftAmount}
            onChange={(e) => setDraftAmount(e.target.value)}
            placeholder="Simular aporte (ex: 1000.00)"
            className="h-9 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
          />
          <button
            type="submit"
            className="h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-white hover:opacity-90"
          >
            Simular
          </button>
          {appliedAmount && (
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

          {brief.recentMaterialChanges.length > 0 && (
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

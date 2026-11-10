import React, { useState } from 'react';
import { colors, spacing, borderRadius, formatCurrency, formatPercentage } from '@atlas/ui';
import { Card, Badge, Button } from '../../../components/ui';
import { useOpportunityRadar } from '../useOpportunityRadar';
import { OpportunityAnalysisModal } from './OpportunityAnalysisModal';
import type { OpportunityRadarItemDto } from '../types';

export interface OpportunityRadarSectionProps {
  portfolioId: string | null;
  initialTab?: 'general' | 'fii';
}

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

export const OpportunityRadarSection: React.FC<OpportunityRadarSectionProps> = ({
  portfolioId,
  initialTab = 'general',
}) => {
  const [enableDividendStrategy, setEnableDividendStrategy] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const { radar, isLoading, refresh, isRefreshing } = useOpportunityRadar(
    portfolioId,
    enableDividendStrategy ? undefined : 'NO_CALENDAR',
  );
  const [selectedItem, setSelectedItem] = useState<OpportunityRadarItemDto | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'fii'>(initialTab);

  if (!portfolioId) {
    return null;
  }

  const generalItems = radar?.items ?? [];
  const fiiItems = radar?.fiiItems ?? [];
  const currentItems = activeTab === 'general' ? generalItems : fiiItems;

  const hasAnyValidCalendarInFii = fiiItems.some(
    (item) =>
      item.dividendCalendar &&
      item.dividendCalendar.eventStatus !== 'UNKNOWN' &&
      (Boolean(item.dividendCalendar.recordDate) || Boolean(item.dividendCalendar.paymentDate)),
  );

  const activeCoverage =
    activeTab === 'general'
      ? radar?.overallCoveragePercent
      : (radar?.fiiCoveragePercent ?? radar?.overallCoveragePercent);

  const coverageBadgeText =
    activeCoverage !== undefined
      ? activeTab === 'general'
        ? `Cobertura: ${activeCoverage}%`
        : `Cobertura FIIs: ${activeCoverage}%`
      : null;

  const activeRankCount = currentItems.length;
  const activeRankBadgeLabel =
    activeRankCount > 0 ? `TOP ${activeRankCount}` : 'TOP 5';

  const activeSubtitle =
    activeTab === 'general'
      ? 'Ativos da sua carteira que merecem atenção para possível novo aporte • Fontes: BRAPI • B3 • RSS Financeiro'
      : 'Fundos Imobiliários da sua carteira analisados por renda, valuation e qualidade patrimonial';

  const activeLowConfidenceItems =
    activeTab === 'general'
      ? (radar?.lowConfidenceItems ?? [])
      : (radar?.lowConfidenceItems ?? []).filter((i) => i.assetType === 'FII');

  // Format updated time
  const updatedTime = React.useMemo(() => {
    if (!radar?.updatedAt && !radar?.items?.[0]?.updatedAt) return null;
    const dateStr = radar?.items?.[0]?.updatedAt || radar?.updatedAt;
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  }, [radar]);

  const handleRefresh = async () => {
    try {
      setRefreshError(null);
      await refresh();
    } catch (err) {
      console.error('Failed to refresh opportunity radar:', err);
      setRefreshError('Não foi possível atualizar a análise. Exibindo último resultado disponível.');
    }
  };

  return (
    <div
      style={{ marginBottom: '28px' }}
      data-testid="opportunity-radar-section"
      aria-label="Radar Diário de Oportunidades"
    >
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '1.125rem',
                fontWeight: 600,
                color: colors.textPrimary,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>🎯</span> Oportunidades de Hoje
            </h3>
            <Badge variant="primary" data-testid="radar-rank-badge">{activeRankBadgeLabel}</Badge>
            {coverageBadgeText && (
              <Badge variant="neutral" data-testid="radar-coverage-badge">
                {coverageBadgeText}
              </Badge>
            )}
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem', color: colors.textSecondary }}>
            {activeSubtitle}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {updatedTime && (
            <span
              style={{ fontSize: '0.75rem', color: colors.textSecondary }}
              data-testid="radar-updated-time"
            >
              Análise atualizada às {updatedTime}
            </span>
          )}
          {isRefreshing && (
            <span
              style={{ fontSize: '0.75rem', color: colors.accent, fontWeight: 600 }}
              data-testid="radar-refreshing-indicator"
            >
              • Atualizando...
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="refresh-opportunity-radar-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px' }}
          >
            <span
              style={{
                display: 'inline-block',
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
              }}
            >
              🔄
            </span>
            {isRefreshing ? 'Atualizando análise...' : 'Atualizar análise'}
          </Button>
        </div>
      </div>

      {/* Refresh Error Banner (APP-16I-R3 PARTE R) */}
      {refreshError && (
        <div
          data-testid="radar-refresh-error"
          style={{
            padding: '8px 12px',
            backgroundColor: `${colors.warning}15`,
            borderRadius: `${borderRadius.sm}px`,
            border: `1px solid ${colors.warning}`,
            color: colors.warning,
            fontSize: '0.8125rem',
            marginBottom: `${spacing.sm}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{refreshError}</span>
          <button
            type="button"
            onClick={() => setRefreshError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: colors.warning,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.875rem',
              padding: '0 4px',
            }}
            aria-label="Fechar mensagem de erro"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs / Segment Control & Strategy Toggle (APP-16H / APP-16I / APP-16I-R3) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${spacing.xs}px`,
          marginBottom: `${spacing.md}px`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
          }}
        >
          <div
            role="tablist"
            aria-label="Visualizações do Radar de Oportunidades"
            style={{
              display: 'inline-flex',
              backgroundColor: colors.surfaceElevated,
              borderRadius: `${borderRadius.md}px`,
              padding: '4px',
              border: `1px solid ${colors.border}`,
              gap: '4px',
            }}
          >
            <button
              type="button"
              role="tab"
              id="tab-radar-general"
              aria-selected={activeTab === 'general'}
              aria-controls="panel-radar-content"
              tabIndex={activeTab === 'general' ? 0 : -1}
              onClick={() => setActiveTab('general')}
              data-testid="radar-tab-general"
              style={{
                padding: '6px 14px',
                borderRadius: `${borderRadius.sm}px`,
                border: 'none',
                backgroundColor: activeTab === 'general' ? colors.surface : 'transparent',
                color: activeTab === 'general' ? colors.textPrimary : colors.textSecondary,
                fontWeight: activeTab === 'general' ? 700 : 500,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'general' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Top 5 Geral
            </button>
            <button
              type="button"
              role="tab"
              id="tab-radar-fii"
              aria-selected={activeTab === 'fii'}
              aria-controls="panel-radar-content"
              tabIndex={activeTab === 'fii' ? 0 : -1}
              onClick={() => setActiveTab('fii')}
              data-testid="radar-tab-fii"
              style={{
                padding: '6px 14px',
                borderRadius: `${borderRadius.sm}px`,
                border: 'none',
                backgroundColor: activeTab === 'fii' ? colors.surface : 'transparent',
                color: activeTab === 'fii' ? colors.textPrimary : colors.textSecondary,
                fontWeight: activeTab === 'fii' ? 700 : 500,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'fii' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Top 5 FIIs
            </button>
          </div>

          {activeTab === 'fii' && (
            <button
              type="button"
              onClick={() => setEnableDividendStrategy((v) => !v)}
              data-testid="toggle-dividend-strategy-btn"
              aria-pressed={enableDividendStrategy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: `${borderRadius.sm}px`,
                border: `1px solid ${enableDividendStrategy ? colors.accent : colors.border}`,
                backgroundColor: enableDividendStrategy ? `${colors.accent}20` : colors.surfaceElevated,
                color: enableDividendStrategy ? colors.accent : colors.textSecondary,
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{`♻ Estratégia de Proventos: ${enableDividendStrategy ? 'Ativa' : 'Padrão'}`}</span>
            </button>
          )}
        </div>

        {/* Strategy active but no events available notice (APP-16I-R3 PARTE N) */}
        {activeTab === 'fii' && enableDividendStrategy && fiiItems.length > 0 && !hasAnyValidCalendarInFii && (
          <div
            data-testid="strategy-no-events-notice"
            style={{
              padding: '6px 12px',
              backgroundColor: colors.surfaceElevated,
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
              fontSize: '0.75rem',
              color: colors.textSecondary,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: `${spacing.xs}px`,
            }}
          >
            <span>ℹ️</span> Estratégia ativa, mas nenhum calendário anunciado foi encontrado para os FIIs analisados.
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && !radar && (
        <Card>
          <div
            style={{
              padding: `${spacing.lg}px`,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: `${spacing.sm}px`,
            }}
            data-testid="radar-loading"
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                border: `2px solid ${colors.surfaceElevated}`,
                borderTopColor: colors.accent,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
              Calculando ranking do Radar de Oportunidades...
            </span>
          </div>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && currentItems.length === 0 && (
        <Card>
          <div
            style={{
              padding: `${spacing.lg}px`,
              textAlign: 'center',
              color: colors.textSecondary,
              fontSize: '0.875rem',
            }}
            data-testid="radar-empty"
          >
            {activeTab === 'fii'
              ? 'Nenhum FII da carteira atingiu a pontuação mínima ou dados insuficientes para análise no momento.'
              : 'Nenhum ativo da carteira atingiu a pontuação mínima ou dados insuficientes para análise no momento.'}
          </div>
        </Card>
      )}

      {/* Cards List / Grid (APP-16H: Wrapped in accessible tabpanel) */}
      <div
        id="panel-radar-content"
        role="tabpanel"
        aria-labelledby={activeTab === 'general' ? 'tab-radar-general' : 'tab-radar-fii'}
      >
        {currentItems.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: `${spacing.md}px`,
              marginBottom: `${spacing.md}px`,
            }}
            data-testid="radar-cards-grid"
          >
            {currentItems.map((item, index) => {
              const rank = index + 1;
              const scoreColor =
                item.score >= 75
                  ? colors.positive
                  : item.score >= 50
                  ? colors.accent
                  : colors.warning;

              const formattedPrice = formatCurrency(parseFloat(item.currentPrice) || 0, 'BRL');
              const formattedWeight = formatPercentage(item.portfolioWeight || 0);
              const dailyChange = item.dailyChangePercent;
              const formattedChange =
                dailyChange !== null
                  ? `${dailyChange >= 0 ? '+' : ''}${dailyChange.toFixed(2)}%`
                  : '—';
              const changeColor =
                dailyChange !== null
                  ? dailyChange > 0
                    ? colors.positive
                    : dailyChange < 0
                    ? colors.negative
                    : colors.textSecondary
                  : colors.textSecondary;

              const confidenceLabel =
                item.confidence === 'HIGH'
                  ? 'Alta'
                  : item.confidence === 'MEDIUM'
                  ? 'Média'
                  : item.confidence === 'LOW'
                  ? 'Baixa'
                  : 'Insuficiente';

              const confidenceVariant =
                item.confidence === 'HIGH'
                  ? 'success'
                  : item.confidence === 'MEDIUM'
                  ? 'neutral'
                  : item.confidence === 'LOW'
                  ? 'warning'
                  : 'negative';

              return (
                <Card key={item.ticker}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: `${spacing.sm}px`,
                      height: '100%',
                      justifyContent: 'space-between',
                    }}
                    data-testid={`opportunity-card-${item.ticker}`}
                  >
                    {/* Card Top Row: Rank, Ticker, Type, Score */}
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: `${spacing.xs}px`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: colors.surfaceElevated,
                              border: `1px solid ${colors.border}`,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: colors.textPrimary,
                            }}
                          >
                            #{rank}
                          </span>
                          <span
                            style={{
                              fontSize: '1.125rem',
                              fontWeight: 700,
                              color: colors.textPrimary,
                            }}
                          >
                            {item.ticker}
                          </span>
                          <Badge variant={item.assetType === 'FII' ? 'primary' : 'neutral'}>
                            {item.assetType === 'FII' ? 'FII' : 'AÇÃO'}
                          </Badge>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              fontSize: '1.25rem',
                              fontWeight: 800,
                              color: scoreColor,
                            }}
                          >
                            {item.score}
                          </span>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: colors.textSecondary,
                              fontWeight: 500,
                            }}
                          >
                            /100
                          </span>
                        </div>
                      </div>

                      {/* Subtitle / Asset Name & Confidence */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: `${spacing.sm}px`,
                          fontSize: '0.75rem',
                          color: colors.textSecondary,
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '180px',
                          }}
                          title={item.name}
                        >
                          {item.name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {item.assetType === 'FII' &&
                            item.components?.dividendCalendarFit !== undefined &&
                            item.components?.dividendCalendarFit !== null && (
                              <span data-testid={`calendar-fit-badge-${item.ticker}`}>
                                <Badge variant="primary">
                                  {`Calendário: ${item.components.dividendCalendarFit}/100`}
                                </Badge>
                              </span>
                            )}
                          <Badge variant={confidenceVariant}>Convicção: {confidenceLabel}</Badge>
                        </div>
                      </div>

                      {/* Score Bar */}
                      <div
                        style={{
                          width: '100%',
                          height: '4px',
                          borderRadius: '2px',
                          backgroundColor: colors.surfaceElevated,
                          overflow: 'hidden',
                          marginBottom: `${spacing.sm}px`,
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, item.score))}%`,
                            height: '100%',
                            backgroundColor: scoreColor,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>

                      {/* Key Metrics Row */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: `${spacing.xs}px`,
                          padding: `${spacing.xs}px 0`,
                          borderTop: `1px solid ${colors.border}`,
                          borderBottom: `1px solid ${colors.border}`,
                          marginBottom: `${spacing.sm}px`,
                          fontSize: '0.75rem',
                        }}
                      >
                        <div>
                          <div style={{ color: colors.textSecondary }}>Preço</div>
                          <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                            {formattedPrice}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: colors.textSecondary }}>Variação Dia</div>
                          <div style={{ fontWeight: 600, color: changeColor }}>
                            {formattedChange}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: colors.textSecondary }}>Peso Carteira</div>
                          <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                            {`${formattedWeight} (${item.portfolioQuantity} ${item.assetType === 'FII' ? 'cotas' : 'un.'})`}
                          </div>
                        </div>
                      </div>

                      {/* Dividend Calendar Snapshot for FII (APP-16I / APP-16I-R3) */}
                      {item.assetType === 'FII' && (
                        <div
                          data-testid={`fii-dividend-calendar-${item.ticker}`}
                          style={{
                            padding: '6px 8px',
                            borderRadius: `${borderRadius.sm}px`,
                            backgroundColor: colors.surfaceElevated,
                            border: `1px solid ${colors.border}`,
                            marginBottom: `${spacing.sm}px`,
                            fontSize: '0.75rem',
                          }}
                        >
                          {!item.dividendCalendar ||
                          item.dividendCalendar.eventStatus === 'UNKNOWN' ||
                          (!item.dividendCalendar.recordDate && !item.dividendCalendar.paymentDate) ? (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: colors.textSecondary,
                                flexWrap: 'wrap',
                                gap: '4px',
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>📅</span>
                                <span style={{ fontWeight: 600 }}>Calendário: sem evento anunciado</span>
                              </span>
                              <span style={{ fontSize: '0.6875rem', opacity: 0.8 }}>
                                Nenhum próximo evento anunciado disponível
                              </span>
                            </div>
                          ) : (
                            <>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: '2px',
                                }}
                              >
                                <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                                  {item.dividendCalendar.recordDate
                                    ? `📅 Data-com: ${formatShortDate(item.dividendCalendar.recordDate)}`
                                    : '📅 Calendário'}
                                </span>
                                {item.dividendCalendar.amountPerShare !== null &&
                                  item.dividendCalendar.amountPerShare !== undefined && (
                                    <span style={{ color: colors.positive, fontWeight: 700 }}>
                                      {`R$ ${item.dividendCalendar.amountPerShare.toFixed(2)}/cota`}
                                    </span>
                                  )}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  color: colors.textSecondary,
                                  fontSize: '0.6875rem',
                                  flexWrap: 'wrap',
                                  gap: '4px',
                                }}
                              >
                                <span>
                                  {item.dividendCalendar.paymentDate
                                    ? `Pagamento: ${formatShortDate(item.dividendCalendar.paymentDate)}`
                                    : ''}
                                  {item.dividendCalendar.exDate && (
                                    <span style={{ marginLeft: '4px', opacity: 0.8 }}>
                                      (ex: {formatShortDate(item.dividendCalendar.exDate)})
                                    </span>
                                  )}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {item.dividendCalendar.eligibilityStatus === 'RECORD_DATE_TODAY' && (
                                    <Badge variant="warning">Hoje data-com</Badge>
                                  )}
                                  {item.dividendCalendar.eligibilityStatus === 'EX_DIVIDEND' && (
                                    <Badge variant="neutral">
                                      {item.dividendCalendar.isPaymentPending
                                        ? 'Pagamento pendente • Data-com encerrada'
                                        : 'Ex-provento'}
                                    </Badge>
                                  )}
                                  {item.dividendCalendar.cashAvailableNow ? (
                                    <span
                                      style={{ color: colors.positive, fontWeight: 600 }}
                                      title="♻ Caixa de provento recente pode ser direcionado aqui"
                                    >
                                      ♻ Caixa de provento recente
                                    </span>
                                  ) : item.dividendCalendar.futureCashExpected ? (
                                    <span
                                      style={{ color: colors.accent, fontWeight: 600 }}
                                      title="🗓 Próxima rotação planejada"
                                    >
                                      🗓 Próxima rotação planejada
                                    </span>
                                  ) : item.dividendCalendar.sameMonthReinvestmentCandidate ? (
                                    <span style={{ color: colors.accent, fontWeight: 600 }}>
                                      ♻ Reinvestimento
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Favorable Reasons */}
                      <div style={{ marginBottom: `${spacing.xs}px` }}>
                        <div
                          style={{
                            fontSize: '0.6875rem',
                            textTransform: 'uppercase',
                            color: colors.positive,
                            fontWeight: 700,
                            marginBottom: '4px',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Destaques Positivos
                        </div>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: '16px',
                            fontSize: '0.75rem',
                            color: colors.textPrimary,
                            lineHeight: 1.4,
                          }}
                        >
                          {item.positives.slice(0, 3).map((r, i) => (
                            <li key={i} style={{ marginBottom: '2px' }}>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Risks */}
                      {item.risks.length > 0 && (
                        <div style={{ marginBottom: `${spacing.sm}px` }}>
                          <div
                            style={{
                              fontSize: '0.6875rem',
                              textTransform: 'uppercase',
                              color: colors.warning,
                              fontWeight: 700,
                              marginBottom: '4px',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Pontos de Atenção
                          </div>
                          <ul
                            style={{
                              margin: 0,
                              paddingLeft: '16px',
                              fontSize: '0.75rem',
                              color: colors.textSecondary,
                              lineHeight: 1.4,
                            }}
                          >
                            {item.risks.slice(0, 2).map((rk, i) => (
                              <li key={i} style={{ marginBottom: '2px' }}>
                                {rk}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Action Row */}
                    <div style={{ marginTop: `${spacing.xs}px` }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedItem(item)}
                        style={{ width: '100%', minHeight: '36px' }}
                        data-testid={`view-analysis-${item.ticker}`}
                      >
                        Ver análise completa →
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Section: Assets that deserve more data (APP-16G / APP-16H) */}
        {activeLowConfidenceItems.length > 0 && (
          <div style={{ marginBottom: '16px' }} data-testid="radar-low-confidence-section">
            <div
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                backgroundColor: `${colors.surfaceElevated}`,
                borderRadius: `${borderRadius.md}px`,
                border: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.875rem' }}>🔍</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textSecondary }}>
                    {activeTab === 'fii'
                      ? `FIIs que merecem mais dados (${activeLowConfidenceItems.length})`
                      : `Ativos que merecem mais dados (${activeLowConfidenceItems.length})`}
                  </span>
                </div>
                <span style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
                  {activeTab === 'fii'
                    ? 'Omitidos do Top FIIs por cobertura analítica insuficiente'
                    : 'Omitidos do Top 5 por cobertura analítica insuficiente'}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {activeLowConfidenceItems.map((item) => (
                  <button
                    key={item.ticker}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      backgroundColor: colors.surface,
                      border: `1px solid ${colors.border}`,
                      borderRadius: `${borderRadius.sm}px`,
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      color: colors.textPrimary,
                    }}
                    data-testid={`low-conf-${item.ticker}`}
                  >
                    <span style={{ fontWeight: 600 }}>{item.ticker}</span>
                    <span style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
                      ({item.confidence === 'LOW' ? 'Baixa Convicção' : 'Dados Insuficientes'})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Discrete Educational / Safety Disclaimer */}
      <div
        style={{
          padding: `${spacing.sm}px ${spacing.md}px`,
          backgroundColor: colors.surfaceElevated,
          borderRadius: `${borderRadius.md}px`,
          border: `1px solid ${colors.border}`,
          fontSize: '0.75rem',
          color: colors.textSecondary,
          lineHeight: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.xs}px`,
        }}
        data-testid="radar-disclaimer"
      >
        <span style={{ fontSize: '1rem' }}>ℹ️</span>
        <span>
          <strong>Radar Informativo:</strong> Análise analítica baseada em indicadores da carteira e
          do mercado. Não constitui recomendação de investimento, não executa ordens e não garante
          rentabilidade futura.
        </span>
      </div>

      {/* Detail Modal */}
      <OpportunityAnalysisModal
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
      />
    </div>
  );
};

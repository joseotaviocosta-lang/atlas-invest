import React, { useState } from 'react';
import { colors, spacing, borderRadius, formatCurrency, formatPercentage } from '@atlas/ui';
import { Card, Badge, Button } from '../../../components/ui';
import { useOpportunityRadar } from '../useOpportunityRadar';
import { OpportunityAnalysisModal } from './OpportunityAnalysisModal';
import type { OpportunityRadarItemDto } from '../types';

export interface OpportunityRadarSectionProps {
  portfolioId: string | null;
}

export const OpportunityRadarSection: React.FC<OpportunityRadarSectionProps> = ({ portfolioId }) => {
  const { radar, isLoading, refresh, isRefreshing } = useOpportunityRadar(portfolioId);
  const [selectedItem, setSelectedItem] = useState<OpportunityRadarItemDto | null>(null);

  if (!portfolioId) {
    return null;
  }

  const items = radar?.items ?? [];

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
      await refresh();
    } catch (err) {
      console.error('Failed to refresh opportunity radar:', err);
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
            <Badge variant="primary">TOP 5</Badge>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem', color: colors.textSecondary }}>
            Ativos da sua carteira que merecem atenção para possível novo aporte
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
      {!isLoading && items.length === 0 && (
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
            Nenhum ativo da carteira atingiu a pontuação mínima ou dados insuficientes para análise
            no momento.
          </div>
        </Card>
      )}

      {/* Cards List / Grid */}
      {items.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: `${spacing.md}px`,
            marginBottom: `${spacing.md}px`,
          }}
          data-testid="radar-cards-grid"
        >
          {items.map((item, index) => {
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
                      <Badge variant={confidenceVariant}>Convicção: {confidenceLabel}</Badge>
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
                          {formattedWeight} ({item.portfolioQuantity} un.)
                        </div>
                      </div>
                    </div>

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

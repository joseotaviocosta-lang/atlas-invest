import React from 'react';
import { colors, borderRadius, spacing, formatCurrency, formatPercentage } from '@atlas/ui';
import { Modal, Badge, Button } from '../../../components/ui';
import type { OpportunityRadarItemDto } from '../types';

export interface OpportunityAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: OpportunityRadarItemDto | null;
}

const formatNewsDate = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '—';
  }
};

function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export const OpportunityAnalysisModal: React.FC<OpportunityAnalysisModalProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  if (!item) return null;

  const scoreColor =
    item.score >= 75 ? colors.positive : item.score >= 50 ? colors.accent : colors.warning;

  const formattedPrice = formatCurrency(parseFloat(item.currentPrice) || 0, 'BRL');
  const formattedWeight = formatPercentage(item.portfolioWeight || 0);
  const formattedChange =
    item.dailyChangePercent !== null
      ? `${item.dailyChangePercent >= 0 ? '+' : ''}${item.dailyChangePercent.toFixed(2)}%`
      : '—';

  const confidenceBadgeVariant =
    item.confidence === 'HIGH'
      ? 'success'
      : item.confidence === 'MEDIUM'
      ? 'neutral'
      : item.confidence === 'LOW'
      ? 'warning'
      : 'negative';

  const confidenceLabel =
    item.confidence === 'HIGH'
      ? 'Alta Convicção'
      : item.confidence === 'MEDIUM'
      ? 'Média Convicção'
      : item.confidence === 'LOW'
      ? 'Baixa Convicção'
      : 'Dados Insuficientes';

  const formattedUpdatedAt = item.updatedAt
    ? new Date(item.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Análise de Oportunidade: ${item.ticker}`}
      maxWidth="680px"
    >
      <div data-testid="opportunity-analysis-modal" style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
        {/* Top Header Card */}
        <div
          style={{
            backgroundColor: colors.surfaceElevated,
            padding: `${spacing.md}px`,
            borderRadius: `${borderRadius.md}px`,
            border: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px`, marginBottom: '4px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.textPrimary }}>
                {item.ticker}
              </span>
              <Badge variant={item.assetType === 'FII' ? 'primary' : 'neutral'}>
                {item.assetType === 'FII' ? 'FII' : 'AÇÃO'}
              </Badge>
              <Badge variant={confidenceBadgeVariant}>{confidenceLabel}</Badge>
            </div>
            <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>{item.name}</div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary, textTransform: 'uppercase' }}>
              Opportunity Score
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: scoreColor, lineHeight: 1.1 }}>
              {item.score}
              <span style={{ fontSize: '0.875rem', color: colors.textSecondary, fontWeight: 500 }}>
                /100
              </span>
            </div>
          </div>
        </div>

        {/* Snapshot Metrics Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: `${spacing.sm}px`,
          }}
        >
          <div
            style={{
              padding: `${spacing.sm}px`,
              backgroundColor: colors.surface,
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Cotação</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.textPrimary }}>{formattedPrice}</div>
          </div>

          <div
            style={{
              padding: `${spacing.sm}px`,
              backgroundColor: colors.surface,
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Variação Diária</div>
            <div
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: (item.dailyChangePercent || 0) >= 0 ? colors.positive : colors.negative,
              }}
            >
              {formattedChange}
            </div>
          </div>

          <div
            style={{
              padding: `${spacing.sm}px`,
              backgroundColor: colors.surface,
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Peso na Carteira</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.textPrimary }}>{formattedWeight}</div>
          </div>

          <div
            style={{
              padding: `${spacing.sm}px`,
              backgroundColor: colors.surface,
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Custódia Atual</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.textPrimary }}>
              {item.portfolioQuantity} un
            </div>
          </div>
        </div>

        {/* Section: Component Breakdown */}
        <div>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: colors.textSecondary,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            Componentes da Nota (0–100)
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
            {(() => {
              const hasCalendarFit =
                item.assetType === 'FII' &&
                item.components.dividendCalendarFit !== undefined &&
                item.components.dividendCalendarFit !== null;

              const componentsList = hasCalendarFit
                ? [
                    { label: 'Capacidade na Carteira (Portfolio Fit)', value: item.components.portfolioFit, weight: '15%' },
                    { label: 'Valuation (P/VP)', value: item.components.valuation, weight: '15%' },
                    { label: 'Rendimento & Yield', value: item.components.priceOpportunity, weight: '15%' },
                    { label: 'Tendência & Preço', value: item.components.momentum, weight: '15%' },
                    { label: 'Notícias & Fatos Relevantes', value: item.components.news, weight: '10%' },
                    { label: 'Perspectiva & Consenso', value: item.components.outlook, weight: '10%' },
                    { label: 'Calendário de Proventos', value: item.components.dividendCalendarFit ?? null, weight: '20%' },
                  ]
                : [
                    { label: 'Capacidade na Carteira (Portfolio Fit)', value: item.components.portfolioFit, weight: '20%' },
                    {
                      label: item.assetType === 'FII' ? 'Valuation (P/VP)' : 'Valuation & Fundamentos',
                      value: item.components.valuation,
                      weight: '20%',
                    },
                    {
                      label: item.assetType === 'FII' ? 'Rendimento & Yield' : 'Oportunidade de Preço',
                      value: item.components.priceOpportunity,
                      weight: item.assetType === 'FII' ? '20%' : '15%',
                    },
                    {
                      label: item.assetType === 'FII' ? 'Tendência & Preço' : 'Tendência & Momentum',
                      value: item.components.momentum,
                      weight: item.assetType === 'FII' ? '15%' : '20%',
                    },
                    { label: 'Notícias & Fatos Relevantes', value: item.components.news, weight: '15%' },
                    { label: 'Perspectiva & Consenso', value: item.components.outlook, weight: '10%' },
                  ];

              return componentsList.map((comp, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: `${borderRadius.sm}px`,
                  fontSize: '0.8125rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{comp.label}</span>
                  <span style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>({comp.weight})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '60px',
                      height: '6px',
                      backgroundColor: colors.surface,
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: comp.value !== null && comp.value !== undefined ? `${comp.value}%` : '0%',
                        height: '100%',
                        backgroundColor:
                          comp.value === null || comp.value === undefined
                            ? 'transparent'
                            : comp.value >= 70
                              ? colors.positive
                              : comp.value >= 50
                                ? colors.accent
                                : colors.warning,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontWeight: 600,
                      color: comp.value !== null && comp.value !== undefined ? colors.textPrimary : colors.textSecondary,
                      minWidth: '28px',
                      textAlign: 'right',
                      fontSize: comp.value !== null && comp.value !== undefined ? '0.8125rem' : '0.6875rem',
                    }}
                  >
                    {comp.value !== null && comp.value !== undefined ? comp.value : '—'}
                  </span>
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Section: Favorable Reasons */}
      <div>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: colors.positive,
              marginBottom: `${spacing.xs}px`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>✓</span> Razões Favoráveis para Estudo
          </h4>
          <ul style={{ margin: 0, paddingLeft: `${spacing.md}px`, color: colors.textPrimary, fontSize: '0.875rem' }}>
            {item.positives.map((pos, idx) => (
              <li key={idx} style={{ marginBottom: '4px', lineHeight: 1.4 }}>
                {pos}
              </li>
            ))}
          </ul>
        </div>

        {/* Section: Risks & Cautions */}
        <div>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: colors.warning,
              marginBottom: `${spacing.xs}px`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚠</span> Principais Fatores de Risco
          </h4>
          <ul style={{ margin: 0, paddingLeft: `${spacing.md}px`, color: colors.textPrimary, fontSize: '0.875rem' }}>
            {item.risks.map((risk, idx) => (
              <li key={idx} style={{ marginBottom: '4px', lineHeight: 1.4 }}>
                {risk}
              </li>
            ))}
          </ul>
        </div>

        {/* Section: FII Dividend Calendar & Reinvestment Strategy (APP-16I) */}
        {item.assetType === 'FII' && (
          <div data-testid="modal-fii-dividend-calendar-section">
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: colors.textSecondary,
                marginBottom: `${spacing.xs}px`,
              }}
            >
              Calendário de Proventos & Reinvestimento
            </h4>

            <div
              style={{
                padding: `${spacing.sm}px`,
                backgroundColor: colors.surfaceElevated,
                borderRadius: `${borderRadius.sm}px`,
                border: `1px solid ${colors.border}`,
                fontSize: '0.8125rem',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: `${spacing.sm}px`,
                  marginBottom: item.dividendCalendar?.sameMonthReinvestmentCandidate ? `${spacing.xs}px` : 0,
                }}
              >
                <div>
                  <div style={{ color: colors.textSecondary, fontSize: '0.75rem' }}>Data-base (Data-com)</div>
                  <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                    {item.dividendCalendar?.recordDate ? formatFullDate(item.dividendCalendar.recordDate) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ color: colors.textSecondary, fontSize: '0.75rem' }}>Data-ex</div>
                  <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                    {item.dividendCalendar?.exDate ? formatFullDate(item.dividendCalendar.exDate) : 'Não informada'}
                  </div>
                </div>
                <div>
                  <div style={{ color: colors.textSecondary, fontSize: '0.75rem' }}>Data de Pagamento</div>
                  <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                    {item.dividendCalendar?.paymentDate ? formatFullDate(item.dividendCalendar.paymentDate) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ color: colors.textSecondary, fontSize: '0.75rem' }}>Rendimento Anunciado</div>
                  <div style={{ fontWeight: 600, color: colors.positive }}>
                    {item.dividendCalendar?.amountPerShare !== null &&
                    item.dividendCalendar?.amountPerShare !== undefined
                      ? `R$ ${item.dividendCalendar.amountPerShare.toFixed(2)}/cota`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ color: colors.textSecondary, fontSize: '0.75rem' }}>Situação de Elegibilidade</div>
                  <div style={{ fontWeight: 600 }}>
                    {item.dividendCalendar?.eligibilityStatus === 'ELIGIBLE' && (
                      <span style={{ color: colors.positive }}>✅ Ainda elegível (Dentro do período com direito)</span>
                    )}
                    {item.dividendCalendar?.eligibilityStatus === 'RECORD_DATE_TODAY' && (
                      <span style={{ color: colors.warning }}>⚡ Data-com hoje (último dia com direito)</span>
                    )}
                    {item.dividendCalendar?.eligibilityStatus === 'EX_DIVIDEND' && (
                      <span style={{ color: colors.textSecondary }}>
                        {item.dividendCalendar.isPaymentPending
                          ? '⛔ Data-com já passou (pagamento pendente)'
                          : '⛔ Data-com já passou'}
                      </span>
                    )}
                    {(!item.dividendCalendar || item.dividendCalendar.eligibilityStatus === 'UNKNOWN') && (
                      <span style={{ color: colors.textSecondary }}>Aguardando anúncio oficial</span>
                    )}
                  </div>
                </div>
              </div>

              {item.dividendCalendar?.sameMonthReinvestmentCandidate && (
                <div
                  style={{
                    marginTop: `${spacing.xs}px`,
                    padding: '6px 10px',
                    borderRadius: `${borderRadius.sm}px`,
                    backgroundColor: item.dividendCalendar.cashAvailableNow ? `${colors.positive}12` : `${colors.accent}12`,
                    color: item.dividendCalendar.cashAvailableNow ? colors.positive : colors.accent,
                    fontWeight: 600,
                    fontSize: '0.75rem',
                  }}
                >
                  {item.dividendCalendar.cashAvailableNow ? (
                    <span>
                      {`♻ Caixa já disponível: provento recebido${item.dividendCalendar.reinvestmentSourceTicker ? ` de ${item.dividendCalendar.reinvestmentSourceTicker}` : ''} já se encontra disponível para novo aporte antes da data-com deste fundo.`}
                    </span>
                  ) : item.dividendCalendar.futureCashExpected ? (
                    <span>
                      {`🗓 Cadeia futura planejada: provento previsto${item.dividendCalendar.reinvestmentSourceTicker ? ` de ${item.dividendCalendar.reinvestmentSourceTicker}` : ''} poderá ser reinvestido antes da data-com deste fundo.`}
                    </span>
                  ) : (
                    <span>
                      ♻ Potencial de Rotação: Caixa recebido de outros proventos da carteira pode ser reutilizado para novo aporte antes da data-com deste fundo.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section: News considered (Strict Effective News) */}
        {item.components.news !== null && item.news && item.news.length > 0 ? (
          <div>
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: colors.textSecondary,
                marginBottom: `${spacing.xs}px`,
              }}
            >
              Notícias Consideradas ({item.news.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
              {item.news.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: `${borderRadius.sm}px`,
                    borderLeft: `3px solid ${
                      n.sentiment === 'POSITIVE'
                        ? colors.positive
                        : n.sentiment === 'NEGATIVE'
                        ? colors.negative
                        : colors.accent
                    }`,
                    fontSize: '0.8125rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: '2px' }}>
                    {n.headline}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.6875rem', color: colors.textSecondary }}>
                    <span>{n.source}</span>
                    <span>•</span>
                    <span>{formatNewsDate(n.publishedAt)}</span>
                    <span>•</span>
                    <span style={{ textTransform: 'uppercase' }}>{n.sentiment}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: colors.textSecondary,
                marginBottom: `${spacing.xs}px`,
              }}
            >
              Notícias & Fatos Relevantes
            </h4>
            <div
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                backgroundColor: colors.surfaceElevated,
                borderRadius: `${borderRadius.sm}px`,
                fontSize: '0.8125rem',
                color: colors.textSecondary,
              }}
            >
              Nenhuma notícia recente considerada nesta análise.
            </div>
          </div>
        )}

        {/* Data Provenance & Audit footer */}
        <div
          style={{
            padding: `${spacing.sm}px`,
            backgroundColor: `${colors.accent}08`,
            borderRadius: `${borderRadius.sm}px`,
            border: `1px solid ${colors.border}`,
            fontSize: '0.75rem',
            color: colors.textSecondary,
            lineHeight: 1.4,
          }}
        >
          {item.dataProvenance && (
            <div style={{ marginBottom: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span>
                <strong>Fontes:</strong> {item.dataProvenance.sources.join(' • ')}
              </span>
              <span>•</span>
              <span>
                <strong>Cobertura de Dados:</strong> {item.dataProvenance.coveragePercent}% ({item.dataProvenance.knownDimensionsCount}/{item.dataProvenance.totalDimensionsCount} dimensões)
              </span>
            </div>
          )}
          <div>
            <strong>Modelo:</strong> opportunity-v2.1 • <strong>Análise atualizada às:</strong> {formattedUpdatedAt}
          </div>
          <div style={{ marginTop: '4px', fontStyle: 'italic', color: colors.disabledText }}>
            Radar puramente informativo baseado nos dados disponíveis. Não executa ordens de compra ou venda e não garante desempenho futuro.
          </div>
        </div>

        {/* Action Button: Close only (NO BUY BUTTON) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: `${spacing.xs}px` }}>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
};

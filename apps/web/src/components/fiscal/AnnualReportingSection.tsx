'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  colors,
  spacing,
  borderRadius,
  annualTaxReportingQueryKey,
  mapReportingPackageToViewModel,
  type RawAnnualTaxReportingPackage,
  type AnnualTaxReportingSection,
  type ReportingSectionVM,
  type AnnualTaxReportingItemVM,
} from '@atlas/ui';
import { apiClient } from '@/api/client';
import { Card, SectionHeader, ErrorState, Skeleton } from '@/components/ui';

export function AnnualReportingSection() {
  const currentYear = new Date().getFullYear() - 1;
  const [calendarYear, setCalendarYear] = useState<number>(currentYear > 2000 ? currentYear : 2025);
  const [activeSection, setActiveSection] = useState<AnnualTaxReportingSection | 'ALL'>('ALL');
  const [selectedItem, setSelectedItem] = useState<AnnualTaxReportingItemVM | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: annualTaxReportingQueryKey(calendarYear),
    queryFn: async () => {
      const res = await apiClient.get<{
        data: RawAnnualTaxReportingPackage;
      }>(`/api/v1/fiscal/annual/${calendarYear}/reporting`);
      return res.data;
    },
    enabled: Boolean(calendarYear >= 1900 && calendarYear <= 2100),
    staleTime: 30_000,
  });

  const viewModel = useMemo(() => (data ? mapReportingPackageToViewModel(data) : null), [data]);

  const displayedSections = useMemo(() => {
    if (!viewModel) return [];
    if (activeSection === 'ALL') return viewModel.sections;
    return viewModel.sections.filter((s) => s.section === activeSection);
  }, [viewModel, activeSection]);

  return (
    <div style={{ marginTop: `${spacing.xl}px` }}>
      <SectionHeader
        title="Preparação e Suporte à Declaração Anual (DIRPF)"
        description="Mapeamento estruturado de bens, rendimentos e imposto pago para preenchimento ou conferência da declaração anual de IRPF."
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.md}px`,
          marginTop: `${spacing.md}px`,
          marginBottom: `${spacing.lg}px`,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          <label
            htmlFor="reporting-year-select"
            style={{ fontSize: '0.875rem', color: colors.textSecondary }}
          >
            Ano-Calendário:
          </label>
          <select
            id="reporting-year-select"
            value={calendarYear}
            onChange={(e) => {
              setCalendarYear(Number(e.target.value));
              setSelectedItem(null);
            }}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              fontSize: '0.875rem',
              color: colors.textPrimary,
              backgroundColor: colors.surface,
            }}
          >
            {[2024, 2025, 2026, 2027, 2028].map((yr) => (
              <option key={yr} value={yr}>
                {yr} (Exercício {yr + 1})
              </option>
            ))}
          </select>
        </div>

        {viewModel && (
          <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveSection('ALL')}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: `${borderRadius.sm}px`,
                border: `1px solid ${activeSection === 'ALL' ? colors.accent : colors.border}`,
                backgroundColor: activeSection === 'ALL' ? `${colors.accent}15` : colors.surface,
                color: activeSection === 'ALL' ? colors.accent : colors.textSecondary,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                fontWeight: activeSection === 'ALL' ? 600 : 400,
              }}
            >
              Todas as Fichas ({viewModel.totalItemCount})
            </button>
            {viewModel.sections.map((sec) => (
              <button
                key={sec.section}
                onClick={() => setActiveSection(sec.section)}
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  borderRadius: `${borderRadius.sm}px`,
                  border: `1px solid ${activeSection === sec.section ? colors.accent : colors.border}`,
                  backgroundColor:
                    activeSection === sec.section ? `${colors.accent}15` : colors.surface,
                  color: activeSection === sec.section ? colors.accent : colors.textSecondary,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  fontWeight: activeSection === sec.section ? 600 : 400,
                }}
              >
                {sec.title} ({sec.itemCount})
              </button>
            ))}

            <button
              data-testid="export-reporting-csv-btn"
              onClick={async () => {
                try {
                  const res = await apiClient.get<string>(
                    `/api/v1/fiscal/annual/${calendarYear}/reporting/export`,
                    { headers: { Accept: 'text/csv' } },
                  );
                  const csvData =
                    typeof res === 'string'
                      ? res
                      : typeof res === 'object' && res !== null && 'data' in res
                        ? String((res as { data: unknown }).data)
                        : '';
                  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `atlas-suporte-irpf-${calendarYear}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                } catch (e) {
                  console.error('Falha ao exportar CSV:', e);
                }
              }}
              style={{
                marginLeft: 'auto',
                padding: `${spacing.xs}px ${spacing.md}px`,
                borderRadius: `${borderRadius.sm}px`,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.surface,
                color: colors.accent,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: `${spacing.xs}px`,
              }}
            >
              📥 Exportar Guia (.CSV)
            </button>
          </div>
        )}
      </div>

      {/* Mandatory Disclaimer */}
      {viewModel && (
        <Card
          style={{
            padding: `${spacing.md}px`,
            marginBottom: `${spacing.lg}px`,
            backgroundColor: `${colors.accent}08`,
            border: `1px solid ${colors.accent}30`,
          }}
        >
          <div style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: colors.accent }}>
                DOCUMENTO INFORMATIVO DE SUPORTE FISCAL
              </div>
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: colors.textSecondary,
                  marginTop: `${spacing.xs}px`,
                  lineHeight: 1.5,
                }}
              >
                {viewModel.disclaimer}
              </div>
            </div>
          </div>
        </Card>
      )}

      {isLoading && (
        <Card style={{ padding: `${spacing.lg}px` }}>
          <Skeleton width="220px" height="1.5rem" />
          <div style={{ marginTop: `${spacing.md}px` }}>
            <Skeleton width="100%" height="80px" />
          </div>
        </Card>
      )}

      {isError && !isLoading && (
        <Card style={{ padding: `${spacing.lg}px` }}>
          <ErrorState
            title="Erro ao carregar pacote de preparação de IRPF"
            message={(error as Error)?.message || 'Falha ao consultar API fiscal'}
            onRetry={() => refetch()}
          />
        </Card>
      )}

      {!isLoading && !isError && viewModel && (
        <div>
          {/* Header Summary Card */}
          <Card style={{ padding: `${spacing.lg}px`, marginBottom: `${spacing.lg}px` }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: `${spacing.md}px`,
              }}
            >
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600, color: colors.textPrimary }}>
                  Declaração de Ajuste Anual — Exercício {viewModel.declarationExercise}
                </div>
                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: colors.textSecondary,
                    marginTop: `${spacing.xs}px`,
                  }}
                >
                  Ano-base: <strong>{viewModel.calendarYear}</strong> · Itens Mapeados:{' '}
                  <strong>{viewModel.totalItemCount}</strong> · Bloqueados:{' '}
                  <strong
                    style={{
                      color: viewModel.totalBlockedCount > 0 ? colors.negative : colors.positive,
                    }}
                  >
                    {viewModel.totalBlockedCount}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
                <span
                  style={{
                    padding: `${spacing.xs}px ${spacing.md}px`,
                    borderRadius: `${borderRadius.full}px`,
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    backgroundColor:
                      viewModel.overallStatusVariant === 'success'
                        ? `${colors.positive}20`
                        : viewModel.overallStatusVariant === 'warning'
                          ? `${colors.warning}20`
                          : `${colors.negative}20`,
                    color:
                      viewModel.overallStatusVariant === 'success'
                        ? colors.positive
                        : viewModel.overallStatusVariant === 'warning'
                          ? colors.warning
                          : colors.negative,
                  }}
                >
                  {viewModel.overallStatusLabel}
                </span>
              </div>
            </div>
          </Card>

          {/* Sections List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
            {displayedSections.map((sec) => (
              <ReportingSectionCard
                key={sec.section}
                section={sec}
                onSelectItem={(item) => setSelectedItem(item)}
              />
            ))}
          </div>

          {/* Detailed Item Modal */}
          {selectedItem && (
            <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
          )}
        </div>
      )}
    </div>
  );
}

function ReportingSectionCard({
  section,
  onSelectItem,
}: {
  section: ReportingSectionVM;
  onSelectItem: (item: AnnualTaxReportingItemVM) => void;
}) {
  return (
    <Card style={{ padding: `${spacing.lg}px` }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: `${spacing.md}px`,
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: colors.textPrimary }}>
            {section.title}
          </h3>
          <div
            style={{
              fontSize: '0.75rem',
              color: colors.textSecondary,
              marginTop: `${spacing.xs}px`,
            }}
          >
            {section.itemCount} registro(s) mapeado(s)
            {section.blockedCount > 0 && ` · ${section.blockedCount} bloqueado(s)`}
          </div>
        </div>

        <span
          style={{
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: `${borderRadius.sm}px`,
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor:
              section.statusVariant === 'success'
                ? `${colors.positive}20`
                : section.statusVariant === 'warning'
                  ? `${colors.warning}20`
                  : `${colors.negative}20`,
            color:
              section.statusVariant === 'success'
                ? colors.positive
                : section.statusVariant === 'warning'
                  ? colors.warning
                  : colors.negative,
          }}
        >
          {section.statusLabel}
        </span>
      </div>

      {section.blockingReasons.length > 0 && (
        <div
          style={{
            marginBottom: `${spacing.md}px`,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            backgroundColor: `${colors.negative}10`,
            borderRadius: `${borderRadius.sm}px`,
            fontSize: '0.75rem',
            color: colors.negative,
          }}
        >
          {section.blockingReasons.map((n, i) => (
            <div key={i}>• Pendência: {n}</div>
          ))}
        </div>
      )}

      {section.items.length === 0 ? (
        <div
          style={{
            padding: `${spacing.md}px`,
            textAlign: 'center',
            fontSize: '0.8125rem',
            color: colors.textMuted,
          }}
        >
          Nenhum item nesta ficha para o ano-calendário.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
          {section.items.map((item) => (
            <div
              key={item.reportingItemId}
              onClick={() => onSelectItem(item)}
              style={{
                padding: `${spacing.md}px`,
                borderRadius: `${borderRadius.md}px`,
                backgroundColor: item.isBlocked ? `${colors.negative}08` : colors.surfaceElevated,
                border: `1px solid ${item.isBlocked ? `${colors.negative}40` : colors.border}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease-in-out',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: `${spacing.sm}px`,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: colors.accent,
                        backgroundColor: `${colors.accent}15`,
                        padding: '2px 6px',
                        borderRadius: `${borderRadius.sm}px`,
                      }}
                    >
                      {item.officialMappingCode}
                    </span>
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: colors.textPrimary,
                      }}
                    >
                      {item.officialMappingLabel}
                    </span>
                    {item.mappingStatus === 'PROVISIONAL' && (
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          padding: '1px 4px',
                          borderRadius: `${borderRadius.sm}px`,
                          backgroundColor: `${colors.warning}20`,
                          color: colors.warning,
                          fontWeight: 600,
                        }}
                      >
                        PROVISÓRIO (2026+)
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      marginTop: `${spacing.xs}px`,
                      lineHeight: 1.4,
                    }}
                  >
                    {item.description}
                  </div>
                </div>

                {item.isBlocked && (
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      color: colors.negative,
                      backgroundColor: `${colors.negative}20`,
                      padding: '2px 6px',
                      borderRadius: `${borderRadius.sm}px`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    BLOQUEADO
                  </span>
                )}
              </div>

              {item.isBlocked && item.blockingReasons.length > 0 && (
                <div
                  style={{
                    marginTop: `${spacing.xs}px`,
                    fontSize: '0.75rem',
                    color: colors.negative,
                  }}
                >
                  Motivo: {item.blockingReasons.join('; ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ItemDetailModal({
  item,
  onClose,
}: {
  item: AnnualTaxReportingItemVM;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: `${spacing.md}px`,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: colors.surface,
          borderRadius: `${borderRadius.lg}px`,
          padding: `${spacing.xl}px`,
          maxWidth: '650px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: `1px solid ${colors.border}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: `${spacing.md}px`,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
              <span
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: colors.accent,
                  backgroundColor: `${colors.accent}15`,
                  padding: '2px 8px',
                  borderRadius: `${borderRadius.sm}px`,
                }}
              >
                Código: {item.officialMappingCode}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: item.mappingStatusVariant === 'success' ? colors.positive : colors.warning,
                }}
              >
                {item.mappingStatusLabel}
              </span>
            </div>
            <h3
              style={{
                margin: `${spacing.xs}px 0 0 0`,
                fontSize: '1.125rem',
                color: colors.textPrimary,
              }}
            >
              {item.officialMappingLabel}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              color: colors.textSecondary,
              cursor: 'pointer',
              padding: `${spacing.xs}px`,
            }}
          >
            ✕
          </button>
        </div>

        {item.isBlocked && (
          <div
            style={{
              padding: `${spacing.sm}px`,
              backgroundColor: `${colors.negative}15`,
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.negative}40`,
              marginBottom: `${spacing.md}px`,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: colors.negative }}>
              Item Bloqueado para Declaração
            </div>
            <ul
              style={{
                margin: `${spacing.xs}px 0 0 ${spacing.md}px`,
                fontSize: '0.75rem',
                color: colors.textPrimary,
              }}
            >
              {item.blockingReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginBottom: `${spacing.md}px` }}>
          <label
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
            }}
          >
            Discriminação Sugerida / Texto DIRPF
          </label>
          <div
            style={{
              marginTop: `${spacing.xs}px`,
              padding: `${spacing.sm}px`,
              backgroundColor: colors.surfaceElevated,
              borderRadius: `${borderRadius.sm}px`,
              fontSize: '0.875rem',
              color: colors.textPrimary,
              lineHeight: 1.5,
              border: `1px solid ${colors.border}`,
            }}
          >
            {item.description}
          </div>
        </div>

        <div style={{ marginBottom: `${spacing.md}px` }}>
          <label
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
            }}
          >
            Campos e Valores Apurados
          </label>
          <div
            style={{
              marginTop: `${spacing.xs}px`,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: `${spacing.xs}px`,
            }}
          >
            {item.costBasis && (
              <div
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: `${borderRadius.sm}px`,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
                  Custo Total
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                  R$ {item.costBasis}
                </div>
              </div>
            )}
            {item.grossAmount && (
              <div
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: `${borderRadius.sm}px`,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
                  Valor Bruto
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                  R$ {item.grossAmount}
                </div>
              </div>
            )}
            {item.withheldAmount && (
              <div
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: `${borderRadius.sm}px`,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
                  Imposto Retido
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                  R$ {item.withheldAmount}
                </div>
              </div>
            )}
            {item.netAmount && (
              <div
                style={{
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: `${borderRadius.sm}px`,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
                  Valor Líquido
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                  R$ {item.netAmount}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: `${spacing.lg}px` }}>
          <label
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
            }}
          >
            Rastreabilidade e Origem
          </label>
          <div
            style={{
              marginTop: `${spacing.xs}px`,
              fontSize: '0.75rem',
              color: colors.textSecondary,
              lineHeight: 1.6,
            }}
          >
            <div>Item ID: {item.reportingItemId}</div>
            <div>Fontes: {item.sourceReferences.join(', ') || 'N/A'}</div>
            <div>Fingerprint: {item.sourceFingerprint}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: `${spacing.xs}px ${spacing.lg}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.accent,
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

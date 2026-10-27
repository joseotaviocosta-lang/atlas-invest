'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, SectionHeader } from '@/components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';

interface MaintenanceItemView {
  assetId: string | null;
  ticker: string | null;
  issueCode: string;
  domain: string;
  severity: string;
  maintenanceStatus: 'ACTIONABLE' | 'NAVIGABLE' | 'UNSUPPORTED' | 'STRUCTURAL';
  actionType: string;
  route: string | null;
  explanation: string;
  safetyNote: string | null;
  affectedCapabilities: string[];
  count: number | null;
}

interface MaintenanceData {
  portfolioId: string;
  generatedAt: string;
  summary: {
    actionable: number;
    navigable: number;
    unsupported: number;
    structural: number;
    total: number;
  };
  actionableItems: MaintenanceItemView[];
  navigableItems: MaintenanceItemView[];
  unsupportedItems: MaintenanceItemView[];
  structuralItems: MaintenanceItemView[];
}

function actionLabel(actionType: string): string | null {
  switch (actionType) {
    case 'REFRESH_MARKET_DATA':
      return 'Atualizar dados de mercado';
    case 'REFRESH_FX_DATA':
      return 'Atualizar câmbio (provedor)';
    case 'REVIEW_RECONCILIATION':
      return 'Revisar reconciliação';
    case 'VIEW_OPERATIONS':
      return 'Ver operações';
    case 'VIEW_POSITION':
      return 'Ver posição';
    case 'VIEW_MARKET_DATA':
      return 'Ver dados de mercado';
    case 'VIEW_REVIEWS':
      return 'Ver revisões';
    default:
      return null;
  }
}

/** Only UI-navigable routes become links. API templates (`/api/…`)
 * and placeholder routes render as descriptive text — never a dead CTA. */
function resolveHref(item: MaintenanceItemView, portfolioId: string): string | null {
  if (!item.route || item.route.startsWith('/api/')) return null;
  return item.route
    .replaceAll(':portfolioId', portfolioId)
    .replaceAll(':assetId', item.assetId ?? '')
    .replaceAll(':baseCurrency', '')
    .replaceAll(':quoteCurrency', '');
}

function ItemCard({ item, portfolioId }: { item: MaintenanceItemView; portfolioId: string }) {
  const href = resolveHref(item, portfolioId);
  const label = actionLabel(item.actionType);
  return (
    <div
      data-testid={`maintenance-item-${item.issueCode}-${item.assetId ?? 'portfolio'}`}
      style={{
        padding: `${spacing.base}px`,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: `${borderRadius.lg}px`,
        marginBottom: `${spacing.sm}px`,
      }}
    >
      <p style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>
        {item.ticker ?? 'Carteira'} · {item.issueCode}
      </p>
      <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '4px 0' }}>
        {item.explanation}
      </p>
      {item.safetyNote && (
        <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '4px 0' }}>
          {item.safetyNote}
        </p>
      )}
      {item.affectedCapabilities.length > 0 && (
        <p style={{ fontSize: '0.75rem', color: colors.textMuted, margin: '4px 0' }}>
          Afeta: {item.affectedCapabilities.join(', ')}.
        </p>
      )}
      {href && label ? (
        <Link
          href={href}
          aria-label={`${label} para ${item.ticker ?? 'carteira'}`}
          style={{ fontSize: '0.8125rem', fontWeight: 600 }}
        >
          {label}
        </Link>
      ) : (
        label && (
          <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
            Ação: {label} (via fluxo existente do provedor).
          </span>
        )
      )}
    </div>
  );
}

function MaintenanceContent() {
  const searchParams = useSearchParams();
  const authReady = useAuthReady();
  const portfolioId = searchParams.get('portfolioId') ?? '';

  const maintenanceQuery = useQuery({
    queryKey: ['portfolio-maintenance', portfolioId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: MaintenanceData }>(
        `/api/v1/portfolios/${portfolioId}/maintenance`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId),
    staleTime: 30_000,
    retry: false,
  });

  if (!portfolioId) {
    return <EmptyState title="Manutenção de dados" description="Selecione uma carteira." />;
  }

  const data = maintenanceQuery.data ?? null;

  return (
    <div data-testid="portfolio-maintenance">
      <SectionHeader
        title="Manutenção de dados"
        description="O que pode ser feito sobre cada pendência diagnosticada — somente fluxos que já existem no Atlas. Nada aqui corrige automaticamente."
      />
      {maintenanceQuery.isLoading ? (
        <Skeleton width="100%" height="160px" />
      ) : maintenanceQuery.isError || !data ? (
        <ErrorState
          title="Manutenção indisponível"
          message="Não foi possível carregar a manutenção de dados. Tente novamente."
        />
      ) : data.summary.total === 0 ? (
        <p data-testid="maintenance-empty" style={{ fontSize: '0.875rem' }}>
          Nenhuma pendência de dados. Quando um diagnóstico indicar algo corrigível, ele aparecerá
          aqui.
        </p>
      ) : (
        <>
          <p data-testid="maintenance-summary" style={{ fontSize: '0.875rem' }}>
            {data.summary.actionable > 0 &&
              `${data.summary.actionable} podem ser corrigidas no Atlas. `}
            {data.summary.navigable > 0 && `${data.summary.navigable} requerem revisão. `}
            {data.summary.unsupported > 0 &&
              `${data.summary.unsupported} sem manutenção disponível. `}
            {data.summary.structural > 0 && `${data.summary.structural} limitações estruturais.`}
          </p>

          {data.actionableItems.length > 0 && (
            <section aria-label="Pode corrigir no Atlas">
              <h3 style={{ fontSize: '0.9375rem' }}>Pode corrigir no Atlas</h3>
              {data.actionableItems.map((item) => (
                <ItemCard
                  key={`${item.issueCode}-${item.assetId ?? 'p'}`}
                  item={item}
                  portfolioId={portfolioId}
                />
              ))}
            </section>
          )}

          {data.navigableItems.length > 0 && (
            <section aria-label="Requer revisão">
              <h3 style={{ fontSize: '0.9375rem' }}>Requer revisão</h3>
              {data.navigableItems.map((item) => (
                <ItemCard
                  key={`${item.issueCode}-${item.assetId ?? 'p'}`}
                  item={item}
                  portfolioId={portfolioId}
                />
              ))}
            </section>
          )}

          {data.unsupportedItems.length > 0 && (
            <section aria-label="Sem manutenção disponível">
              <h3 style={{ fontSize: '0.9375rem' }}>Sem manutenção disponível</h3>
              {data.unsupportedItems.map((item) => (
                <ItemCard
                  key={`${item.issueCode}-${item.assetId ?? 'p'}`}
                  item={item}
                  portfolioId={portfolioId}
                />
              ))}
            </section>
          )}

          {data.structuralItems.length > 0 && (
            <section aria-label="Limitações estruturais">
              <h3 style={{ fontSize: '0.9375rem' }}>Limitações estruturais</h3>
              {data.structuralItems.map((item) => (
                <ItemCard
                  key={`${item.issueCode}-${item.assetId ?? 'p'}`}
                  item={item}
                  portfolioId={portfolioId}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function PortfolioMaintenancePage() {
  return (
    <Suspense fallback={<Skeleton width="100%" height="160px" />}>
      <MaintenanceContent />
    </Suspense>
  );
}

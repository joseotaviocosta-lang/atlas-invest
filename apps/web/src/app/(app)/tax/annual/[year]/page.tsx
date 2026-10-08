'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { colors, spacing } from '@atlas/ui';
import { Card, Skeleton, PageHeader } from '@/components/ui';
import { UnifiedAnnualSection } from '@/components/fiscal/UnifiedAnnualSection';
import { parseStrictCalendarYear } from '@/components/fiscal/unified-annual-wire';

function UnifiedAnnualFallback() {
  return (
    <Card style={{ padding: `${spacing.lg}px` }}>
      <Skeleton style={{ height: '40px', width: '100%', marginBottom: `${spacing.sm}px` }} />
      <Skeleton style={{ height: '160px', width: '100%' }} />
    </Card>
  );
}

export default function UnifiedAnnualPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = use(params);
  const calendarYear = parseStrictCalendarYear(year);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        title="IRPF anual — visão unificada"
        subtitle="Orquestração anual do IRPF: quais módulos se aplicam, estão prontos ou bloqueados, pendências e consistência entre os regimes. Nenhum cálculo é feito aqui — apenas a projeção dos resultados autoritativos de 4H/4I."
        breadcrumb="Fiscal / IRPF anual"
      />
      <div style={{ marginBottom: `${spacing.md}px` }}>
        <Link
          href="/tax"
          style={{ color: colors.accent, fontSize: '0.875rem' }}
          data-testid="unified-annual-back-to-tax"
        >
          ← Voltar para Fiscal
        </Link>
      </div>
      {calendarYear === null ? (
        <Card style={{ padding: `${spacing.lg}px` }} data-testid="unified-annual-invalid-year">
          <div role="alert" style={{ color: colors.negative, fontWeight: 700 }}>
            Ano-calendário inválido
          </div>
          <div style={{ marginTop: `${spacing.sm}px`, color: colors.textSecondary }}>
            Informe um ano-calendário válido na URL (ex.: /tax/annual/2026).
          </div>
        </Card>
      ) : (
        <Suspense fallback={<UnifiedAnnualFallback />}>
          <UnifiedAnnualSection calendarYear={calendarYear} />
        </Suspense>
      )}
    </div>
  );
}

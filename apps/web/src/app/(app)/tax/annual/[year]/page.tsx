'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { colors, spacing } from '@atlas/ui';
import { Card, Skeleton, PageHeader } from '@/components/ui';
import { UnifiedAnnualSection } from '@/components/fiscal/UnifiedAnnualSection';

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
  const parsed = Number.parseInt(year, 10);
  const calendarYear = Number.isInteger(parsed) ? parsed : new Date().getFullYear() - 1;

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
      <Suspense fallback={<UnifiedAnnualFallback />}>
        <UnifiedAnnualSection calendarYear={calendarYear} />
      </Suspense>
    </div>
  );
}

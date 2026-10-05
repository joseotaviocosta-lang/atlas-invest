'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { colors, spacing } from '@atlas/ui';
import { Card, Skeleton, PageHeader } from '@/components/ui';
import { AnnualHighIncomeSection } from '@/components/fiscal/AnnualHighIncomeSection';

function HighIncomeFallback() {
  return (
    <Card style={{ padding: `${spacing.lg}px` }}>
      <Skeleton style={{ height: '40px', width: '100%', marginBottom: `${spacing.sm}px` }} />
      <Skeleton style={{ height: '120px', width: '100%' }} />
    </Card>
  );
}

export default function HighIncomeReviewPage() {
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        title="Alta renda — revisão anual"
        subtitle="Tributação mínima de alta renda (Lei nº 15.270/2025): situação, base, evidências e pendências por ano-calendário."
        breadcrumb="Fiscal / Alta renda"
      />
      <div style={{ marginBottom: `${spacing.md}px` }}>
        <Link
          href="/tax"
          style={{ color: colors.accent, fontSize: '0.875rem' }}
          data-testid="high-income-back-to-tax"
        >
          ← Voltar para Fiscal
        </Link>
      </div>
      <Suspense fallback={<HighIncomeFallback />}>
        <AnnualHighIncomeSection />
      </Suspense>
    </div>
  );
}

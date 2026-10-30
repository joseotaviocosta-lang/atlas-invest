'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Card, Button, Skeleton, ErrorState, SectionHeader, Select } from '@/components/ui';
import { colors, spacing, formatCurrency, formatQuantity } from '@atlas/ui';
import { CostEvidenceModal } from './CostEvidenceModal';
import {
  COST_EVIDENCE_TYPE_LABELS,
  COST_EVIDENCE_STATUS_LABELS,
  COST_EVIDENCE_ASSESSMENT_LABELS,
  COST_EVIDENCE_TAX_MESSAGE,
} from '@/lib/cost-evidence-entry';

interface CostAssessment {
  status: string;
  positionQuantity: string;
  ledgerKnownQuantity: string;
  evidenceCoveredQuantity: string;
  totalCoveredQuantity: string;
  uncoveredQuantity: string;
  coveragePercent: string;
  verifiedKnownCost: Array<{ amount: string; currency: string }>;
  averageKnownCostForCoveredQuantity: { amount: string; currency: string } | null;
  appliedEvidenceIds: string[];
  issues: Array<{ code: string; message: string }>;
}

interface EvidenceRow {
  id: string;
  accountId: string;
  assetId: string;
  evidenceType: string;
  source: string;
  quantityCovered: string;
  unitCost: string | null;
  totalCost: string | null;
  currency: string;
  acquisitionDate: string;
  evidenceDate: string | null;
  status: string;
  sourceReference: string;
  notes: string | null;
  version: number;
  confirmedBy: string | null;
  rejectedReason: string | null;
  createdAt: string;
}

export interface CostEvidenceAccount {
  id: string;
  name: string;
}

/**
 * Historical cost-evidence section for one asset (current mode only).
 * Read-side coverage over ledger lots + VERIFIED evidence, plus the
 * owner review flow (submit → verify / reject). Never computes financial
 * results: every number rendered arrives as an exact server string.
 */
export function CostEvidenceSection({
  portfolioId,
  assetId,
  assetTicker,
  accounts,
  positionQuantity,
}: {
  portfolioId: string;
  assetId: string;
  assetTicker: string;
  accounts: CostEvidenceAccount[];
  positionQuantity: string | null;
}) {
  const authReady = useAuthReady();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const activeAccountId = accountId || accounts[0]?.id || '';

  const assessmentQuery = useQuery({
    queryKey: ['cost-evidence', portfolioId, 'assessment', activeAccountId, assetId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CostAssessment }>(
        `/api/v1/portfolios/${portfolioId}/cost-evidence/assessment?accountId=${activeAccountId}&assetId=${assetId}`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId) && Boolean(activeAccountId) && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });

  const evidenceQuery = useQuery({
    queryKey: ['cost-evidence', portfolioId, 'list', activeAccountId, assetId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: EvidenceRow[] }>(
        `/api/v1/portfolios/${portfolioId}/cost-evidence?accountId=${activeAccountId}&assetId=${assetId}`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId) && Boolean(activeAccountId) && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['cost-evidence', portfolioId] });
  };

  const transition = useMutation({
    mutationFn: async ({ evidenceId, action, body }: { evidenceId: string; action: string; body?: unknown }) => {
      const res = await apiClient.post<{ data: EvidenceRow }>(
        `/api/v1/portfolios/${portfolioId}/cost-evidence/${evidenceId}/${action}`,
        body,
      );
      return res.data;
    },
    onSuccess: () => {
      setActionError(null);
      setRejectingId(null);
      setRejectReason('');
      invalidateAll();
    },
    onError: (err: ApiError) => {
      setActionError(err.message || 'Falha na transição. Tente novamente.');
    },
  });

  const assessment = assessmentQuery.data ?? null;
  const rows = useMemo(() => evidenceQuery.data ?? [], [evidenceQuery.data]);

  if (accounts.length === 0) return null;

  return (
    <Card style={{ padding: `${spacing.base}px`, marginTop: `${spacing.base}px` }}>
      <SectionHeader
        title="Evidência de custo histórico"
        description="Comprove o custo de aquisição de unidades já representadas no livro — sem criar novas operações."
      />

      {accounts.length > 1 && (
        <Select
          label="Conta de custódia"
          options={accounts.map((account) => ({ value: account.id, label: account.name }))}
          value={activeAccountId}
          onChange={(e) => setAccountId(e.target.value)}
        />
      )}

      {assessmentQuery.isPending ? (
        <Skeleton />
      ) : assessmentQuery.isError ? (
        <ErrorState
          title="Cobertura indisponível"
          message="Não foi possível carregar a cobertura de custo."
          onRetry={() => assessmentQuery.refetch()}
        />
      ) : assessment ? (
        <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div>
            <strong>{COST_EVIDENCE_ASSESSMENT_LABELS[assessment.status] ?? assessment.status}</strong>
            {' — '}
            {formatQuantity(assessment.totalCoveredQuantity)} de{' '}
            {formatQuantity(assessment.positionQuantity)} unidades ({assessment.coveragePercent}%)
          </div>
          <div style={{ color: colors.textSecondary }}>
            Quantidade da posição: {formatQuantity(assessment.positionQuantity)} • Com custo em
            livro: {formatQuantity(assessment.ledgerKnownQuantity)} • Com custo comprovado:{' '}
            {formatQuantity(assessment.evidenceCoveredQuantity)} • Sem custo comprovado:{' '}
            {formatQuantity(assessment.uncoveredQuantity)}
          </div>
          {assessment.verifiedKnownCost.map((cost) => (
            <div key={cost.currency} style={{ color: colors.textSecondary }}>
              Custo comprovado ({cost.currency}): {formatCurrency(cost.amount, cost.currency)}
            </div>
          ))}
          {assessment.issues.map((issue) => (
            <div key={issue.code} role="alert" style={{ color: colors.negative }}>
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          backgroundColor: colors.warningSubtle,
          border: `1px solid ${colors.border}`,
          borderRadius: '6px',
          padding: `${spacing.md}px`,
          fontSize: '0.8125rem',
          color: colors.textSecondary,
          marginTop: `${spacing.md}px`,
        }}
      >
        {COST_EVIDENCE_TAX_MESSAGE}
      </div>

      {actionError && (
        <div role="alert" style={{ color: colors.negative, fontSize: '0.875rem', marginTop: `${spacing.sm}px` }}>
          {actionError}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: `${spacing.base}px`, display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                padding: `${spacing.md}px`,
                fontSize: '0.8125rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: `${spacing.md}px`, flexWrap: 'wrap' }}>
                <div>
                  <strong>{COST_EVIDENCE_TYPE_LABELS[row.evidenceType] ?? row.evidenceType}</strong>
                  {' • '}
                  {formatQuantity(row.quantityCovered)} un. • {row.acquisitionDate} •{' '}
                  {row.sourceReference}
                </div>
                <div style={{ color: colors.textSecondary }}>
                  {COST_EVIDENCE_STATUS_LABELS[row.status] ?? row.status} (v{row.version})
                </div>
              </div>
              <div style={{ color: colors.textSecondary }}>
                {row.unitCost ? `Preço unitário: ${formatCurrency(row.unitCost, row.currency)}` : ''}
                {row.unitCost && row.totalCost ? ' • ' : ''}
                {row.totalCost ? `Total: ${formatCurrency(row.totalCost, row.currency)}` : ''}
                {row.rejectedReason ? ` • Motivo: ${row.rejectedReason}` : ''}
              </div>
              <div style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.sm}px`, flexWrap: 'wrap' }}>
                {row.status === 'DRAFT' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ evidenceId: row.id, action: 'submit' })}
                  >
                    Enviar para confirmação
                  </Button>
                )}
                {row.status === 'REVIEW_REQUIRED' && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ evidenceId: row.id, action: 'verify' })}
                    >
                      Confirmar evidência
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={transition.isPending}
                      onClick={() => setRejectingId(row.id)}
                    >
                      Rejeitar
                    </Button>
                  </>
                )}
              </div>
              {rejectingId === row.id && (
                <div style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.sm}px` }}>
                  <input
                    aria-label="Motivo da rejeição"
                    placeholder="Motivo da rejeição"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: `1px solid ${colors.border}` }}
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={transition.isPending || rejectReason.trim() === ''}
                    onClick={() =>
                      transition.mutate({
                        evidenceId: row.id,
                        action: 'reject',
                        body: { reason: rejectReason.trim() },
                      })
                    }
                  >
                    Confirmar rejeição
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: `${spacing.base}px` }}>
        <Button variant="outline" onClick={() => setModalOpen(true)} disabled={!activeAccountId}>
          Melhorar custo histórico
        </Button>
      </div>

      {modalOpen && (
        <CostEvidenceModal
          portfolioId={portfolioId}
          accountId={activeAccountId}
          assetId={assetId}
          assetTicker={assetTicker}
          positionQuantity={positionQuantity}
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            invalidateAll();
          }}
        />
      )}
    </Card>
  );
}

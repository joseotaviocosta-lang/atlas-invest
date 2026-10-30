'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { Modal, Input, Select, Button } from '@/components/ui';
import { colors, spacing, borderRadius, formatCurrency, formatQuantity } from '@atlas/ui';
import {
  COST_EVIDENCE_TYPE_OPTIONS,
  COST_EVIDENCE_TYPE_LABELS,
  validateCostEvidenceDraft,
  buildCostEvidencePayload,
  type CostEvidenceDraft,
} from '@/lib/cost-evidence-entry';

interface CostEvidencePreview {
  status: string;
  positionQuantity: string;
  ledgerKnownQuantity: string;
  evidenceCoveredQuantity: string;
  totalCoveredQuantity: string;
  uncoveredQuantity: string;
  coveragePercent: string;
  verifiedKnownCost: Array<{ amount: string; currency: string }>;
  alreadyCoveredWarning: string | null;
  hypotheticalCoveredQuantity: string;
}

interface CostEvidenceModalProps {
  portfolioId: string;
  accountId: string;
  assetId: string;
  assetTicker: string;
  positionQuantity: string | null;
  open: boolean;
  onClose: () => void;
}

const EMPTY_DRAFT: CostEvidenceDraft = {
  evidenceType: 'BROKERAGE_NOTE',
  acquisitionDate: '',
  evidenceDate: '',
  quantityCovered: '',
  unitCost: '',
  totalCost: '',
  currency: 'BRL',
  sourceReference: '',
  notes: '',
};

/**
 * Owner-controlled cost-evidence entry: form → server preview → save.
 * The record is saved as DRAFT; confirmation (submit → verify) happens
 * from the evidence list. All coverage numbers shown come from the server.
 */
export function CostEvidenceModal({
  portfolioId,
  accountId,
  assetId,
  assetTicker,
  positionQuantity,
  open,
  onClose,
}: CostEvidenceModalProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CostEvidenceDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CostEvidencePreview | null>(null);

  const set = (field: keyof CostEvidenceDraft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setDraft((previous) => ({ ...previous, [field]: e.target.value }));
    setPreview(null);
  };

  const invalidateEvidence = () => {
    queryClient.invalidateQueries({ queryKey: ['cost-evidence', portfolioId] });
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const error = validateCostEvidenceDraft(draft);
      if (error) {
        setDraftError(error);
        throw new Error(error);
      }
      setDraftError(null);
      const res = await apiClient.post<{ data: CostEvidencePreview }>(
        `/api/v1/portfolios/${portfolioId}/cost-evidence/preview`,
        { accountId, assetId, ...buildCostEvidencePayload(draft) },
      );
      return res.data;
    },
    onSuccess: (data) => {
      setPreview(data);
      setFlowError(null);
    },
    onError: (err: ApiError | Error) => {
      if (err instanceof ApiError) {
        setFlowError(err.message || 'Falha ao projetar cobertura. Verifique os dados.');
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/portfolios/${portfolioId}/cost-evidence`,
        { accountId, assetId, status: 'DRAFT', ...buildCostEvidencePayload(draft) },
      );
      return res.data;
    },
    onSuccess: () => {
      invalidateEvidence();
      setDraft(EMPTY_DRAFT);
      setPreview(null);
      setFlowError(null);
      onClose();
    },
    onError: (err: ApiError) => {
      setFlowError(err.message || 'Falha ao salvar evidência.');
    },
  });

  return (
    <Modal isOpen={open} onClose={onClose} title={`Adicionar evidência de custo — ${assetTicker}`}>
      {flowError && (
        <div
          role="alert"
          style={{
            backgroundColor: colors.negativeSubtle,
            border: `1px solid ${colors.negative}`,
            color: colors.negative,
            padding: `${spacing.md}px`,
            borderRadius: `${borderRadius.md}px`,
            fontSize: '0.875rem',
            marginBottom: `${spacing.base}px`,
          }}
        >
          {flowError}
        </div>
      )}

      <Select
        label="Tipo de documento"
        options={COST_EVIDENCE_TYPE_OPTIONS}
        value={draft.evidenceType}
        onChange={set('evidenceType')}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.md}px` }}>
        <Input
          label="Data de aquisição (AAAA-MM-DD)"
          placeholder="2024-12-26"
          value={draft.acquisitionDate}
          onChange={set('acquisitionDate')}
        />
        <Input
          label="Data do documento (opcional)"
          placeholder="2025-03-31"
          value={draft.evidenceDate}
          onChange={set('evidenceDate')}
        />
      </div>

      <Input
        label="Quantidade comprovada"
        placeholder="120"
        inputMode="decimal"
        value={draft.quantityCovered}
        onChange={set('quantityCovered')}
        error={draftError && draftError.includes('quantidade') ? draftError : undefined}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.md}px` }}>
        <Input
          label="Preço unitário"
          placeholder="8.50"
          inputMode="decimal"
          value={draft.unitCost}
          onChange={set('unitCost')}
        />
        <Input
          label="Valor total"
          placeholder="1020.00"
          inputMode="decimal"
          value={draft.totalCost}
          onChange={set('totalCost')}
        />
      </div>

      <Input
        label="Origem/referência do documento"
        placeholder="XP-NOTA-2024-1234"
        value={draft.sourceReference}
        onChange={set('sourceReference')}
      />

      <Input
        label="Observação (opcional)"
        placeholder="Nota de corretagem, pregão 26/12/2024"
        value={draft.notes}
        onChange={set('notes')}
      />

      {draftError && !draftError.includes('quantidade') && (
        <div role="alert" style={{ color: colors.negative, fontSize: '0.875rem' }}>
          {draftError}
        </div>
      )}

      {preview && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.md}px`,
            padding: `${spacing.md}px`,
            marginTop: `${spacing.base}px`,
            fontSize: '0.875rem',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: `${spacing.sm}px` }}>
            Pré-visualização da cobertura
          </div>
          <div>Posição atual: {formatQuantity(preview.positionQuantity)}</div>
          <div>
            Esta evidência cobre: {formatQuantity(preview.hypotheticalCoveredQuantity)} de{' '}
            {formatQuantity(preview.positionQuantity)} unidades
          </div>
          <div>Cobertura projetada: {preview.coveragePercent}%</div>
          {preview.verifiedKnownCost.map((cost) => (
            <div key={cost.currency}>
              Custo comprovado ({cost.currency}): {formatCurrency(cost.amount, cost.currency)}
            </div>
          ))}
          {preview.uncoveredQuantity !== '0' && (
            <div style={{ color: colors.textSecondary }}>
              O custo da posição continuará incompleto ({formatQuantity(preview.uncoveredQuantity)}{' '}
              sem custo comprovado).
            </div>
          )}
          {preview.alreadyCoveredWarning && (
            <div role="alert" style={{ color: colors.negative }}>
              {preview.alreadyCoveredWarning}
            </div>
          )}
          <div style={{ color: colors.textSecondary }}>
            Tipo de evidência: {COST_EVIDENCE_TYPE_LABELS[draft.evidenceType] ?? draft.evidenceType}
            {positionQuantity ? ` • Quantidade em livro: ${formatQuantity(positionQuantity)} (inalterada)` : ''}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: `${spacing.md}px`, marginTop: `${spacing.base}px` }}>
        <Button
          variant="secondary"
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending || createMutation.isPending}
        >
          {previewMutation.isPending ? 'Projetando…' : 'Pré-visualizar'}
        </Button>
        <Button
          variant="primary"
          onClick={() => createMutation.mutate()}
          disabled={!preview || previewMutation.isPending || createMutation.isPending}
        >
          {createMutation.isPending ? 'Salvando…' : 'Salvar como rascunho'}
        </Button>
      </div>
    </Modal>
  );
}

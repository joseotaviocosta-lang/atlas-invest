import React, { useState, useEffect } from 'react';
import { Modal, Input, Select, Button } from '../../../components/ui';
import { colors, spacing, borderRadius, formatCurrency, formatQuantity } from '@atlas/ui';
import {
  COST_EVIDENCE_TYPE_OPTIONS,
  validateCostEvidenceDraft,
  buildCostEvidencePayload,
  INITIAL_COST_EVIDENCE_DRAFT,
  type CostEvidenceDraft,
} from '../cost-evidence-entry';
import { useCreateCostEvidence, usePreviewCostEvidence } from '../hooks';
import type { CostEvidencePreviewDto } from '../types';

export interface CostEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  accountId: string;
  assetId: string;
  assetTicker: string;
  positionQuantity?: string | null;
  initialDraft?: Partial<CostEvidenceDraft>;
  onSuccess?: () => void;
}

export const CostEvidenceModal: React.FC<CostEvidenceModalProps> = ({
  isOpen,
  onClose,
  portfolioId,
  accountId,
  assetId,
  assetTicker,
  positionQuantity,
  initialDraft,
  onSuccess,
}) => {
  const [draft, setDraft] = useState<CostEvidenceDraft>(() => ({
    ...INITIAL_COST_EVIDENCE_DRAFT,
    ...initialDraft,
  }));
  const [draftError, setDraftError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CostEvidencePreviewDto | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft({
        ...INITIAL_COST_EVIDENCE_DRAFT,
        ...initialDraft,
      });
      setDraftError(null);
      setFlowError(null);
      setPreview(null);
    }
  }, [isOpen, initialDraft]);

  const previewMutation = usePreviewCostEvidence(portfolioId);
  const createMutation = useCreateCostEvidence(portfolioId);

  const handleFieldChange = (field: keyof CostEvidenceDraft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setDraft((prev) => ({ ...prev, [field]: e.target.value }));
    setDraftError(null);
    setFlowError(null);
    setPreview(null);
  };

  const handlePreview = async () => {
    const error = validateCostEvidenceDraft(draft);
    if (error) {
      setDraftError(error);
      return;
    }
    setDraftError(null);
    setFlowError(null);

    try {
      const payload = buildCostEvidencePayload(draft, accountId, assetId, 'REVIEW_REQUIRED');
      const res = await previewMutation.mutateAsync(payload as any);
      setPreview(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao projetar cobertura documental.';
      setFlowError(msg);
    }
  };

  const handleSave = async (status: 'DRAFT' | 'REVIEW_REQUIRED') => {
    const error = validateCostEvidenceDraft(draft);
    if (error) {
      setDraftError(error);
      return;
    }
    setDraftError(null);
    setFlowError(null);

    try {
      const payload = buildCostEvidencePayload(draft, accountId, assetId, status);
      await createMutation.mutateAsync(payload as any);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao registrar comprovação de custo.';
      setFlowError(msg);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Regularização de Custo Histórico — ${assetTicker}`}
      maxWidth="640px"
    >
      <div
        data-testid="cost-evidence-modal"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${spacing.md}px`,
        }}
      >
        {/* Context Information Box */}
        <div
          style={{
            backgroundColor: `${colors.accent}12`,
            border: `1px solid ${colors.accent}33`,
            borderRadius: `${borderRadius.md}px`,
            padding: `${spacing.md}px`,
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            color: colors.textSecondary,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontWeight: 700, color: colors.textPrimary, fontSize: '0.875rem' }}>
              Ativo: {assetTicker}
            </span>
            {positionQuantity && (
              <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                Custódia Atual: {formatQuantity(positionQuantity)}
              </span>
            )}
          </div>
          <div>
            Informe os dados factuais da compra original (anterior a 28/11/2019). O custo histórico comprovado será auditado no livro de evidências sem presumir custos ou cotações de mercado.
          </div>
        </div>

        {/* Form Error Alert */}
        {(flowError || draftError) && (
          <div
            role="alert"
            data-testid="cost-evidence-error-alert"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${colors.negative}`,
              borderRadius: `${borderRadius.md}px`,
              padding: `${spacing.sm}px ${spacing.md}px`,
              color: colors.negative,
              fontSize: '0.8125rem',
            }}
          >
            {flowError || draftError}
          </div>
        )}

        {/* Input Fields */}
        <Select
          label="Tipo de Documento Comprobatório"
          id="evidence-type-select"
          options={COST_EVIDENCE_TYPE_OPTIONS}
          value={draft.evidenceType}
          onChange={handleFieldChange('evidenceType')}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.md}px` }}>
          <Input
            label="Data de Aquisição (AAAA-MM-DD) *"
            id="evidence-acquisition-date"
            placeholder="Ex: 2018-05-14"
            value={draft.acquisitionDate}
            onChange={handleFieldChange('acquisitionDate')}
          />
          <Input
            label="Data do Documento (opcional)"
            id="evidence-document-date"
            placeholder="Ex: 2018-05-15"
            value={draft.evidenceDate}
            onChange={handleFieldChange('evidenceDate')}
          />
        </div>

        <Input
          label="Quantidade de Ações Comprovada *"
          id="evidence-quantity"
          placeholder="Ex: 1000"
          value={draft.quantityCovered}
          onChange={handleFieldChange('quantityCovered')}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.md}px` }}>
          <Input
            label="Preço Unitário (R$)"
            id="evidence-unit-cost"
            placeholder="Ex: 8.50"
            value={draft.unitCost}
            onChange={handleFieldChange('unitCost')}
          />
          <Input
            label="Valor Total de Aquisição (R$)"
            id="evidence-total-cost"
            placeholder="Ex: 8500.00"
            value={draft.totalCost}
            onChange={handleFieldChange('totalCost')}
          />
        </div>

        <Input
          label="Origem / Identificação do Documento *"
          id="evidence-source-reference"
          placeholder="Ex: Nota Corretagem XP nº 123456 ou DIRPF 2020 Bens e Direitos cód 31"
          value={draft.sourceReference}
          onChange={handleFieldChange('sourceReference')}
        />

        <Input
          label="Observações Adicionais (opcional)"
          id="evidence-notes"
          placeholder="Ex: Posição transferida de custódia com histórico comprovado"
          value={draft.notes}
          onChange={handleFieldChange('notes')}
        />

        {/* Coverage Projection Preview */}
        {preview && (
          <div
            data-testid="evidence-preview-box"
            style={{
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: `${borderRadius.md}px`,
              padding: `${spacing.md}px`,
              fontSize: '0.8125rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontWeight: 700, color: colors.textPrimary, marginBottom: '2px' }}>
              📊 Projeção de Cobertura Documental
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: colors.textSecondary }}>Posição em Custódia:</span>
              <strong style={{ color: colors.textPrimary }}>{formatQuantity(preview.positionQuantity)} ações</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: colors.textSecondary }}>Cobertura Comprovada Projetada:</span>
              <strong style={{ color: colors.positive }}>
                {formatQuantity(preview.hypotheticalCoveredQuantity)} ações ({preview.coveragePercent}%)
              </strong>
            </div>
            {preview.uncoveredQuantity !== '0' && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textSecondary }}>Restante a Comprovar:</span>
                <span style={{ color: colors.warning }}>{formatQuantity(preview.uncoveredQuantity)} ações</span>
              </div>
            )}
            {preview.verifiedKnownCost.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textSecondary }}>Custo Total Conhecido:</span>
                <strong style={{ color: colors.textPrimary }}>
                  {formatCurrency(preview.verifiedKnownCost[0]?.amount || '0', preview.verifiedKnownCost[0]?.currency || 'BRL')}
                </strong>
              </div>
            )}
            {preview.alreadyCoveredWarning && (
              <div style={{ color: colors.negative, fontWeight: 600, marginTop: '4px' }}>
                ⚠️ {preview.alreadyCoveredWarning}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: `${spacing.sm}px`,
            marginTop: `${spacing.sm}px`,
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="outline"
            onClick={onClose}
            disabled={previewMutation.isPending || createMutation.isPending}
          >
            Cancelar
          </Button>

          <Button
            variant="secondary"
            data-testid="preview-evidence-btn"
            onClick={handlePreview}
            disabled={previewMutation.isPending || createMutation.isPending}
          >
            {previewMutation.isPending ? 'Projetando...' : 'Pré-visualizar Cobertura'}
          </Button>

          <Button
            variant="secondary"
            data-testid="save-draft-btn"
            onClick={() => handleSave('DRAFT')}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Salvando...' : 'Salvar como Rascunho'}
          </Button>

          <Button
            variant="primary"
            data-testid="save-and-submit-btn"
            onClick={() => handleSave('REVIEW_REQUIRED')}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Registrando...' : 'Registrar para Validação'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

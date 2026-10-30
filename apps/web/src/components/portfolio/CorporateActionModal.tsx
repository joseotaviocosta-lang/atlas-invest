'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { Modal, Input, Select, Button } from '@/components/ui';
import { OPERATION_CURRENCY_OPTIONS } from '@/lib/operation-entry';
import { colors, spacing, borderRadius } from '@atlas/ui';
import {
  CORPORATE_ACTION_TYPE_OPTIONS,
  CORPORATE_ACTION_TYPE_LABELS,
  CORPORATE_ACTION_TAX_MESSAGE,
  validateCorporateActionDraft,
  describeCorporateActionLeg,
  type ManualCorporateActionType,
} from '@/lib/corporate-action-entry';

export interface CorporateActionAccount {
  id: string;
  name: string;
}

export interface CorporateActionAsset {
  id: string;
  ticker: string;
  name: string;
}

interface StagedLeg {
  key: number;
  assetId: string;
  type: ManualCorporateActionType;
  tradeDate: string;
  factor: string;
  notes: string;
}

interface PreviewLeg {
  index: number;
  assetId: string;
  assetTicker: string | null;
  type: string;
  tradeDate: string;
  factor: string;
  status: 'READY' | 'DUPLICATE' | 'INVALID';
  message: string | null;
  beforeQuantity: string | null;
  afterQuantity: string | null;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE' | null;
  fractionWarning: string | null;
}

interface PreviewData {
  legs: PreviewLeg[];
  projectedQuantities: Array<{
    assetId: string;
    assetTicker: string | null;
    beforeQuantity: string | null;
    afterQuantity: string | null;
  }>;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  taxMessage: string;
  ledgerFingerprint: string;
  readyCount: number;
}

interface CorporateActionModalProps {
  portfolioId: string;
  accounts: CorporateActionAccount[];
  assets: CorporateActionAsset[];
  open: boolean;
  onClose: () => void;
}

let stagedKey = 0;

export function CorporateActionModal({
  portfolioId,
  accounts,
  assets,
  open,
  onClose,
}: CorporateActionModalProps) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [legs, setLegs] = useState<StagedLeg[]>([]);
  const [draftType, setDraftType] = useState<ManualCorporateActionType>('REVERSE_SPLIT');
  const [draftAssetId, setDraftAssetId] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftFactor, setDraftFactor] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  const resetStaging = () => {
    setLegs([]);
    setPreviewData(null);
    setFlowError(null);
    setDraftError(null);
  };

  const addLeg = () => {
    const draft = {
      assetId: draftAssetId,
      type: draftType,
      tradeDate: draftDate,
      factor: draftFactor.trim().replace(',', '.'),
      notes: draftNotes,
    };
    const error = validateCorporateActionDraft(draft);
    if (error) {
      setDraftError(error);
      return;
    }
    stagedKey += 1;
    setLegs((previous) => [...previous, { key: stagedKey, ...draft }]);
    setDraftError(null);
    setPreviewData(null);
    setDraftFactor('');
    setDraftNotes('');
  };

  const removeLeg = (key: number) => {
    setLegs((previous) => previous.filter((leg) => leg.key !== key));
    setPreviewData(null);
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: PreviewData }>(
        `/api/v1/portfolios/${portfolioId}/corporate-actions/preview`,
        {
          accountId,
          currency,
          legs: legs.map((leg) => ({
            assetId: leg.assetId,
            type: leg.type,
            tradeDate: leg.tradeDate,
            factor: leg.factor,
            notes: leg.notes,
          })),
        },
      );
      return res.data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setFlowError(null);
    },
    onError: (err: ApiError) => {
      setFlowError(err.message || 'Falha ao projetar eventos. Verifique os dados.');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!previewData) throw new Error('Gere a pré-visualização antes de confirmar.');
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/portfolios/${portfolioId}/corporate-actions/confirm`,
        {
          accountId,
          currency,
          expectedLedgerFingerprint: previewData.ledgerFingerprint,
          legs: legs.map((leg) => ({
            assetId: leg.assetId,
            type: leg.type,
            tradeDate: leg.tradeDate,
            factor: leg.factor,
            notes: leg.notes,
          })),
        },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-state', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-positions', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-transactions', portfolioId] });
      resetStaging();
      onClose();
    },
    onError: (err: ApiError) => {
      setFlowError(err.message || 'Falha ao confirmar eventos. Gere nova pré-visualização.');
    },
  });

  const readyCount = previewData?.readyCount ?? 0;
  const canConfirm =
    previewData !== null &&
    legs.length > 0 &&
    readyCount === legs.length &&
    !confirmMutation.isPending;

  return (
    <Modal isOpen={open} onClose={onClose} title="Registrar evento corporativo">
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
        label="Conta de custódia"
        options={accounts.map((account) => ({ value: account.id, label: account.name }))}
        value={accountId}
        onChange={(e) => {
          setAccountId(e.target.value);
          setPreviewData(null);
        }}
        disabled={previewMutation.isPending || confirmMutation.isPending}
      />

      <Select
        label="Moeda"
        options={OPERATION_CURRENCY_OPTIONS}
        value={currency}
        onChange={(e) => {
          setCurrency(e.target.value);
          setPreviewData(null);
        }}
        disabled={previewMutation.isPending || confirmMutation.isPending}
      />

      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.md}px`,
          padding: `${spacing.base}px`,
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: `${spacing.sm}px` }}>Novo evento</div>
        {draftError && (
          <div
            role="alert"
            style={{ color: colors.negative, fontSize: '0.875rem', marginBottom: 8 }}
          >
            {draftError}
          </div>
        )}
        <Select
          label="Tipo de evento"
          options={CORPORATE_ACTION_TYPE_OPTIONS}
          value={draftType}
          onChange={(e) => setDraftType(e.target.value as ManualCorporateActionType)}
        />
        <Select
          label="Ativo"
          options={assets.map((asset) => ({
            value: asset.id,
            label: `${asset.ticker} — ${asset.name}`,
          }))}
          value={draftAssetId}
          onChange={(e) => setDraftAssetId(e.target.value)}
        />
        <Input
          label="Data efetiva (AAAA-MM-DD)"
          placeholder="Ex: 2025-04-15"
          value={draftDate}
          onChange={(e) => setDraftDate(e.target.value)}
          inputMode="numeric"
        />
        <Input
          label="Fator (ex: 40 para grupamento 40:1, 80 para desdobramento 1:80)"
          placeholder="Ex: 40"
          value={draftFactor}
          onChange={(e) => setDraftFactor(e.target.value)}
          inputMode="decimal"
        />
        <Input
          label="Evidência / observação (obrigatória)"
          placeholder="Ex: Telefônica Brasil — grupamento 40:1, efeitos em 15/04/2025."
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
        />
        <Button type="button" variant="secondary" onClick={addLeg}>
          Adicionar evento à lista
        </Button>
      </div>

      {legs.length > 0 && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <div style={{ fontWeight: 700, marginBottom: `${spacing.sm}px` }}>
            Eventos preparados ({legs.length})
          </div>
          {legs.map((leg, index) => (
            <div
              key={leg.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
                borderTop: `1px solid ${colors.border}`,
                fontSize: '0.875rem',
              }}
            >
              <span>
                {index + 1}. {CORPORATE_ACTION_TYPE_LABELS[leg.type]} • {leg.tradeDate} • fator{' '}
                {leg.factor}
              </span>
              <button
                type="button"
                onClick={() => removeLeg(leg.key)}
                style={{
                  color: colors.accent,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  minHeight: 44,
                  textDecoration: 'underline',
                }}
                aria-label={`Remover evento ${index + 1}`}
              >
                Remover
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() => previewMutation.mutate()}
            isLoading={previewMutation.isPending}
            disabled={accountId === '' || legs.length === 0}
          >
            Projetar efeitos
          </Button>
        </div>
      )}

      {previewData && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.md}px`,
            padding: `${spacing.base}px`,
            marginBottom: `${spacing.base}px`,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: `${spacing.sm}px` }}>
            Projeção ({previewData.readyCount}/{previewData.legs.length} prontos)
          </div>
          {previewData.legs.map((leg) => (
            <div key={leg.index} style={{ fontSize: '0.875rem', marginBottom: 8 }}>
              <div>
                {leg.index + 1}. {CORPORATE_ACTION_TYPE_LABELS[leg.type] ?? leg.type} •{' '}
                {leg.assetTicker ?? leg.assetId} • {leg.tradeDate} • fator {leg.factor} —{' '}
                {leg.status === 'READY'
                  ? describeCorporateActionLeg(
                      leg.type,
                      leg.factor,
                      leg.beforeQuantity,
                      leg.afterQuantity,
                    )
                  : (leg.message ?? leg.status)}
              </div>
              {leg.fractionWarning && (
                <div style={{ color: colors.negative, marginTop: 4 }}>{leg.fractionWarning}</div>
              )}
            </div>
          ))}
          <div style={{ fontSize: '0.875rem', marginTop: 8 }}>
            Custo histórico:{' '}
            {previewData.costBasisStatus === 'INCOMPLETE'
              ? 'Incompleto — continuará incompleto (nunca R$ 0,00).'
              : 'Preservado integralmente pelo evento.'}
          </div>
          <div style={{ fontSize: '0.875rem', color: colors.textSecondary, marginTop: 4 }}>
            {previewData.taxMessage || CORPORATE_ACTION_TAX_MESSAGE}
          </div>
          <div
            style={{ display: 'flex', justifyContent: 'flex-end', marginTop: `${spacing.base}px` }}
          >
            <Button
              type="button"
              onClick={() => confirmMutation.mutate()}
              isLoading={confirmMutation.isPending}
              disabled={!canConfirm}
            >
              Confirmar {previewData.legs.length} evento
              {previewData.legs.length === 1 ? '' : 's'} corporativo
              {previewData.legs.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

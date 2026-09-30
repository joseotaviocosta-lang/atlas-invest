'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  colors,
  spacing,
  borderRadius,
  taxLiabilityQueryKey,
  mapToEquityFiscalViewModel,
  equityElectionActionLabel,
  equityElectionConsequenceLabel,
  type RawEquityMonthlyFiscal,
  type EquityCategoryVM,
  type EquityElectionValue,
} from '@atlas/ui';
import { apiClient } from '@/api/client';
import {
  Card,
  SectionHeader,
  Button,
  Modal,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui';

interface EquityFiscalSectionProps {
  competence: string;
  equity: RawEquityMonthlyFiscal | null | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRefetch: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: `${spacing.sm}px`,
        fontSize: '0.875rem',
        padding: '3px 0',
      }}
    >
      <span style={{ color: colors.textSecondary }}>{label}</span>
      <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function CategoryCard({
  title,
  category,
  showMatchedQuantity,
  testId,
}: {
  title: string;
  category: EquityCategoryVM;
  showMatchedQuantity: boolean;
  testId: string;
}) {
  return (
    <Card style={{ padding: `${spacing.base}px` }} data-testid={testId}>
      <strong style={{ color: colors.textPrimary, fontSize: '1rem' }}>{title}</strong>
      <div style={{ marginTop: `${spacing.xs}px` }}>
        <Field label="Situação da isenção" value={category.exemptionLabel} />
        <Field label="Vendas no mês" value={category.grossSalesFormatted} />
        {category.thresholdFormatted && (
          <Field label="Limite de isenção" value={category.thresholdFormatted} />
        )}
        {showMatchedQuantity && category.matchedQuantityFormatted && (
          <Field label="Quantidade em day trade" value={category.matchedQuantityFormatted} />
        )}
        <Field label="Resultado do mês" value={category.currentResultFormatted} />
        <Field label="Prejuízo acumulado inicial" value={category.openingLossFormatted} />
        <Field label="Prejuízo reconhecido no mês" value={category.lossAddedFormatted} />
        <Field label="Prejuízo compensado" value={category.lossConsumedFormatted} />
        <Field label="Prejuízo acumulado final" value={category.closingLossFormatted} />
        <Field
          label="Base tributável antes de IRRF"
          value={category.taxableBaseBeforeRateFormatted}
        />
      </div>
    </Card>
  );
}

function ElectionDecision({
  competence,
  currentValue,
  statusLabel,
  required,
  onChoose,
}: {
  competence: string;
  currentValue: EquityElectionValue | null;
  statusLabel: string;
  required: boolean;
  onChoose: (value: EquityElectionValue) => void;
}) {
  return (
    <Card
      style={{ padding: `${spacing.base}px`, marginTop: `${spacing.base}px` }}
      data-testid="equity-election"
    >
      <strong style={{ color: colors.textPrimary, fontSize: '1rem' }}>
        {required ? 'Reconhecer este prejuízo para compensação futura?' : 'Compensação futura'}
      </strong>
      <p style={{ fontSize: '0.875rem', color: colors.textSecondary, marginTop: '6px' }}>
        {required
          ? 'Este mês teve prejuízo em operações comuns dentro do limite de isenção. Para considerar esse prejuízo na compensação de meses futuros, confirme sua opção.'
          : 'Você pode alterar sua opção de reconhecimento deste prejuízo.'}
      </p>
      <div
        style={{ fontSize: '0.8125rem', color: colors.textMuted, marginTop: '4px' }}
        data-testid="equity-election-status"
      >
        Situação atual: <strong style={{ color: colors.textPrimary }}>{statusLabel}</strong>
      </div>
      <div
        role="group"
        aria-label={`Opção de compensação para ${competence}`}
        style={{
          display: 'flex',
          gap: `${spacing.sm}px`,
          marginTop: `${spacing.base}px`,
          flexWrap: 'wrap',
        }}
      >
        <Button
          variant="primary"
          onClick={() => onChoose('DECLARE_FOR_CARRYFORWARD')}
          aria-pressed={currentValue === 'DECLARE_FOR_CARRYFORWARD'}
          data-testid="equity-election-declare"
          style={{ minHeight: '44px' }}
        >
          Reconhecer prejuízo
        </Button>
        <Button
          variant="outline"
          onClick={() => onChoose('DO_NOT_DECLARE')}
          aria-pressed={currentValue === 'DO_NOT_DECLARE'}
          data-testid="equity-election-decline"
          style={{ minHeight: '44px' }}
        >
          Não reconhecer
        </Button>
      </div>
    </Card>
  );
}

export function EquityFiscalSection({
  competence,
  equity,
  isLoading,
  isError,
  errorMessage,
  onRefetch,
}: EquityFiscalSectionProps) {
  const queryClient = useQueryClient();
  const [pendingValue, setPendingValue] = useState<EquityElectionValue | null>(null);

  const mutation = useMutation({
    mutationFn: (value: EquityElectionValue) =>
      apiClient.put(`/api/v1/fiscal/monthly/${competence}/elections/equity-exempt-loss`, {
        value,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taxLiabilityQueryKey(competence) });
      setPendingValue(null);
      onRefetch();
    },
  });

  const viewModel = mapToEquityFiscalViewModel(equity ?? null);

  return (
    <div style={{ marginTop: `${spacing.xl}px` }} data-testid="equity-fiscal-section">
      <SectionHeader
        title="Ações"
        description="Apuração mensal de renda variável derivada do livro-razão (servidor)"
      />

      {isLoading && !viewModel && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <Skeleton width="200px" height="1.25rem" />
          <Skeleton width="100%" height="60px" />
        </Card>
      )}

      {isError && !isLoading && !viewModel && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <ErrorState
            title="Falha ao carregar a apuração de ações"
            message={errorMessage || 'Ocorreu um erro ao consultar a apuração de renda variável.'}
            onRetry={onRefetch}
          />
        </Card>
      )}

      {viewModel && viewModel.blocked && (
        <Card style={{ padding: `${spacing.base}px` }} data-testid="equity-blocked">
          <div role="status" style={{ color: colors.warning, fontWeight: 600 }}>
            Dados insuficientes para concluir
          </div>
          <div style={{ fontSize: '0.875rem', color: colors.textSecondary, marginTop: '6px' }}>
            {viewModel.blockedReasonLabel}
          </div>
        </Card>
      )}

      {viewModel && !viewModel.blocked && !viewModel.hasActivity && (
        <Card style={{ padding: `${spacing.xl}px` }} data-testid="equity-empty">
          <EmptyState
            title="Sem operações de ações nesta competência"
            description="Não há operações de renda variável registradas para o mês selecionado."
          />
        </Card>
      )}

      {viewModel && !viewModel.blocked && viewModel.hasActivity && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: `${spacing.base}px`,
            }}
          >
            <CategoryCard
              title="Operações comuns"
              category={viewModel.normal}
              showMatchedQuantity={false}
              testId="equity-normal-card"
            />
            <CategoryCard
              title="Day trade"
              category={viewModel.dayTrade}
              showMatchedQuantity={true}
              testId="equity-day-trade-card"
            />
          </div>

          {(viewModel.election.required ||
            viewModel.election.status === 'DECLARED' ||
            viewModel.election.status === 'NOT_DECLARED') && (
            <ElectionDecision
              competence={competence}
              currentValue={viewModel.election.currentValue}
              statusLabel={viewModel.election.statusLabel}
              required={viewModel.election.required}
              onChoose={(value) => setPendingValue(value)}
            />
          )}
        </>
      )}

      <Modal
        isOpen={pendingValue !== null}
        onClose={() => setPendingValue(null)}
        title="Confirmar opção fiscal"
      >
        <div style={{ fontSize: '0.875rem', color: colors.textPrimary }}>
          <Field label="Competência" value={competence} />
          <Field
            label="Opção selecionada"
            value={pendingValue ? equityElectionActionLabel(pendingValue) : ''}
          />
          <p style={{ marginTop: `${spacing.sm}px`, color: colors.textSecondary }}>
            {pendingValue ? equityElectionConsequenceLabel(pendingValue) : ''}
          </p>
        </div>
        {mutation.isError && (
          <div
            style={{ color: colors.negative, fontSize: '0.8125rem', marginTop: `${spacing.sm}px` }}
          >
            Não foi possível registrar a opção. Tente novamente.
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: `${spacing.sm}px`,
            justifyContent: 'flex-end',
            marginTop: `${spacing.base}px`,
          }}
        >
          <Button
            variant="outline"
            onClick={() => setPendingValue(null)}
            data-testid="equity-election-cancel"
            style={{ minHeight: '44px' }}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            isLoading={mutation.isPending}
            onClick={() => pendingValue && mutation.mutate(pendingValue)}
            data-testid="equity-election-confirm"
            style={{ minHeight: '44px', borderRadius: `${borderRadius.md}px` }}
          >
            Confirmar
          </Button>
        </div>
      </Modal>
    </div>
  );
}

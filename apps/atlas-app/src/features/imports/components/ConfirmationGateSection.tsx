import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { Card, Button } from '../../../components/ui';
import type { ConfirmEligibility } from '../helpers';

export interface ConfirmationGateSectionProps {
  eligibility: ConfirmEligibility;
  isConfirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationGateSection: React.FC<ConfirmationGateSectionProps> = ({
  eligibility,
  isConfirming,
  onConfirm,
  onCancel,
}) => {
  return (
    <Card
      style={{
        padding: `${spacing.xl}px`,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.md}px`,
          marginBottom: `${spacing.lg}px`,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: colors.textPrimary,
              margin: '0 0 4px 0',
            }}
          >
            Confirmação de Importação
          </h3>
          <p
            style={{
              fontSize: '0.8125rem',
              color: colors.textSecondary,
              margin: 0,
            }}
          >
            Revise o resumo antes de gravar no livro-razão. As operações confirmadas gerarão transações canônicas imutáveis.
          </p>
        </div>

        <div style={{ display: 'flex', gap: `${spacing.md}px`, alignItems: 'center' }}>
          <Button variant="secondary" onClick={onCancel} disabled={isConfirming}>
            Descartar
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={!eligibility.canConfirm || isConfirming}
          >
            {isConfirming ? 'Gravando no livro-razão…' : `Confirmar Importação (${eligibility.importableCount})`}
          </Button>
        </div>
      </div>

      {/* Breakdown Badges */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: `${spacing.md}px`,
          padding: `${spacing.md}px`,
          backgroundColor: `${colors.border}15`,
          borderRadius: `${borderRadius.md}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}>
          <span style={{ color: colors.positive, fontWeight: 700 }}>●</span>
          <span style={{ fontWeight: 600, color: colors.textPrimary }}>
            {eligibility.importableCount}
          </span>
          <span style={{ color: colors.textSecondary }}>serão importadas</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}>
          <span style={{ color: colors.textSecondary, fontWeight: 700 }}>●</span>
          <span style={{ fontWeight: 600, color: colors.textPrimary }}>
            {eligibility.skippedCount + eligibility.autoSkippedCount}
          </span>
          <span style={{ color: colors.textSecondary }}>serão ignoradas</span>
        </div>

        {eligibility.blockedCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}>
            <span style={{ color: colors.negative, fontWeight: 700 }}>●</span>
            <span style={{ fontWeight: 600, color: colors.negative }}>
              {eligibility.blockedCount}
            </span>
            <span style={{ color: colors.negative }}>bloqueadas</span>
          </div>
        )}

        {eligibility.pendingCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}>
            <span style={{ color: colors.warning, fontWeight: 700 }}>●</span>
            <span style={{ fontWeight: 600, color: colors.warning }}>
              {eligibility.pendingCount}
            </span>
            <span style={{ color: colors.warning }}>pendentes (não importadas)</span>
          </div>
        )}
      </div>

      {/* Hint Alert */}
      {eligibility.hint && (
        <div
          style={{
            marginTop: `${spacing.md}px`,
            padding: `${spacing.md}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: eligibility.blockedCount > 0 ? `${colors.negative}15` : `${colors.accent}15`,
            border: `1px solid ${eligibility.blockedCount > 0 ? `${colors.negative}40` : `${colors.accent}40`}`,
            color: eligibility.blockedCount > 0 ? colors.negative : colors.textPrimary,
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
          }}
        >
          <span>{eligibility.blockedCount > 0 ? '⚠️' : 'ℹ️'}</span>
          <span>{eligibility.hint}</span>
        </div>
      )}
    </Card>
  );
};

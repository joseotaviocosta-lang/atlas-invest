import React from 'react';
import { Card, Badge, Button } from '../../../components/ui';
import { colors, spacing, borderRadius, formatQuantity } from '@atlas/ui';
import {
  COST_EVIDENCE_ASSESSMENT_LABELS,
} from '../cost-evidence-entry';
import type { CostAssessmentDto, CostEvidencePreviewDto } from '../types';

export interface CostAssessmentCardProps {
  assessment: CostAssessmentDto | null;
  activeTicker: string;
  accountName?: string;
  positionQuantity: string;
  onOpenRegularize?: () => void;
  preview?: CostEvidencePreviewDto | null;
}

export const CostAssessmentCard: React.FC<CostAssessmentCardProps> = ({
  assessment,
  activeTicker,
  accountName = 'Custódia Principal',
  positionQuantity,
  onOpenRegularize,
  preview,
}) => {
  const coveragePercent = preview ? preview.coveragePercent : (assessment?.coveragePercent || '0.00');
  const isCoveredComplete = assessment?.status === 'COMPLETE' || preview?.status === 'COMPLETE' || Number(coveragePercent) >= 100;
  const uncoveredQty = preview ? preview.uncoveredQuantity : (assessment?.uncoveredQuantity || positionQuantity);
  const evidenceQty = preview ? preview.evidenceCoveredQuantity : (assessment?.evidenceCoveredQuantity || '0');
  const ledgerQty = preview ? preview.ledgerKnownQuantity : (assessment?.ledgerKnownQuantity || '0');

  return (
    <Card
      data-testid="cost-assessment-card"
      style={{
        padding: `${spacing.lg}px`,
        backgroundColor: colors.surfaceElevated,
        borderRadius: `${borderRadius.lg}px`,
        border: `1px solid ${colors.border}`,
      }}
    >
      {/* Card Top: Ticker & Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.md}px`,
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: colors.textPrimary, margin: 0 }}>
            Diagnóstico de Base de Custo — {activeTicker}
          </h3>
          <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
            Conta: {accountName}
          </span>
        </div>

        <Badge variant={isCoveredComplete ? 'positive' : 'warning'}>
          {COST_EVIDENCE_ASSESSMENT_LABELS[assessment?.status || 'INCOMPLETE'] || 'Pendente de Comprovação'}
        </Badge>
      </div>

      {/* Coverage Bar */}
      <div style={{ marginBottom: `${spacing.lg}px` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '6px' }}>
          <span style={{ color: colors.textSecondary }}>Progresso de Cobertura Documental</span>
          <strong style={{ color: colors.textPrimary }}>{coveragePercent}% coberto</strong>
        </div>
        <div
          style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(Number(coveragePercent), 100)}%`,
              backgroundColor: isCoveredComplete ? colors.positive : colors.warning,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: `${spacing.md}px`,
          marginBottom: `${spacing.lg}px`,
        }}
      >
        <div style={{ padding: `${spacing.sm}px`, backgroundColor: colors.surface, borderRadius: `${borderRadius.md}px` }}>
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Custódia Total</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary }}>
            {formatQuantity(positionQuantity)}
          </div>
        </div>

        <div style={{ padding: `${spacing.sm}px`, backgroundColor: colors.surface, borderRadius: `${borderRadius.md}px` }}>
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Coberto no Livro B3</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary }}>
            {formatQuantity(ledgerQty)}
          </div>
        </div>

        <div style={{ padding: `${spacing.sm}px`, backgroundColor: colors.surface, borderRadius: `${borderRadius.md}px` }}>
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Coberto por Evidências</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.positive }}>
            {formatQuantity(evidenceQty)}
          </div>
        </div>

        <div style={{ padding: `${spacing.sm}px`, backgroundColor: colors.surface, borderRadius: `${borderRadius.md}px` }}>
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Pendente a Comprovar</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.warning }}>
            {formatQuantity(uncoveredQty)}
          </div>
        </div>
      </div>

      {/* Context Guidance Box */}
      <div
        style={{
          backgroundColor: isCoveredComplete ? `${colors.positive}10` : `${colors.warning}10`,
          border: `1px solid ${isCoveredComplete ? colors.positive + '33' : colors.warning + '33'}`,
          borderRadius: `${borderRadius.md}px`,
          padding: `${spacing.md}px`,
          marginBottom: `${spacing.lg}px`,
          fontSize: '0.8125rem',
          lineHeight: 1.5,
          color: colors.textSecondary,
        }}
      >
        {isCoveredComplete ? (
          <span style={{ color: colors.positive, fontWeight: 600 }}>
            ✓ Posição com custo histórico 100% auditado. O motor fiscal está habilitado para apurações normais desta custódia.
          </span>
        ) : (
          <span>
            💡 <strong>Ação de Regularização:</strong> Para cobrir as <strong>{uncoveredQty} ações</strong> pendentes de {activeTicker}, registre a cópia da <strong>DIRPF 2020 (Ano-calendário 2019 — Bens e Direitos)</strong> ou nota de corretagem da compra original.
          </span>
        )}
      </div>

      {/* Action Trigger */}
      {onOpenRegularize && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.md}px` }}>
          <Button
            variant="primary"
            data-testid="open-add-evidence-modal"
            onClick={onOpenRegularize}
          >
            + Regularizar Custo / Adicionar Evidência
          </Button>
        </div>
      )}
    </Card>
  );
};

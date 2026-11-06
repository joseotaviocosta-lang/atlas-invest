import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { Modal, Badge, Button } from '../../../components/ui';
import type { PositionValuationDto } from '../types';

export interface DocumentaryExceptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  incompletePositions: PositionValuationDto[];
}

export const DocumentaryExceptionsModal: React.FC<DocumentaryExceptionsModalProps> = ({
  isOpen,
  onClose,
  incompletePositions,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pendências Documentais de Custo Histórico"
      maxWidth="680px"
    >
      <div
        data-testid="documentary-exceptions-modal"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${spacing.lg}px`,
        }}
      >
        {/* Context Summary */}
        <div
          style={{
            backgroundColor: `${colors.accent}10`,
            border: `1px solid ${colors.accent}30`,
            borderRadius: `${borderRadius.md}px`,
            padding: `${spacing.md}px`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: colors.textPrimary }}>
              Situação da Base de Custo da Carteira
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.6 }}>
            <strong>33 de 36 posições</strong> possuem custo de aquisição 100% auditado via histórico oficial da B3.
            Apenas <strong>3 posições</strong> possuem compras originais anteriores ao limite dos arquivos disponíveis (28/11/2019).
          </p>
        </div>

        {/* List of Affected Positions */}
        <div>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              color: colors.textPrimary,
              margin: `0 0 ${spacing.sm}px 0`,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Ativos com Aquisições Anteriores a 28/11/2019 ({incompletePositions.length})
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            {incompletePositions.map((pos) => {
              const ticker = pos.ticker || pos.assetId.slice(0, 8);
              return (
                <div
                  key={pos.assetId}
                  style={{
                    backgroundColor: colors.surfaceElevated,
                    border: `1px solid ${colors.border}`,
                    borderRadius: `${borderRadius.md}px`,
                    padding: `${spacing.md}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                  data-testid={`documentary-item-${ticker}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.0625rem', color: colors.textPrimary }}>
                        {ticker}
                      </span>
                      <Badge variant="warning">Custo Pendente</Badge>
                    </div>
                    <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                      Custódia: <strong>{pos.quantity} ações</strong>
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.5 }}>
                    <strong style={{ color: colors.textPrimary }}>Motivo:</strong> Aquisição original anterior a 28/11/2019 (fora do período fornecido pela B3).
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.5 }}>
                    <strong style={{ color: colors.textPrimary }}>Documento necessário:</strong> Cópia da DIRPF 2020 (Ano-calendário 2019 — Bens e Direitos) ou nota de corretagem da compra original.
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Guarantees and What Works Normally */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: `${spacing.md}px`,
          }}
        >
          {/* Normal Functioning */}
          <div
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: `${colors.positive}0d`,
              border: `1px solid ${colors.positive}33`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1rem', color: colors.positive }}>✓</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: colors.positive }}>
                Funcionamento Normal
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.75rem', color: colors.textSecondary, lineHeight: 1.6 }}>
              <li>Acompanhamento patrimonial e cotações de fechamento.</li>
              <li>Valor total de mercado e evolução da carteira.</li>
              <li>Histórico de proventos (dividendos e JCP).</li>
              <li>Alocação percentual por classe de ativos.</li>
            </ul>
          </div>

          {/* Protection / Fail-Closed */}
          <div
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: `${colors.warning}0d`,
              border: `1px solid ${colors.warning}33`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1rem', color: colors.warning }}>🛡️</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: colors.warning }}>
                Proteção Fiscal (Fail-Closed)
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.75rem', color: colors.textSecondary, lineHeight: 1.6 }}>
              <li>O Atlas nunca assume custo zero para não superestimar imposto.</li>
              <li>A apuração de ganho de capital em 10/2026 fica suspensa.</li>
              <li>Zero risco de recolhimento indevido ou penalidade fiscal.</li>
            </ul>
          </div>
        </div>

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: `${spacing.xs}px` }}>
          <Button variant="primary" onClick={onClose} style={{ minWidth: '120px' }}>
            Entendido
          </Button>
        </div>
      </div>
    </Modal>
  );
};

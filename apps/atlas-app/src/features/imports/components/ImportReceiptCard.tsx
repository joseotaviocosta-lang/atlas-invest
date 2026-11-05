import React from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { Card, Button, StatCard } from '../../../components/ui';
import type { ImportReceipt } from '../types';

export interface ImportReceiptCardProps {
  receipt: ImportReceipt;
  onNewImport: () => void;
  onViewPortfolio: () => void;
}

export const ImportReceiptCard: React.FC<ImportReceiptCardProps> = ({
  receipt,
  onNewImport,
  onViewPortfolio,
}) => {
  return (
    <Card style={{ padding: `${spacing.xl}px` }}>
      <div style={{ textAlign: 'center', marginBottom: `${spacing.xl}px` }}>
        <div style={{ fontSize: '3rem', marginBottom: `${spacing.sm}px` }}>🎉</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.positive, margin: '0 0 8px 0' }}>
          Importação Confirmada com Sucesso!
        </h2>
        <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
          Recibo de operação: <code style={{ color: colors.textPrimary }}>{receipt.receiptId}</code>
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: `${spacing.md}px`,
          marginBottom: `${spacing.xl}px`,
        }}
      >
        <StatCard
          label="Transações Criadas"
          value={String(receipt.created)}
          changeType="positive"
        />
        <StatCard
          label="Duplicadas Ignoradas"
          value={String(receipt.skippedDuplicates)}
        />
        <StatCard
          label="Ignoradas pelo Usuário"
          value={String(receipt.skippedByUser)}
        />
        <StatCard
          label="Total Processado"
          value={String(receipt.totalRows)}
        />
      </div>

      {receipt.transactionIds.length > 0 && (
        <div
          style={{
            marginBottom: `${spacing.xl}px`,
            padding: `${spacing.md}px`,
            backgroundColor: `${colors.border}15`,
            borderRadius: `${borderRadius.md}px`,
            fontSize: '0.8125rem',
          }}
        >
          <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: `${spacing.xs}px` }}>
            IDs das transações geradas ({receipt.transactionIds.length}):
          </div>
          <div
            style={{
              maxHeight: '120px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              color: colors.textSecondary,
              lineHeight: 1.5,
            }}
          >
            {receipt.transactionIds.slice(0, 10).map((id) => (
              <div key={id}>{id}</div>
            ))}
            {receipt.transactionIds.length > 10 && (
              <div style={{ fontStyle: 'italic', marginTop: '4px' }}>
                ... e mais {receipt.transactionIds.length - 10} transações
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: `${spacing.md}px` }}>
        <Button variant="secondary" onClick={onNewImport}>
          Nova Importação
        </Button>
        <Button variant="primary" onClick={onViewPortfolio}>
          Ver Carteira Atualizada
        </Button>
      </div>
    </Card>
  );
};

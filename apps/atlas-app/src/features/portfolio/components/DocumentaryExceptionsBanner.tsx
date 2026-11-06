import React, { useState } from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { Button } from '../../../components/ui';
import { DocumentaryExceptionsModal } from './DocumentaryExceptionsModal';
import type { PositionValuationDto } from '../types';

export interface DocumentaryExceptionsBannerProps {
  positions?: PositionValuationDto[];
  style?: React.CSSProperties;
}

export const DocumentaryExceptionsBanner: React.FC<DocumentaryExceptionsBannerProps> = ({
  positions = [],
  style,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const incompletePositions = positions.filter((p) => p.costBasisStatus === 'INCOMPLETE');

  if (incompletePositions.length === 0) {
    return null;
  }

  const tickerList = incompletePositions.map((p) => p.ticker || p.assetId.slice(0, 6)).join(', ');

  return (
    <>
      <div
        data-testid="documentary-exceptions-banner"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: `${spacing.md}px`,
          padding: `${spacing.sm}px ${spacing.md}px`,
          backgroundColor: `${colors.warning}0f`,
          border: `1px solid ${colors.warning}40`,
          borderRadius: `${borderRadius.md}px`,
          marginBottom: `${spacing.md}px`,
          flexWrap: 'wrap',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, flex: 1, minWidth: '240px' }}>
          <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>ℹ️</span>
          <div>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textPrimary }}>
              {`${incompletePositions.length} ${incompletePositions.length === 1 ? 'posição possui' : 'posições possuem'} custo anterior a 28/11/2019 pendente de comprovação (${tickerList}).`}
            </span>
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary, marginLeft: '6px' }}>
              Cotações e patrimônio operam normalmente.
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          data-testid="view-documentary-details-btn"
          style={{
            borderColor: `${colors.warning}60`,
            color: colors.textPrimary,
            fontSize: '0.75rem',
            padding: '4px 12px',
            minHeight: '32px',
          }}
        >
          Ver detalhes
        </Button>
      </div>

      <DocumentaryExceptionsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        incompletePositions={incompletePositions}
      />
    </>
  );
};

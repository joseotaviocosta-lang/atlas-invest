import React, { useState } from 'react';
import { usePortfolio } from '../../../providers/PortfolioProvider';
import { useUpdateMarketData } from '../hooks';
import { Button } from '../../../components/ui';
import { colors } from '@atlas/ui';

export const ManualRefreshButton: React.FC<{ variant?: 'primary' | 'secondary' | 'outline' }> = ({
  variant = 'outline',
}) => {
  const { selectedPortfolioId } = usePortfolio();
  const updateMutation = useUpdateMarketData(selectedPortfolioId);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleRefresh = async () => {
    if (!selectedPortfolioId || updateMutation.isPending) return;
    setFeedback(null);
    try {
      const receipt = await updateMutation.mutateAsync();
      const updated = receipt.quotesUpdated ?? 0;
      setFeedback(`Atualizado (${updated} cotações)`);
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback('Falha na atualização');
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <Button
        variant={variant}
        size="sm"
        isLoading={updateMutation.isPending}
        disabled={!selectedPortfolioId || updateMutation.isPending}
        onClick={handleRefresh}
        title="Atualizar cotações de mercado agora"
        data-testid="manual-refresh-button"
      >
        <span style={{ marginRight: '4px' }} aria-hidden="true">🔄</span>
        {updateMutation.isPending ? 'Atualizando...' : 'Atualizar Cotações'}
      </Button>
      {feedback && (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: feedback.includes('Falha') ? colors.negative : colors.positive,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {feedback}
        </span>
      )}
    </div>
  );
};

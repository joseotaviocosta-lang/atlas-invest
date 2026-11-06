import React, { useState } from 'react';
import { usePortfolio } from '../../../providers/PortfolioProvider';
import { useUpdateMarketData } from '../hooks';
import { Button } from '../../../components/ui';
import { colors } from '@atlas/ui';
import { useAppLifecycle } from '../../../hooks/useAppLifecycle';

export const ManualRefreshButton: React.FC<{ variant?: 'primary' | 'secondary' | 'outline' }> = ({
  variant = 'outline',
}) => {
  const { selectedPortfolioId } = usePortfolio();
  const { isOnline } = useAppLifecycle();
  const updateMutation = useUpdateMarketData(selectedPortfolioId);
  const [feedback, setFeedback] = useState<{ message: string; type: 'positive' | 'warning' | 'negative' } | null>(null);

  const handleRefresh = async () => {
    if (!isOnline) {
      setFeedback({ message: 'Indisponível offline', type: 'warning' });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }
    if (!selectedPortfolioId || updateMutation.isPending) return;
    setFeedback(null);
    try {
      const receipt = await updateMutation.mutateAsync();
      const updated = receipt.quotesUpdated ?? 0;
      const requested = receipt.quotesRequested ?? 0;
      const unpriced = Math.max(0, requested - updated);

      if (receipt.status === 'FAILED') {
        setFeedback({ message: receipt.message || 'Falha na atualização', type: 'negative' });
      } else if (unpriced > 0 && requested > 0) {
        setFeedback({
          message: `${updated}/${requested} atualizadas (${unpriced} sem cotação)`,
          type: 'warning',
        });
      } else {
        setFeedback({
          message: `Atualizado (${updated} cotações)`,
          type: 'positive',
        });
      }
      setTimeout(() => setFeedback(null), 5000);
    } catch {
      setFeedback({ message: 'Falha na atualização', type: 'negative' });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const getFeedbackColor = () => {
    if (!feedback) return colors.textSecondary;
    if (feedback.type === 'negative') return colors.negative;
    if (feedback.type === 'warning') return colors.warning;
    return colors.positive;
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <Button
        variant={variant}
        size="sm"
        isLoading={updateMutation.isPending}
        disabled={!selectedPortfolioId || updateMutation.isPending || !isOnline}
        onClick={handleRefresh}
        style={{ minHeight: '44px' }}
        title={!isOnline ? 'Atualização indisponível offline' : 'Atualizar cotações de mercado agora'}
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
            color: getFeedbackColor(),
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {feedback.message}
        </span>
      )}
    </div>
  );
};

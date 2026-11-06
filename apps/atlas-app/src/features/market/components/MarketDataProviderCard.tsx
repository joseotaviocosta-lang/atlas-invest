import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button } from '../../../components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { apiClient } from '../../../lib/api';

export interface ProviderStatusDto {
  provider: string;
  authenticated: boolean;
  source: 'ENVIRONMENT' | 'LOCAL_SECRET_STORE' | 'NONE';
  status: 'CONFIGURED' | 'NOT_CONFIGURED';
  message: string;
}

export const MarketDataProviderCard: React.FC = () => {
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; type: 'positive' | 'warning' | 'negative' } | null>(null);

  const { data: statusRes, isLoading } = useQuery<{ data: ProviderStatusDto }>({
    queryKey: ['market-data-provider-status'],
    queryFn: () => apiClient.get<{ data: ProviderStatusDto }>('/api/v1/market/provider-status'),
    staleTime: 30 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: (token: string) =>
      apiClient.post<{ data: ProviderStatusDto }>('/api/v1/market/configure-token', { token }),
    onSuccess: () => {
      setTokenInput('');
      setFeedback({ message: 'Chave salva com sucesso no secret storage local.', type: 'positive' });
      queryClient.invalidateQueries({ queryKey: ['market-data-provider-status'] });
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar a chave.';
      setFeedback({ message: msg, type: 'negative' });
      setTimeout(() => setFeedback(null), 4000);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => apiClient.delete<{ data: ProviderStatusDto }>('/api/v1/market/configure-token'),
    onSuccess: () => {
      setFeedback({ message: 'Chave removida. Provedor revertido ao modo público.', type: 'warning' });
      queryClient.invalidateQueries({ queryKey: ['market-data-provider-status'] });
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: () => {
      setFeedback({ message: 'Falha ao remover a chave.', type: 'negative' });
      setTimeout(() => setFeedback(null), 4000);
    },
  });

  const status = statusRes?.data;
  const isConfigured = Boolean(status?.authenticated);

  const handleSave = () => {
    if (!tokenInput.trim() || tokenInput.trim().length < 5) {
      setFeedback({ message: 'A chave deve ter no mínimo 5 caracteres.', type: 'warning' });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }
    saveMutation.mutate(tokenInput.trim());
  };

  const handleClear = () => {
    clearMutation.mutate();
  };

  const getSourceLabel = (src?: string) => {
    if (src === 'ENVIRONMENT') return 'Variável de Ambiente';
    if (src === 'LOCAL_SECRET_STORE') return 'Armazenamento Seguro Local (secrets.json)';
    return 'Não configurada (Modo público limitado)';
  };

  return (
    <Card data-testid="market-data-provider-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px`, flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary, margin: 0 }}>
            Provedor de Mercado: {status?.provider || 'BRAPI'}
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem', color: colors.textSecondary }}>
            Cotações da B3 (Ações, FIIs, Fiagros e BDRs) para apuração patrimonial
          </p>
        </div>
        <Badge variant={isConfigured ? 'positive' : 'neutral'}>
          {isConfigured ? 'Autenticação: Configurada' : 'Autenticação: Não configurada'}
        </Badge>
      </div>

      <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginBottom: `${spacing.md}px`, lineHeight: 1.5 }}>
        <div>
          <strong style={{ color: colors.textPrimary }}>Origem da Credencial:</strong> {isLoading ? 'Verificando...' : getSourceLabel(status?.source)}
        </div>
        {!isConfigured && (
          <div style={{ marginTop: '4px', color: colors.warning }}>
            Aviso: Sem chave configurada, a BRAPI pública disponibiliza cotações apenas para PETR4. Os demais ativos ficam sem cotação.
          </div>
        )}
      </div>

      {/* Secret Input Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textPrimary }}>
          Configurar Chave BRAPI (Salva exclusivamente no backend local)
        </div>
        <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Insira sua chave de API BRAPI (ex: abc123xyz...)"
            style={{
              flex: 1,
              minWidth: '220px',
              padding: '8px 12px',
              fontSize: '0.8125rem',
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: `${borderRadius.md}px`,
              color: colors.textPrimary,
              outline: 'none',
            }}
            data-testid="market-provider-token-input"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={saveMutation.isPending}
            disabled={saveMutation.isPending || !tokenInput.trim()}
            data-testid="market-provider-save-token-btn"
          >
            Salvar Chave
          </Button>
          {isConfigured && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClear}
              isLoading={clearMutation.isPending}
              disabled={clearMutation.isPending}
              data-testid="market-provider-clear-token-btn"
            >
              Remover
            </Button>
          )}
        </div>
        {feedback && (
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              marginTop: '4px',
              color: feedback.type === 'positive' ? colors.positive : feedback.type === 'warning' ? colors.warning : colors.negative,
            }}
          >
            {feedback.message}
          </div>
        )}
      </div>
    </Card>
  );
};

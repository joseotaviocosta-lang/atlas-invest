'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { PortfolioDto, PortfolioType } from '@/api/types';
import {
  Button,
  Card,
  Badge,
  Modal,
  Input,
  Select,
  Skeleton,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { themeTokens } from '@atlas/ui';

const PORTFOLIO_TYPE_LABELS: Record<PortfolioType, string> = {
  PERSONAL: 'Pessoal',
  FAMILY: 'Família',
  COMPANY: 'Empresa',
  SIMULATION: 'Simulação',
};

const PORTFOLIO_TYPE_OPTIONS = [
  { value: 'PERSONAL', label: 'Pessoal' },
  { value: 'FAMILY', label: 'Família' },
  { value: 'COMPANY', label: 'Empresa' },
  { value: 'SIMULATION', label: 'Simulação' },
];

export default function PortfolioPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PortfolioType>('PERSONAL');
  const [baseCurrency, setBaseCurrency] = useState('BRL');
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch Portfolios
  const {
    data: portfolios,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PortfolioDto[], ApiError>({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioDto[] }>('/api/v1/portfolios');
      return res.data;
    },
  });

  // Create Portfolio Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; type: PortfolioType; baseCurrency: string }) => {
      const res = await apiClient.post<{ data: PortfolioDto }>('/api/v1/portfolios', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      setIsModalOpen(false);
      setName('');
      setType('PERSONAL');
      setBaseCurrency('BRL');
      setFormError(null);
    },
    onError: (err: ApiError) => {
      setFormError(err.message || 'Falha ao criar carteira. Verifique os dados.');
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Informe o nome da carteira.');
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      type,
      baseCurrency,
    });
  };

  const getBadgeVariant = (
    portType: PortfolioType,
  ): 'primary' | 'success' | 'warning' | 'neutral' => {
    switch (portType) {
      case 'PERSONAL':
        return 'primary';
      case 'FAMILY':
        return 'success';
      case 'COMPANY':
        return 'warning';
      case 'SIMULATION':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header & Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.75rem',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 0.375rem 0',
              fontSize: '1.75rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              letterSpacing: '-0.02em',
            }}
          >
            Carteiras de Investimento
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: themeTokens.colors.textMuted }}>
            Gerencie suas carteiras e patrimônio estrutural
          </p>
        </div>

        <Button onClick={() => setIsModalOpen(true)}>+ Nova Carteira</Button>
      </div>

      {/* Loading State: Skeletons */}
      {isLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {[1, 2, 3].map((i) => (
            <Card key={i} style={{ minHeight: '160px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}
              >
                <Skeleton width="60%" height="1.25rem" />
                <Skeleton width="25%" height="1rem" />
              </div>
              <Skeleton width="40%" height="0.875rem" style={{ marginBottom: '1.5rem' }} />
              <Skeleton width="80%" height="0.75rem" />
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {!isLoading && isError && (
        <ErrorState
          title="Não foi possível carregar as carteiras"
          message={error?.message || 'Ocorreu um erro ao buscar suas carteiras.'}
          onRetry={() => refetch()}
        />
      )}

      {/* Empty State */}
      {!isLoading && !isError && (!portfolios || portfolios.length === 0) && (
        <EmptyState
          title="Nenhuma carteira encontrada"
          description="Você ainda não possui carteiras cadastradas. Crie sua primeira carteira para começar a estruturar seus investimentos."
          actionLabel="Criar Carteira"
          onAction={() => setIsModalOpen(true)}
          icon={<span style={{ fontSize: '2.5rem' }}>💼</span>}
        />
      )}

      {/* Success State: Portfolio Cards Grid */}
      {!isLoading && !isError && portfolios && portfolios.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {portfolios.map((portfolio) => (
            <Card key={portfolio.id}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '0.75rem',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    color: themeTokens.colors.text,
                  }}
                >
                  {portfolio.name}
                </h3>
                <Badge variant={getBadgeVariant(portfolio.type)}>
                  {PORTFOLIO_TYPE_LABELS[portfolio.type] || portfolio.type}
                </Badge>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.8125rem',
                  color: themeTokens.colors.textMuted,
                }}
              >
                <span>
                  Moeda:{' '}
                  <strong style={{ color: themeTokens.colors.text }}>
                    {portfolio.baseCurrency}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Status:{' '}
                  <strong
                    style={{
                      color:
                        portfolio.status === 'ACTIVE'
                          ? themeTokens.colors.success
                          : themeTokens.colors.textMuted,
                    }}
                  >
                    {portfolio.status === 'ACTIVE' ? 'Ativa' : 'Arquivada'}
                  </strong>
                </span>
              </div>

              <div
                style={{
                  paddingTop: '0.75rem',
                  borderTop: `1px solid ${themeTokens.colors.border}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.75rem',
                  color: themeTokens.colors.textMuted,
                }}
              >
                <span>Criada em {new Date(portfolio.createdAt).toLocaleDateString('pt-BR')}</span>
                <span style={{ color: themeTokens.colors.primary, fontWeight: 500 }}>
                  Estrutura pronta
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Portfolio Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Criar Nova Carteira">
        <form onSubmit={handleCreateSubmit}>
          {formError && (
            <div
              role="alert"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${themeTokens.colors.danger}`,
                color: themeTokens.colors.danger,
                padding: '0.75rem',
                borderRadius: `${themeTokens.borderRadius.md}px`,
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}
            >
              {formError}
            </div>
          )}

          <Input
            label="Nome da Carteira"
            placeholder="Ex: Carteira Principal, Reserva de Emergência"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={createMutation.isPending}
            required
          />

          <Select
            label="Tipo de Carteira"
            options={PORTFOLIO_TYPE_OPTIONS}
            value={type}
            onChange={(e) => setType(e.target.value as PortfolioType)}
            disabled={createMutation.isPending}
          />

          <Input
            label="Moeda Base"
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
            disabled={createMutation.isPending}
            maxLength={3}
            required
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              marginTop: '1.5rem',
            }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" isLoading={createMutation.isPending}>
              Salvar Carteira
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

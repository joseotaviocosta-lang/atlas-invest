'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  colors,
  spacing,
  borderRadius,
  buildPortfolioAccountsViewModel,
  PortfolioStateDto,
  resolveTemporalContext,
  getTodayCivilDateString,
  accountStateQueryKey,
  appendAsOf,
} from '@atlas/ui';
import { apiClient, ApiError } from '@/api/client';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Skeleton,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { useToast } from '@/components/ui';
import { Badge } from '@/components/ui/Badge';
import { PortfolioHistoricalBanner } from '@/components/portfolio';

interface PortfolioDto {
  id: string;
  name: string;
  type: string;
  baseCurrency: string;
  status: string;
}

interface AccountDto {
  id: string;
  portfolioId: string;
  institutionId: string;
  name: string;
  currency: string;
  status: string;
}

interface InstitutionDto {
  id: string;
  name: string;
}

function PortfolioAccountsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const portfolioIdParam = searchParams.get('portfolioId');

  // Temporal context (Fase 2F): the directory listing stays current, while
  // position counts derive from the historical snapshot when `asOf` is set.
  const today = React.useMemo(() => getTodayCivilDateString(), []);
  const temporal = React.useMemo(
    () => resolveTemporalContext({ rawAsOf: searchParams.get('asOf'), today }),
    [searchParams, today],
  );
  const isHistorical = temporal.mode === 'HISTORICAL';

  const clearAsOf = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('asOf');
    const qs = next.toString();
    router.replace(`/portfolio/accounts${qs ? `?${qs}` : ''}`);
  };

  const { data: portfolios = [], isLoading: isPortfoliosLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioDto[] }>('/api/v1/portfolios');
      return res.data;
    },
    staleTime: 60_000,
  });

  const activePortfolioId = portfolioIdParam || portfolios[0]?.id || '';
  const activePortfolio =
    portfolios.find((p) => p.id === activePortfolioId) || portfolios[0] || null;

  const {
    data: stateData,
    isLoading: isStateLoading,
    isError: isStateError,
    error: stateError,
    refetch: refetchState,
  } = useQuery({
    queryKey: accountStateQueryKey(activePortfolioId, 'overview', temporal.asOf),
    queryFn: async () => {
      if (!activePortfolioId) return null;
      const endpoint = temporal.asOf
        ? `/api/v1/portfolios/${activePortfolioId}/state?asOf=${temporal.asOf}`
        : `/api/v1/portfolios/${activePortfolioId}/state`;
      const res = await apiClient.get<{ data: PortfolioStateDto }>(endpoint);
      return res.data;
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 30_000,
  });

  const { data: accountsData = [] } = useQuery({
    queryKey: ['portfolio-accounts', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return [];
      const res = await apiClient.get<{ data: AccountDto[] }>(
        `/api/v1/portfolios/${activePortfolioId}/accounts`,
      );
      return res.data;
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 60_000,
  });

  const { data: institutionsData = [] } = useQuery({
    queryKey: ['institutions'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: InstitutionDto[] }>('/api/v1/institutions');
        return res.data;
      } catch {
        return [];
      }
    },
    staleTime: 300_000,
  });

  const accountsViewModel = React.useMemo(() => {
    if (!stateData) return null;
    return buildPortfolioAccountsViewModel({
      portfolioId: activePortfolioId,
      portfolioName: activePortfolio?.name,
      state: stateData,
      accountsMeta: accountsData,
      institutionsMeta: institutionsData,
    });
  }, [stateData, activePortfolioId, activePortfolio?.name, accountsData, institutionsData]);

  const isLoading = isPortfoliosLoading || (isStateLoading && !stateData);

  // Create Account flow (H4): backend POST /api/v1/portfolios/:id/accounts
  // already exists and is ownership-scoped by the authenticated principal.
  // The page only wires the missing UI: empty-state CTA + modal form.
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [accountName, setAccountName] = React.useState('');
  const [institutionId, setInstitutionId] = React.useState('');
  const [currency, setCurrency] = React.useState('BRL');
  const [formError, setFormError] = React.useState<string | null>(null);

  const openCreateModal = () => {
    setFormError(null);
    if (!institutionId && institutionsData[0]) {
      setInstitutionId(institutionsData[0].id);
    }
    setIsModalOpen(true);
  };

  const createAccountMutation = useMutation({
    mutationFn: async (payload: { institutionId: string; name: string; currency: string }) => {
      const res = await apiClient.post<{ data: AccountDto }>(
        `/api/v1/portfolios/${activePortfolioId}/accounts`,
        payload,
      );
      return res.data;
    },
    onSuccess: (newAccount) => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-accounts', activePortfolioId] });
      queryClient.invalidateQueries({
        queryKey: accountStateQueryKey(activePortfolioId, 'overview', temporal.asOf),
      });
      setIsModalOpen(false);
      setAccountName('');
      setCurrency('BRL');
      setFormError(null);
      showToast(`Conta '${newAccount.name}' criada com sucesso!`, 'positive');
    },
    onError: (err: ApiError) => {
      setFormError(err.message || 'Falha ao criar conta. Verifique os dados.');
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!activePortfolioId) {
      setFormError('Selecione uma carteira antes de criar a conta.');
      return;
    }
    if (!accountName.trim()) {
      setFormError('Informe o nome da conta.');
      return;
    }
    if (!institutionId) {
      setFormError('Selecione a instituição da conta.');
      return;
    }

    createAccountMutation.mutate({
      institutionId,
      name: accountName.trim(),
      currency,
    });
  };

  if (isLoading) {
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        <Skeleton width="180px" height="24px" />
        <Card style={{ padding: `${spacing.base}px`, marginTop: `${spacing.base}px` }}>
          <Skeleton width="100%" height="80px" />
        </Card>
        <Card style={{ padding: `${spacing.base}px`, marginTop: `${spacing.base}px` }}>
          <Skeleton width="100%" height="60px" />
        </Card>
      </div>
    );
  }

  if (isStateError && !stateData) {
    const isOffline =
      stateError instanceof ApiError && (stateError.isOffline || stateError.code === 'OFFLINE');
    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: `${spacing.xl}px ${spacing.base}px`,
        }}
      >
        <Card style={{ padding: `${spacing.xxl}px` }}>
          <ErrorState
            title={isOffline ? 'Sem conexão' : 'Falha ao carregar contas'}
            message={
              isOffline
                ? 'Verifique sua conexão com a internet e tente novamente.'
                : 'Ocorreu um erro ao consultar as contas da carteira.'
            }
            onRetry={() => refetchState()}
          />
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{ maxWidth: '1000px', margin: '0 auto', padding: `${spacing.xl}px ${spacing.base}px` }}
    >
      {isHistorical && temporal.bannerLabel && (
        <PortfolioHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
      )}
      <nav aria-label="Breadcrumb" style={{ marginBottom: `${spacing.md}px` }}>
        <Link
          href={appendAsOf(
            `/portfolio${activePortfolioId ? `?portfolioId=${activePortfolioId}` : ''}`,
            temporal.asOf,
          )}
          style={{
            color: colors.accent,
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.875rem',
          }}
        >
          ← Carteira
        </Link>
      </nav>

      <div
        style={{
          marginBottom: `${spacing.lg}px`,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: `${spacing.md}px`,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: colors.textPrimary,
              margin: '0 0 4px 0',
              letterSpacing: '-0.02em',
            }}
          >
            Contas
          </h1>
          <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
            Contas de custódia de{' '}
            <strong style={{ color: colors.textPrimary }}>{activePortfolio?.name}</strong>
          </p>
        </div>
        <Button onClick={openCreateModal} disabled={!activePortfolioId}>
          + Nova conta
        </Button>
      </div>

      {!accountsViewModel || accountsViewModel.isEmpty ? (
        <Card style={{ padding: `${spacing.xxl}px` }}>
          <EmptyState
            title="Nenhuma conta cadastrada"
            description="Cadastre uma conta em uma corretora ou instituição para começar a organizar a custódia dos seus ativos."
            actionLabel="Adicionar conta"
            onAction={openCreateModal}
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          {accountsViewModel.accounts.map((account) => (
            <Card
              key={account.accountId}
              style={{
                padding: `${spacing.base}px`,
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.lg}px`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: `${spacing.sm}px`,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: colors.textPrimary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={account.accountName}
                  >
                    {account.accountName}
                  </div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={account.institutionName ?? undefined}
                  >
                    {account.institutionName ?? 'Instituição não informada'}
                    {account.currency ? ` • ${account.currency}` : ''}
                    {account.statusLabel ? ` • ${account.statusLabel}` : ''}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: colors.textMuted, marginTop: '6px' }}>
                    {account.isEmpty
                      ? 'Nenhuma posição aberta'
                      : `${account.openPositionsCount} ${account.openPositionsCount === 1 ? 'posição aberta' : 'posições abertas'}`}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '6px',
                    flexShrink: 0,
                  }}
                >
                  {account.hasIncompleteCost && <Badge variant="warning">Custo incompleto</Badge>}
                  <Link
                    href={appendAsOf(
                      `/portfolio/accounts/${account.accountId}${activePortfolioId ? `?portfolioId=${activePortfolioId}` : ''}`,
                      temporal.asOf,
                    )}
                    style={{
                      color: colors.accent,
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                    aria-label={`Ver detalhes da conta ${account.accountName}`}
                  >
                    Ver detalhes →
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Account Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Adicionar Conta">
        <form onSubmit={handleCreateSubmit}>
          {formError && (
            <div
              role="alert"
              style={{
                backgroundColor: colors.negativeSubtle,
                border: `1px solid ${colors.negative}`,
                color: colors.negative,
                padding: `${spacing.md}px`,
                borderRadius: `${borderRadius.md}px`,
                fontSize: '0.875rem',
                marginBottom: `${spacing.base}px`,
              }}
            >
              {formError}
            </div>
          )}

          <Input
            label="Nome da Conta"
            placeholder="Ex: Conta XP Principal"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            disabled={createAccountMutation.isPending}
            required
          />

          <Select
            label="Instituição"
            options={institutionsData.map((institution) => ({
              value: institution.id,
              label: institution.name,
            }))}
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            disabled={createAccountMutation.isPending || institutionsData.length === 0}
          />

          <Select
            label="Moeda"
            options={[
              { value: 'BRL', label: 'BRL — Real brasileiro' },
              { value: 'USD', label: 'USD — Dólar americano' },
              { value: 'EUR', label: 'EUR — Euro' },
            ]}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={createAccountMutation.isPending}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: `${spacing.sm}px`,
              marginTop: `${spacing.xl}px`,
            }}
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={createAccountMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={createAccountMutation.isPending}>
              Salvar Conta
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function PortfolioAccountsPage() {
  return (
    <React.Suspense
      fallback={
        <div
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding: `${spacing.xl}px ${spacing.base}px`,
          }}
        >
          <Skeleton width="180px" height="24px" />
        </div>
      }
    >
      <PortfolioAccountsContent />
    </React.Suspense>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  PageHeader,
  SectionHeader,
  Tabs,
  PortfolioSwitcher,
  useToast,
} from '@/components/ui';
import { colors, spacing, borderRadius, formatCurrency, formatQuantity } from '@atlas/ui';
import {
  mapToPortfolioOverviewViewModel,
  PortfolioStateDto,
  resolveTemporalContext,
  getTodayCivilDateString,
  stateQueryKey,
  appendAsOf,
} from '@atlas/ui';
import {
  PortfolioCompletenessBanner,
  PortfolioSummaryCards,
  PositionRow,
  PortfolioDateSelector,
  PortfolioHistoricalBanner,
  PortfolioValuationSection,
  valuationQueryKey,
} from '@/components/portfolio';
import {
  OPERATION_TYPE_OPTIONS,
  OPERATION_TYPE_LABELS,
  OPERATION_CURRENCY_OPTIONS,
  ManualOperationType,
  normalizeDecimalInput,
  isPositiveDecimalString,
  isNonNegativeDecimalString,
  CIVIL_DATE_RE,
  moneyAmountOf,
} from '@/lib/operation-entry';

const PORTFOLIO_TYPE_LABELS: Record<PortfolioType, string> = {
  PERSONAL: 'Pessoal',
  FAMILY: 'Família',
  COMPANY: 'Empresa',
  SIMULATION: 'Simulação',
};

const PORTFOLIO_TYPE_OPTIONS = [
  { value: 'PERSONAL', label: 'Pessoal (Investimentos próprios)' },
  { value: 'FAMILY', label: 'Família (Gestão conjunta)' },
  { value: 'COMPANY', label: 'Empresa (Pessoa Jurídica)' },
  { value: 'SIMULATION', label: 'Simulação (Estratégias/Testes)' },
];

const CARTEIRA_TABS = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'assets', label: 'Ativos' },
  { id: 'returns', label: 'Rentabilidade' },
  { id: 'dividends', label: 'Proventos' },
  { id: 'allocation', label: 'Alocação' },
  { id: 'operations', label: 'Operações' },
];

interface LedgerTransactionDto {
  id: string;
  type: string;
  tradeDate: string;
  currency: string;
  accountId: string;
  assetId?: string;
  quantity?: string;
  unitPrice?: string | { amount: string; currency: string };
  fees?: string | { amount: string; currency: string };
  notes?: string;
}

interface CatalogAssetDto {
  id: string;
  ticker: string;
  name: string;
}

function PortfolioPageContent() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Temporal context (Fase 2F): `asOf` comes exclusively from the URL as a
  // civil `YYYY-MM-DD` string. The server replay produces the snapshot.
  const today = useMemo(() => getTodayCivilDateString(), []);
  const temporal = useMemo(
    () => resolveTemporalContext({ rawAsOf: searchParams.get('asOf'), today }),
    [searchParams, today],
  );
  const isHistorical = temporal.mode === 'HISTORICAL';

  const navigateWithParams = (params: URLSearchParams) => {
    const qs = params.toString();
    router.replace(`/portfolio${qs ? `?${qs}` : ''}`);
  };

  const clearAsOf = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('asOf');
    navigateWithParams(params);
  };

  const handleSelectDate = (value: string | null) => {
    if (!value) {
      clearAsOf();
      return;
    }
    const next = resolveTemporalContext({ rawAsOf: value, today });
    if (next.mode === 'HISTORICAL' && next.asOf) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('asOf', next.asOf);
      navigateWithParams(params);
      return;
    }
    if (next.error) {
      // Surface invalid/future input through the URL so the error renders.
      const params = new URLSearchParams(searchParams.toString());
      params.set('asOf', value);
      navigateWithParams(params);
      return;
    }
    // Today normalization: no `asOf` param in current mode.
    clearAsOf();
  };

  const handleSelectPortfolio = (id: string) => {
    setSelectedPortfolioId(id);
    // Never carry a historical snapshot across portfolios (§39).
    if (searchParams.get('asOf')) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('asOf');
      navigateWithParams(params);
    }
  };

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PortfolioType>('PERSONAL');
  const [baseCurrency, setBaseCurrency] = useState('BRL');
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch Portfolios
  const {
    data: portfolios = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PortfolioDto[], ApiError>({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioDto[] }>('/api/v1/portfolios');
      return res.data || [];
    },
  });

  // Keep active portfolio selected
  const activePortfolio =
    portfolios.find((p) => p.id === selectedPortfolioId) || portfolios[0] || null;

  // Fetch Portfolio State (current or historical server replay via `asOf`)
  const {
    data: stateData,
    isLoading: isStateLoading,
    isError: isStateError,
    error: stateError,
    refetch: refetchState,
  } = useQuery<PortfolioStateDto | null, ApiError>({
    queryKey: stateQueryKey(activePortfolio?.id || '', temporal.asOf),
    queryFn: async () => {
      if (!activePortfolio?.id) return null;
      const endpoint = temporal.asOf
        ? `/api/v1/portfolios/${activePortfolio.id}/state?asOf=${temporal.asOf}`
        : `/api/v1/portfolios/${activePortfolio.id}/state`;
      const res = await apiClient.get<{ data: PortfolioStateDto }>(endpoint);
      return res.data;
    },
    enabled: Boolean(activePortfolio?.id),
    staleTime: 30000,
  });

  // Fetch Valuation (current only, hidden in historical mode)
  const { data: valuationData } = useQuery<
    {
      data: {
        positions: Array<{
          assetId: string;
          marketValue: { amount: string; currency: string } | null;
          unrealizedGainLoss: { amount: string; currency: string } | null;
          unrealizedGainLossPercent: string | null;
          status: string;
          quoteFreshness: string | null;
          quote: unknown | null;
        }>;
      };
    },
    ApiError
  >({
    queryKey: activePortfolio?.id
      ? valuationQueryKey(activePortfolio.id)
      : ['portfolio-valuation', 'none'],
    queryFn: async () => {
      if (!activePortfolio?.id) return { data: { positions: [] } } as never;
      return apiClient.get<{
        data: {
          positions: Array<{
            assetId: string;
            marketValue: { amount: string; currency: string } | null;
            unrealizedGainLoss: { amount: string; currency: string } | null;
            unrealizedGainLossPercent: string | null;
            status: string;
            quoteFreshness: string | null;
            quote: unknown | null;
          }>;
        };
      }>(`/api/v1/portfolios/${activePortfolio.id}/valuation`);
    },
    enabled: Boolean(activePortfolio?.id) && !isHistorical,
    staleTime: 30000,
  });

  const valuationMap = useMemo(() => {
    const m = new Map<
      string,
      {
        marketValue: { amount: string; currency: string } | null;
        unrealizedGainLoss: { amount: string; currency: string } | null;
        unrealizedGainLossPercent: string | null;
        status: string;
        quoteFreshness: string | null;
        quote: { price: string; currency: string; freshness: string; status: string } | null;
      }
    >();
    for (const p of (valuationData?.data?.positions as
      | Array<{
          assetId: string;
          marketValue: { amount: string; currency: string } | null;
          unrealizedGainLoss: { amount: string; currency: string } | null;
          unrealizedGainLossPercent: string | null;
          status: string;
          quoteFreshness: string | null;
          quote: { price: string; currency: string; freshness: string; status: string } | null;
        }>
      | undefined) ?? []) {
      m.set(p.assetId, p as never);
    }
    return m;
  }, [valuationData]);

  // Fetch Accounts for name resolution
  const { data: accountsData = [] } = useQuery<Array<{ id: string; name: string }>, ApiError>({
    queryKey: ['portfolio-accounts', activePortfolio?.id],
    queryFn: async () => {
      if (!activePortfolio?.id) return [];
      try {
        const res = await apiClient.get<{ data: Array<{ id: string; name: string }> }>(
          `/api/v1/portfolios/${activePortfolio.id}/accounts`,
        );
        return res.data || [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(activePortfolio?.id),
    staleTime: 60000,
  });

  // Pure presentation view model
  const overviewViewModel =
    stateData && activePortfolio
      ? mapToPortfolioOverviewViewModel(stateData, activePortfolio, accountsData)
      : null;

  // Create Portfolio Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; type: PortfolioType; baseCurrency: string }) => {
      const res = await apiClient.post<{ data: PortfolioDto }>('/api/v1/portfolios', payload);
      return res.data;
    },
    onSuccess: (newPortfolio) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      setIsModalOpen(false);
      setName('');
      setType('PERSONAL');
      setBaseCurrency('BRL');
      setFormError(null);
      setSelectedPortfolioId(newPortfolio.id);
      showToast(`Carteira '${newPortfolio.name}' criada com sucesso!`, 'positive');
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

  // Manual operation entry (H5 & C2): supports BUY, SELL, and income types
  // (DIVIDEND, JCP, FII_INCOME) with append-only ledger storage.
  const [isOpModalOpen, setIsOpModalOpen] = useState(false);
  const [opType, setOpType] = useState<ManualOperationType>('BUY');
  const [opAssetId, setOpAssetId] = useState('');
  const [opAccountId, setOpAccountId] = useState('');
  const [opQuantity, setOpQuantity] = useState('');
  const [opUnitPrice, setOpUnitPrice] = useState('');
  const [opAmount, setOpAmount] = useState('');
  const [opTradeDate, setOpTradeDate] = useState('');
  const [opFees, setOpFees] = useState('');
  const [opNotes, setOpNotes] = useState('');
  const [opCurrency, setOpCurrency] = useState('BRL');
  const [assetSearch, setAssetSearch] = useState('');
  const [opFormError, setOpFormError] = useState<string | null>(null);

  // Guided transaction correction modal state (C2)
  const [isCorrectModalOpen, setIsCorrectModalOpen] = useState(false);
  const [correctingTx, setCorrectingTx] = useState<LedgerTransactionDto | null>(null);
  const [corrReason, setCorrReason] = useState('');
  const [corrFormError, setCorrFormError] = useState<string | null>(null);

  const { data: transactionsData = [], isLoading: isTxLoading } = useQuery<
    LedgerTransactionDto[],
    ApiError
  >({
    queryKey: ['portfolio-transactions', activePortfolio?.id],
    queryFn: async () => {
      if (!activePortfolio?.id) return [];
      const res = await apiClient.get<{ data: LedgerTransactionDto[] }>(
        `/api/v1/portfolios/${activePortfolio.id}/transactions?limit=50`,
      );
      return res.data || [];
    },
    enabled: Boolean(activePortfolio?.id),
    staleTime: 30000,
  });

  const { data: assetsCatalog = [] } = useQuery<CatalogAssetDto[], ApiError>({
    queryKey: ['assets-catalog'],
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: CatalogAssetDto[] }>('/api/v1/assets');
        return res.data || [];
      } catch {
        return [];
      }
    },
    staleTime: 300000,
  });

  const assetLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const asset of assetsCatalog) {
      m.set(asset.id, `${asset.ticker} — ${asset.name}`);
    }
    return m;
  }, [assetsCatalog]);

  const accountNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const account of accountsData) {
      m.set(account.id, account.name);
    }
    return m;
  }, [accountsData]);

  const assetById = useMemo(() => {
    const m = new Map<string, { ticker: string; name: string }>();
    for (const asset of assetsCatalog) {
      m.set(asset.id, { ticker: asset.ticker, name: asset.name });
    }
    return m;
  }, [assetsCatalog]);

  const openOpModal = () => {
    setOpFormError(null);
    if (!opTradeDate) setOpTradeDate(today);
    if (activePortfolio?.baseCurrency) setOpCurrency(activePortfolio.baseCurrency);
    if (!opAccountId && accountsData[0]) setOpAccountId(accountsData[0].id);
    if (!opAssetId && assetsCatalog[0]) setOpAssetId(assetsCatalog[0].id);
    setIsOpModalOpen(true);
  };

  const createTxMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await apiClient.post<{ data: LedgerTransactionDto }>(
        `/api/v1/portfolios/${activePortfolio!.id}/transactions`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['portfolio-transactions', activePortfolio?.id],
      });
      if (activePortfolio?.id) {
        queryClient.invalidateQueries({
          queryKey: stateQueryKey(activePortfolio.id, temporal.asOf),
        });
      }
      setIsOpModalOpen(false);
      setOpQuantity('');
      setOpUnitPrice('');
      setOpFees('');
      setOpNotes('');
      setOpFormError(null);
      showToast('Operação registrada com sucesso!', 'positive');
    },
    onError: (err: ApiError) => {
      // Network-level failures surface as statusCode 0 with the raw fetch
      // message ("Failed to fetch"). Translate to an actionable message and
      // keep the form populated so the user can retry. API validation and
      // domain messages are shown as returned (no stack traces).
      if (err.statusCode === 0) {
        setOpFormError(
          'Não foi possível alcançar o servidor. Verifique sua conexão e tente novamente.',
        );
      } else {
        setOpFormError(err.message || 'Falha ao registrar operação. Verifique os dados.');
      }
    },
  });

  const isIncomeType = opType === 'DIVIDEND' || opType === 'JCP' || opType === 'FII_INCOME';

  const filteredAssets = useMemo(() => {
    if (!assetSearch.trim()) return assetsCatalog;
    const q = assetSearch.toLowerCase();
    return assetsCatalog.filter(
      (a) => a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    );
  }, [assetsCatalog, assetSearch]);

  const handleOpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOpFormError(null);

    if (!activePortfolio?.id) {
      setOpFormError('Selecione uma carteira antes de registrar a operação.');
      return;
    }
    if (!opAccountId) {
      setOpFormError('Selecione a conta da operação.');
      return;
    }
    if (!opAssetId) {
      setOpFormError('Selecione o ativo da operação.');
      return;
    }
    if (!CIVIL_DATE_RE.test(opTradeDate)) {
      setOpFormError('Informe a data da operação (AAAA-MM-DD).');
      return;
    }

    const payload: Record<string, string> = {
      accountId: opAccountId,
      type: opType,
      currency: opCurrency,
      tradeDate: opTradeDate,
      assetId: opAssetId,
      source: 'MANUAL',
    };

    if (isIncomeType) {
      const amount = normalizeDecimalInput(opAmount);
      if (!isPositiveDecimalString(amount)) {
        setOpFormError('Informe um valor de rendimento válido maior que zero (ex: 50.00).');
        return;
      }
      payload.amount = amount;
    } else {
      const quantity = normalizeDecimalInput(opQuantity);
      if (!isPositiveDecimalString(quantity)) {
        setOpFormError('Informe uma quantidade válida maior que zero (ex: 10).');
        return;
      }
      const unitPrice = normalizeDecimalInput(opUnitPrice);
      if (!isNonNegativeDecimalString(unitPrice)) {
        setOpFormError('Informe um preço unitário válido (ex: 30.00).');
        return;
      }
      const fees = normalizeDecimalInput(opFees);
      if (fees !== '' && !isNonNegativeDecimalString(fees)) {
        setOpFormError('Informe taxas válidas ou deixe em branco (ex: 4.90).');
        return;
      }
      payload.quantity = quantity;
      payload.unitPrice = unitPrice;
      if (fees !== '') payload.fees = fees;
    }

    const notes = opNotes.trim();
    if (notes !== '') payload.notes = notes;

    createTxMutation.mutate(payload);
  };

  const correctTxMutation = useMutation({
    mutationFn: async ({ reversalPayload }: { reversalPayload: Record<string, string> }) => {
      const res = await apiClient.post<{ data: LedgerTransactionDto }>(
        `/api/v1/portfolios/${activePortfolio!.id}/transactions`,
        reversalPayload,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['portfolio-transactions', activePortfolio?.id],
      });
      if (activePortfolio?.id) {
        queryClient.invalidateQueries({
          queryKey: stateQueryKey(activePortfolio.id, temporal.asOf),
        });
      }
      setIsCorrectModalOpen(false);
      setCorrectingTx(null);
      setCorrReason('');
      setCorrFormError(null);
      showToast('Lançamento compensatório registrado com sucesso no livro-razão!', 'positive');
    },
    onError: (err: ApiError) => {
      setCorrFormError(err.message || 'Falha ao registrar compensação no livro-razão.');
    },
  });

  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCorrFormError(null);

    if (!correctingTx || !activePortfolio?.id) return;

    // Build the compensating entry adhering to Section 11/12 (Append-Only Reversal)
    const reason = corrReason.trim();
    const reversalNotes = `[COMPENSAÇÃO ref ${correctingTx.id}]${reason ? ` ${reason}` : ''}`;

    let reversalPayload: Record<string, string>;

    if (correctingTx.type === 'BUY') {
      // Reversing a BUY requires a SELL with exact same asset, quantity, and unitPrice
      reversalPayload = {
        accountId: correctingTx.accountId,
        type: 'SELL',
        currency: correctingTx.currency,
        tradeDate: correctingTx.tradeDate,
        assetId: correctingTx.assetId!,
        quantity:
          typeof correctingTx.quantity === 'string'
            ? correctingTx.quantity
            : String(correctingTx.quantity),
        unitPrice: moneyAmountOf(correctingTx.unitPrice),
        notes: reversalNotes,
        source: 'MANUAL',
      };
    } else if (correctingTx.type === 'SELL') {
      // Reversing a SELL requires a BUY with exact same asset, quantity, and unitPrice
      reversalPayload = {
        accountId: correctingTx.accountId,
        type: 'BUY',
        currency: correctingTx.currency,
        tradeDate: correctingTx.tradeDate,
        assetId: correctingTx.assetId!,
        quantity:
          typeof correctingTx.quantity === 'string'
            ? correctingTx.quantity
            : String(correctingTx.quantity),
        unitPrice: moneyAmountOf(correctingTx.unitPrice),
        notes: reversalNotes,
        source: 'MANUAL',
      };
    } else {
      setCorrFormError(`Compensação automática não suportada para o tipo ${correctingTx.type}.`);
      return;
    }

    correctTxMutation.mutate({ reversalPayload });
  };

  const getBadgeVariant = (
    portType: PortfolioType,
  ): 'primary' | 'positive' | 'warning' | 'default' => {
    switch (portType) {
      case 'PERSONAL':
        return 'primary';
      case 'FAMILY':
        return 'positive';
      case 'COMPANY':
        return 'warning';
      case 'SIMULATION':
      default:
        return 'default';
    }
  };

  return (
    <div>
      {/* Header with Title and Portfolio Switcher */}
      <PageHeader
        title="Carteira"
        subtitle="Gerencie suas carteiras e acompanhe seus investimentos estruturados"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            {portfolios.length > 0 && (
              <PortfolioSwitcher
                portfolios={portfolios}
                selectedPortfolioId={activePortfolio?.id || null}
                onSelectPortfolio={handleSelectPortfolio}
                onCreatePortfolio={() => setIsModalOpen(true)}
              />
            )}
            <Button onClick={() => setIsModalOpen(true)}>+ Nova Carteira</Button>
          </div>
        }
      />

      {/* Loading Skeletons */}
      {isLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: `${spacing.base}px`,
          }}
        >
          {[1, 2, 3].map((i) => (
            <Card key={i} style={{ minHeight: '160px' }}>
              <Skeleton width="60%" height="1.25rem" style={{ marginBottom: '1rem' }} />
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

      {/* Global Empty State */}
      {!isLoading && !isError && portfolios.length === 0 && (
        <EmptyState
          title="Nenhuma carteira encontrada"
          description="Você ainda não possui carteiras cadastradas. Crie sua primeira carteira para começar a estruturar seus investimentos."
          actionLabel="Criar Primeira Carteira"
          onAction={() => setIsModalOpen(true)}
        />
      )}

      {/* Active Tabs Navigation & Content */}
      {!isLoading && !isError && portfolios.length > 0 && (
        <div>
          <Tabs tabs={CARTEIRA_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

          {/* TAB 1: VISÃO GERAL */}
          {activeTab === 'overview' && (
            <div>
              {/* Historical mode banner (persistent while asOf is active) */}
              {isHistorical && temporal.bannerLabel && (
                <PortfolioHistoricalBanner label={temporal.bannerLabel} onBackToToday={clearAsOf} />
              )}

              {/* Portfolio date selector */}
              {activePortfolio && (
                <Card style={{ marginBottom: `${spacing.base}px`, padding: `${spacing.base}px` }}>
                  <PortfolioDateSelector
                    value={temporal.asOf}
                    today={today}
                    error={temporal.errorMessage}
                    onChange={handleSelectDate}
                  />
                </Card>
              )}

              {/* ACTIVE PORTFOLIO OVERVIEW */}
              {activePortfolio && (
                <div>
                  {/* Loading State for Portfolio Replay */}
                  {isStateLoading && (
                    <div style={{ marginBottom: `${spacing.xl}px` }}>
                      <Card
                        style={{ marginBottom: `${spacing.base}px`, padding: `${spacing.base}px` }}
                      >
                        <Skeleton width="40%" height="1.5rem" style={{ marginBottom: '1rem' }} />
                        <Skeleton width="20%" height="1rem" />
                      </Card>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                          gap: `${spacing.base}px`,
                          marginBottom: `${spacing.xl}px`,
                        }}
                      >
                        {[1, 2, 3, 4].map((i) => (
                          <Card key={i} style={{ minHeight: '110px' }}>
                            <Skeleton
                              width="50%"
                              height="0.875rem"
                              style={{ marginBottom: '0.75rem' }}
                            />
                            <Skeleton width="75%" height="1.5rem" />
                          </Card>
                        ))}
                      </div>
                      <Skeleton width="30%" height="1.25rem" style={{ marginBottom: '1rem' }} />
                      {[1, 2].map((i) => (
                        <Card
                          key={i}
                          style={{ minHeight: '70px', marginBottom: `${spacing.sm}px` }}
                        >
                          <Skeleton width="90%" height="1.25rem" />
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Replay Error State */}
                  {!isStateLoading && isStateError && (
                    <div style={{ marginBottom: `${spacing.xl}px` }}>
                      {stateError?.statusCode === 422 ||
                      stateError?.code === 'PORTFOLIO.REPLAY_FAILED' ? (
                        <ErrorState
                          title={
                            isHistorical
                              ? 'Não foi possível reconstruir a carteira nesta data'
                              : 'Inconsistência na Reconstituição da Carteira'
                          }
                          message={
                            isHistorical
                              ? 'O servidor não conseguiu reconstruir o estado histórico. Tente outra data ou volte para hoje.'
                              : 'Não foi possível reconstruir os dados desta carteira. Tente novamente ou revise o histórico de movimentações.'
                          }
                          onRetry={() => refetchState()}
                        />
                      ) : (
                        <ErrorState
                          title="Não foi possível carregar os dados da carteira"
                          message={
                            stateError?.message ||
                            'Ocorreu um erro ao buscar o estado atual da carteira.'
                          }
                          onRetry={() => refetchState()}
                        />
                      )}
                    </div>
                  )}

                  {/* Populated Overview */}
                  {!isStateLoading && !isStateError && overviewViewModel && (
                    <div style={{ marginBottom: `${spacing.xl}px` }}>
                      {/* Portfolio Header Card */}
                      <Card
                        style={{ marginBottom: `${spacing.base}px`, padding: `${spacing.base}px` }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: `${spacing.sm}px`,
                            marginBottom: `${spacing.md}px`,
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: colors.textSecondary,
                                textTransform: 'uppercase',
                              }}
                            >
                              Carteira Ativa
                            </span>
                            <h2
                              style={{
                                margin: '2px 0 0 0',
                                fontSize: '1.25rem',
                                fontWeight: 700,
                                color: colors.textPrimary,
                              }}
                            >
                              {overviewViewModel.header.name}
                            </h2>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Badge variant={getBadgeVariant(activePortfolio.type)}>
                              {overviewViewModel.header.typeLabel}
                            </Badge>
                            <Link
                              href={appendAsOf(
                                `/portfolio/accounts?portfolioId=${activePortfolio.id}`,
                                temporal.asOf,
                              )}
                              style={{ textDecoration: 'none' }}
                            >
                              <Button variant="secondary" size="sm">
                                Contas
                              </Button>
                            </Link>
                            <Link
                              href={appendAsOf(
                                `/portfolio/history?portfolioId=${activePortfolio.id}`,
                                temporal.asOf,
                              )}
                              style={{ textDecoration: 'none' }}
                            >
                              <Button variant="secondary" size="sm">
                                Histórico
                              </Button>
                            </Link>
                            <Link
                              href={`/portfolio/performance?portfolioId=${activePortfolio.id}`}
                              style={{ textDecoration: 'none' }}
                            >
                              <Button variant="secondary" size="sm">
                                Ver performance
                              </Button>
                            </Link>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            gap: `${spacing.xl}px`,
                            fontSize: '0.8125rem',
                            color: colors.textSecondary,
                            paddingTop: `${spacing.sm}px`,
                            borderTop: `1px solid ${colors.border}`,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>
                            Moeda base:{' '}
                            <strong style={{ color: colors.textPrimary }}>
                              {overviewViewModel.header.baseCurrency}
                            </strong>
                          </span>
                          <span>
                            Status:{' '}
                            <strong
                              style={{
                                color:
                                  activePortfolio.status === 'ACTIVE'
                                    ? colors.positive
                                    : colors.textMuted,
                              }}
                            >
                              {activePortfolio.status === 'ACTIVE' ? 'Ativa' : 'Arquivada'}
                            </strong>
                          </span>
                          <span>
                            Posições abertas:{' '}
                            <strong style={{ color: colors.textPrimary }}>
                              {overviewViewModel.header.openPositionsCount}
                            </strong>
                          </span>
                          <span>
                            Contas ativas:{' '}
                            <strong style={{ color: colors.textPrimary }}>
                              {overviewViewModel.header.accountsCount}
                            </strong>
                          </span>
                        </div>
                      </Card>

                      {/* Completeness Warning Banner */}
                      {overviewViewModel.completenessNotice.hasIncompletePositions && (
                        <PortfolioCompletenessBanner
                          message={overviewViewModel.completenessNotice.message}
                        />
                      )}

                      {/* Summary Cards */}
                      <PortfolioSummaryCards
                        openPositionsCount={overviewViewModel.summaryCards.openPositionsCount}
                        realizedResult={overviewViewModel.summaryCards.realizedResult}
                        incomeReceived={overviewViewModel.summaryCards.incomeReceived}
                      />

                      {/* Current Valuation (hidden in historical mode) */}
                      <div style={{ marginBottom: `${spacing.xl}px` }}>
                        <PortfolioValuationSection
                          portfolioId={activePortfolio.id}
                          isHistorical={isHistorical}
                        />
                      </div>

                      {/* Positions Section */}
                      {isHistorical && overviewViewModel.positions.length === 0 ? (
                        <Card
                          style={{ padding: `${spacing.xl}px`, marginBottom: `${spacing.xl}px` }}
                        >
                          <EmptyState
                            title="Nenhuma posição nesta data"
                            description={`A carteira ainda não possuía posições em ${temporal.displayDate}.`}
                          />
                        </Card>
                      ) : overviewViewModel.stateIndicators.isEmptyPortfolio ? (
                        <Card
                          style={{ padding: `${spacing.xl}px`, marginBottom: `${spacing.xl}px` }}
                        >
                          <EmptyState
                            title="Sua carteira ainda está vazia"
                            description="Adicione movimentações para começar a acompanhar seus ativos e rendimentos."
                          />
                        </Card>
                      ) : overviewViewModel.stateIndicators.hasCashFlowsOnly ? (
                        <Card
                          style={{
                            padding: `${spacing.xl}px`,
                            textAlign: 'center',
                            marginBottom: `${spacing.xl}px`,
                          }}
                        >
                          <h3
                            style={{
                              margin: '0 0 8px 0',
                              fontSize: '1rem',
                              color: colors.textPrimary,
                            }}
                          >
                            Nenhuma posição de ativo aberta
                          </h3>
                          <p
                            style={{ margin: 0, fontSize: '0.875rem', color: colors.textSecondary }}
                          >
                            Esta carteira possui movimentações financeiras registradas, mas nenhuma
                            posição de ativo aberta no momento.
                          </p>
                        </Card>
                      ) : (
                        <div style={{ marginBottom: `${spacing.xl}px` }}>
                          <SectionHeader
                            title={isHistorical ? `Posições ${temporal.headerSuffix}` : 'Posições'}
                            description={
                              isHistorical && temporal.displayDate
                                ? `Ativos em custódia em ${temporal.displayDate} com custo carregado e preço médio`
                                : 'Ativos atualmente em custódia com custo carregado e preço médio'
                            }
                          />
                          <div>
                            {overviewViewModel.positions.map((position) => (
                              <PositionRow
                                key={position.assetId}
                                position={position}
                                portfolioId={activePortfolio?.id}
                                asOf={temporal.asOf}
                                valuation={valuationMap.get(position.assetId) ?? null}
                                isHistorical={isHistorical}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <SectionHeader
                title="Todas as Carteiras"
                description="Selecione ou gerencie suas carteiras cadastradas"
              />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: `${spacing.base}px`,
                }}
              >
                {portfolios.map((portfolio) => {
                  const isCurrent = portfolio.id === activePortfolio?.id;
                  return (
                    <Card
                      key={portfolio.id}
                      style={{
                        borderColor: isCurrent ? colors.accent : colors.border,
                        backgroundColor: isCurrent ? colors.surfaceElevated : colors.surface,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: `${spacing.sm}px`,
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontSize: '1rem',
                            fontWeight: 600,
                            color: colors.textPrimary,
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
                          gap: `${spacing.sm}px`,
                          marginBottom: `${spacing.md}px`,
                          fontSize: '0.8125rem',
                          color: colors.textSecondary,
                        }}
                      >
                        <span>Moeda: {portfolio.baseCurrency}</span>
                        <span>•</span>
                        <span>{portfolio.status === 'ACTIVE' ? 'Ativa' : 'Arquivada'}</span>
                      </div>

                      <div
                        style={{
                          paddingTop: `${spacing.sm}px`,
                          borderTop: `1px solid ${colors.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                          {isCurrent ? 'Selecionada' : 'Disponível'}
                        </span>
                        {!isCurrent && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSelectPortfolio(portfolio.id)}
                          >
                            Selecionar
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: ATIVOS — engine-derived open positions (no client math) */}
          {activeTab === 'assets' &&
            (isStateLoading && !stateData ? (
              <Card style={{ padding: `${spacing.base}px` }}>
                <Skeleton width="100%" height="80px" />
              </Card>
            ) : isStateError && !stateData ? (
              <Card style={{ padding: `${spacing.xl}px` }}>
                <ErrorState
                  title="Falha ao carregar posições"
                  message="Ocorreu um erro ao consultar as posições da carteira."
                  onRetry={() => refetchState()}
                />
              </Card>
            ) : !stateData || stateData.positions.length === 0 ? (
              <Card style={{ padding: `${spacing.xl}px` }}>
                <EmptyState
                  title="Nenhuma posição aberta"
                  description="As posições derivadas das suas operações aparecerão aqui assim que a primeira compra for registrada."
                />
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
                {stateData.positions.map((position) => {
                  const asset = assetById.get(position.assetId);
                  const currency = position.currency ?? position.totalCost?.currency ?? 'BRL';
                  const isIncomplete = position.costBasisStatus === 'INCOMPLETE';
                  return (
                    <Card
                      key={position.assetId}
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
                            title={asset ? `${asset.ticker} — ${asset.name}` : undefined}
                          >
                            {asset ? `${asset.ticker} — ${asset.name}` : 'Ativo'}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: colors.textSecondary,
                              marginTop: '2px',
                            }}
                          >
                            Qtd {formatQuantity(position.quantity)} • Preço médio{' '}
                            {isIncomplete || !position.averageCost
                              ? '—'
                              : formatCurrency(
                                  position.averageCost.amount,
                                  position.averageCost.currency,
                                )}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: colors.textSecondary,
                              marginTop: '2px',
                            }}
                          >
                            Custo total{' '}
                            {isIncomplete || !position.totalCost
                              ? '—'
                              : formatCurrency(
                                  position.totalCost.amount,
                                  position.totalCost.currency,
                                )}{' '}
                            • {currency} • Sem cotação
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
                          {isIncomplete && <Badge variant="warning">Custo incompleto</Badge>}
                          <Link
                            href={appendAsOf(
                              `/portfolio/assets/${position.assetId}${activePortfolio ? `?portfolioId=${activePortfolio.id}` : ''}`,
                              temporal.asOf,
                            )}
                            style={{
                              color: colors.accent,
                              textDecoration: 'none',
                              fontWeight: 600,
                              fontSize: '0.875rem',
                            }}
                            aria-label={`Ver detalhes do ativo ${asset?.ticker ?? ''}`}
                          >
                            Ver detalhe →
                          </Link>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ))}

          {/* TAB 3: RENTABILIDADE (Wired to Performance Engine view) */}
          {activeTab === 'returns' && (
            <Card style={{ padding: `${spacing.xl}px`, textAlign: 'center' }}>
              <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h3
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    color: colors.textPrimary,
                    margin: '0 0 8px 0',
                  }}
                >
                  Análise Completa de Rentabilidade
                </h3>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: colors.textSecondary,
                    lineHeight: '1.5',
                    marginBottom: `${spacing.lg}px`,
                  }}
                >
                  Acesse o painel dedicado com cálculo de TWR, séries temporais, métricas de risco,
                  análise de cauda e comparação com benchmarks (CDI e Ibovespa).
                </p>
                <Link
                  href={`/portfolio/performance${activePortfolio ? `?portfolioId=${activePortfolio.id}` : ''}`}
                >
                  <Button>Acessar Painel de Rentabilidade →</Button>
                </Link>
              </div>
            </Card>
          )}

          {/* TAB 4: PROVENTOS (Wired to Income view) */}
          {activeTab === 'dividends' && (
            <Card style={{ padding: `${spacing.xl}px`, textAlign: 'center' }}>
              <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h3
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    color: colors.textPrimary,
                    margin: '0 0 8px 0',
                  }}
                >
                  Gestão e Histórico de Proventos
                </h3>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: colors.textSecondary,
                    lineHeight: '1.5',
                    marginBottom: `${spacing.lg}px`,
                  }}
                >
                  Visualize o consolidado de proventos recebidos (Dividendos, JCP, Rendimentos de
                  FII) por ativo e período, integrados ao livro-razão e ao relatório anual DIRPF.
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: `${spacing.md}px`,
                    flexWrap: 'wrap',
                  }}
                >
                  <Link
                    href={`/portfolio/income${activePortfolio ? `?portfolioId=${activePortfolio.id}` : ''}`}
                  >
                    <Button>Acessar Painel de Proventos →</Button>
                  </Link>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setOpType('DIVIDEND');
                      openOpModal();
                    }}
                  >
                    + Lançar Provento
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 5: ALOCAÇÃO */}
          {activeTab === 'allocation' && (
            <Card style={{ padding: `${spacing.xl}px` }}>
              <EmptyState
                title="Alocação por Valor de Mercado"
                description="Os gráficos de alocação patrimonial e rebalanceamento estarão disponíveis após a ativação do módulo de cotações de mercado (Market Data)."
              />
            </Card>
          )}

          {/* TAB 6: OPERAÇÕES */}
          {activeTab === 'operations' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: `${spacing.md}px`,
                  flexWrap: 'wrap',
                  marginBottom: `${spacing.base}px`,
                }}
              >
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  Livro-razão imutável de operações de{' '}
                  <strong style={{ color: colors.textPrimary }}>
                    {activePortfolio?.name ?? '—'}
                  </strong>
                </div>
                <Button onClick={openOpModal} disabled={!activePortfolio}>
                  + Nova operação
                </Button>
              </div>

              {isTxLoading ? (
                <Card style={{ padding: `${spacing.base}px` }}>
                  <Skeleton width="100%" height="60px" />
                </Card>
              ) : transactionsData.length === 0 ? (
                <Card style={{ padding: `${spacing.xl}px` }}>
                  <EmptyState
                    title="Livro-Razão de Operações"
                    description="O extrato cronológico e imutável de transações conectadas a esta carteira será exibido aqui."
                    actionLabel="Adicionar operação"
                    onAction={openOpModal}
                  />
                </Card>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
                  {transactionsData.map((tx) => (
                    <Card
                      key={tx.id}
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
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: `${spacing.sm}px`,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 700,
                              color: colors.textPrimary,
                            }}
                          >
                            {OPERATION_TYPE_LABELS[tx.type] ?? tx.type} •{' '}
                            {assetLabelById.get(tx.assetId ?? '') ?? 'Ativo'}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: colors.textSecondary,
                              marginTop: '2px',
                            }}
                          >
                            {tx.tradeDate}
                            {tx.quantity ? ` • Qtd ${tx.quantity}` : ''}
                            {tx.unitPrice !== undefined
                              ? ` • ${moneyAmountOf(tx.unitPrice)} ${tx.currency}`
                              : ''}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: colors.textMuted,
                              marginTop: '2px',
                            }}
                          >
                            {accountNameById.get(tx.accountId) ?? 'Conta'}
                          </div>
                        </div>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}
                        >
                          <Badge variant={tx.type === 'SELL' ? 'warning' : 'primary'}>
                            {OPERATION_TYPE_LABELS[tx.type] ?? tx.type}
                          </Badge>
                          {(tx.type === 'BUY' || tx.type === 'SELL') && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setCorrectingTx(tx);
                                setCorrReason('');
                                setCorrFormError(null);
                                setIsCorrectModalOpen(true);
                              }}
                            >
                              Corrigir
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                  <Link
                    href={`/portfolio/history${activePortfolio ? `?portfolioId=${activePortfolio.id}` : ''}`}
                    style={{
                      color: colors.accent,
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      alignSelf: 'flex-end',
                    }}
                  >
                    Ver histórico completo →
                  </Link>
                </div>
              )}

              {/* Create Operation Modal */}
              <Modal
                isOpen={isOpModalOpen}
                onClose={() => setIsOpModalOpen(false)}
                title="Adicionar Operação"
              >
                <form onSubmit={handleOpSubmit}>
                  {opFormError && (
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
                      {opFormError}
                    </div>
                  )}

                  <Select
                    label="Tipo de Operação"
                    options={OPERATION_TYPE_OPTIONS}
                    value={opType}
                    onChange={(e) => setOpType(e.target.value as ManualOperationType)}
                    disabled={createTxMutation.isPending}
                  />

                  {/* Asset Search & Select */}
                  <div style={{ marginBottom: `${spacing.sm}px` }}>
                    <Input
                      label="Buscar Ativo"
                      placeholder="Filtrar por código ou nome (ex: PETR4, Vale)"
                      value={assetSearch}
                      onChange={(e) => setAssetSearch(e.target.value)}
                      disabled={createTxMutation.isPending}
                    />
                    <Select
                      label="Ativo Selecionado"
                      options={filteredAssets.map((asset) => ({
                        value: asset.id,
                        label: `${asset.ticker} — ${asset.name}`,
                      }))}
                      value={opAssetId}
                      onChange={(e) => setOpAssetId(e.target.value)}
                      disabled={createTxMutation.isPending || filteredAssets.length === 0}
                    />
                  </div>

                  <Select
                    label="Conta"
                    options={accountsData.map((account) => ({
                      value: account.id,
                      label: account.name,
                    }))}
                    value={opAccountId}
                    onChange={(e) => setOpAccountId(e.target.value)}
                    disabled={createTxMutation.isPending || accountsData.length === 0}
                  />

                  {isIncomeType ? (
                    <Input
                      label="Valor do Rendimento (Líquido / Creditado)"
                      placeholder="Ex: 50.00"
                      value={opAmount}
                      onChange={(e) => setOpAmount(e.target.value)}
                      disabled={createTxMutation.isPending}
                      required
                      inputMode="decimal"
                    />
                  ) : (
                    <>
                      <Input
                        label="Quantidade"
                        placeholder="Ex: 10"
                        value={opQuantity}
                        onChange={(e) => setOpQuantity(e.target.value)}
                        disabled={createTxMutation.isPending}
                        required
                        inputMode="decimal"
                      />

                      <Input
                        label="Preço Unitário"
                        placeholder="Ex: 30.00"
                        value={opUnitPrice}
                        onChange={(e) => setOpUnitPrice(e.target.value)}
                        disabled={createTxMutation.isPending}
                        required
                        inputMode="decimal"
                      />
                    </>
                  )}

                  <Input
                    label="Data da Operação"
                    type="date"
                    value={opTradeDate}
                    onChange={(e) => setOpTradeDate(e.target.value)}
                    disabled={createTxMutation.isPending}
                    required
                  />

                  <Select
                    label="Moeda"
                    options={OPERATION_CURRENCY_OPTIONS}
                    value={opCurrency}
                    onChange={(e) => setOpCurrency(e.target.value)}
                    disabled={createTxMutation.isPending}
                  />

                  {!isIncomeType && (
                    <Input
                      label="Taxas (opcional)"
                      placeholder="Ex: 4.90"
                      value={opFees}
                      onChange={(e) => setOpFees(e.target.value)}
                      disabled={createTxMutation.isPending}
                      inputMode="decimal"
                    />
                  )}

                  <Input
                    label="Observações (opcional)"
                    placeholder="Ex: Operação manual ou referência externa"
                    value={opNotes}
                    onChange={(e) => setOpNotes(e.target.value)}
                    disabled={createTxMutation.isPending}
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
                      onClick={() => setIsOpModalOpen(false)}
                      disabled={createTxMutation.isPending}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" isLoading={createTxMutation.isPending}>
                      Salvar Operação
                    </Button>
                  </div>
                </form>
              </Modal>

              {/* Guided Transaction Correction Modal (C2 / Append-Only) */}
              <Modal
                isOpen={isCorrectModalOpen}
                onClose={() => {
                  setIsCorrectModalOpen(false);
                  setCorrectingTx(null);
                }}
                title="Corrigir Operação no Livro-Razão"
              >
                <form onSubmit={handleCorrectionSubmit}>
                  {corrFormError && (
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
                      {corrFormError}
                    </div>
                  )}

                  <div
                    style={{
                      padding: `${spacing.md}px`,
                      backgroundColor: colors.surfaceElevated,
                      borderRadius: `${borderRadius.md}px`,
                      border: `1px solid ${colors.border}`,
                      fontSize: '0.875rem',
                      lineHeight: '1.4',
                      color: colors.textSecondary,
                      marginBottom: `${spacing.base}px`,
                    }}
                  >
                    <strong style={{ color: colors.textPrimary }}>
                      Princípio de Imutabilidade:
                    </strong>
                    <br />O registro original nunca é alterado ou excluído. O Atlas registrará um{' '}
                    <strong>lançamento compensatório (reversão)</strong> no livro-razão para anular
                    o impacto desta operação em custódia e fiscal. Você poderá em seguida registrar
                    a operação correta.
                  </div>

                  {correctingTx && (
                    <div
                      style={{
                        padding: `${spacing.base}px`,
                        backgroundColor: colors.surface,
                        borderRadius: `${borderRadius.md}px`,
                        border: `1px solid ${colors.border}`,
                        marginBottom: `${spacing.base}px`,
                        fontSize: '0.875rem',
                      }}
                    >
                      <div>
                        Operação:{' '}
                        <strong>
                          {OPERATION_TYPE_LABELS[correctingTx.type] ?? correctingTx.type} •{' '}
                          {assetLabelById.get(correctingTx.assetId ?? '') ?? 'Ativo'}
                        </strong>
                      </div>
                      <div style={{ color: colors.textSecondary, marginTop: '4px' }}>
                        Data: {correctingTx.tradeDate} • Quantidade: {correctingTx.quantity} •
                        Preço: {moneyAmountOf(correctingTx.unitPrice)} {correctingTx.currency}
                      </div>
                    </div>
                  )}

                  <Input
                    label="Motivo da Correção (opcional)"
                    placeholder="Ex: Quantidade informada incorretamente"
                    value={corrReason}
                    onChange={(e) => setCorrReason(e.target.value)}
                    disabled={correctTxMutation.isPending}
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
                      onClick={() => {
                        setIsCorrectModalOpen(false);
                        setCorrectingTx(null);
                      }}
                      disabled={correctTxMutation.isPending}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" isLoading={correctTxMutation.isPending}>
                      Confirmar Reversão Compensatória
                    </Button>
                  </div>
                </form>
              </Modal>
            </div>
          )}
        </div>
      )}

      {/* Create Portfolio Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Criar Nova Carteira">
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
            label="Nome da Carteira"
            placeholder="Ex: Carteira Principal, Reserva, Ações Brasil"
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
              gap: `${spacing.sm}px`,
              marginTop: `${spacing.xl}px`,
            }}
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={createMutation.isPending}>
              Salvar Carteira
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <React.Suspense
      fallback={<div style={{ padding: `${spacing.xl}px` }}>Carregando carteira...</div>}
    >
      <PortfolioPageContent />
    </React.Suspense>
  );
}

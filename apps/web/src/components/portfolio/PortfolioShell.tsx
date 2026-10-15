'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { PortfolioDto, PortfolioType } from '@/api/types';
import {
  PageHeader,
  Tabs,
  PortfolioSwitcher,
  Button,
  Modal,
  Input,
  Select,
  useToast,
} from '@/components/ui';
import { colors, spacing } from '@atlas/ui';

export const CARTEIRA_TABS = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'assets', label: 'Ativos' },
  { id: 'returns', label: 'Rentabilidade' },
  { id: 'dividends', label: 'Proventos' },
  { id: 'allocation', label: 'Alocação' },
  { id: 'operations', label: 'Operações' },
];

const PORTFOLIO_TYPE_OPTIONS = [
  { value: 'PERSONAL', label: 'Pessoal (Investimentos próprios)' },
  { value: 'FAMILY', label: 'Família (Gestão conjunta)' },
  { value: 'COMPANY', label: 'Empresa (Pessoa Jurídica)' },
  { value: 'SIMULATION', label: 'Simulação (Estratégias/Testes)' },
];

export interface PortfolioShellProps {
  activeTab: string;
  selectedPortfolioId?: string | null;
  onSelectPortfolio?: (portfolioId: string) => void;
  onTabChange?: (tabId: string) => void;
  onCreatePortfolio?: () => void;
  portfolios?: PortfolioDto[];
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function PortfolioShell({
  activeTab,
  selectedPortfolioId,
  onSelectPortfolio,
  onTabChange,
  onCreatePortfolio,
  portfolios: propPortfolios,
  title = 'Carteira',
  subtitle = 'Gerencie suas carteiras e acompanhe seus investimentos estruturados',
  children,
}: PortfolioShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [isInternalModalOpen, setIsInternalModalOpen] = useState(false);
  const [modalName, setModalName] = useState('');
  const [modalType, setModalType] = useState<PortfolioType>('PERSONAL');
  const [modalBaseCurrency, setModalBaseCurrency] = useState('BRL');
  const [modalError, setModalError] = useState<string | null>(null);

  // Fetch portfolios if not supplied
  const { data: rawPortfolios = [] } = useQuery<PortfolioDto[], ApiError>({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioDto[] }>('/api/v1/portfolios');
      return res.data || [];
    },
    enabled: !propPortfolios,
    staleTime: 60000,
  });

  const portfoliosList: PortfolioDto[] = propPortfolios ?? (
    Array.isArray(rawPortfolios)
      ? rawPortfolios
      : ((rawPortfolios as unknown as { data?: PortfolioDto[] })?.data ?? [])
  );

  const activePortfolioIdResolved =
    selectedPortfolioId ??
    searchParams.get('portfolioId') ??
    portfoliosList[0]?.id ??
    null;

  const activePortfolio =
    portfoliosList.find((p) => p.id === activePortfolioIdResolved) ??
    portfoliosList[0] ??
    null;

  const handleSelectPortfolio = (id: string) => {
    if (onSelectPortfolio) {
      onSelectPortfolio(id);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('portfolioId', id);
    params.delete('asOf');

    if (pathname.includes('/performance')) {
      router.replace(`/portfolio/performance?${params.toString()}`);
    } else if (pathname.includes('/income')) {
      router.replace(`/portfolio/income?${params.toString()}`);
    } else {
      router.replace(`/portfolio?${params.toString()}`);
    }
  };

  const handleTabChange = (tabId: string) => {
    if (tabId === activeTab) return;

    if (tabId === 'returns') {
      router.push(
        `/portfolio/performance${activePortfolio ? `?portfolioId=${activePortfolio.id}` : ''}`,
      );
      return;
    }
    if (tabId === 'dividends') {
      router.push(
        `/portfolio/income${activePortfolio ? `?portfolioId=${activePortfolio.id}` : ''}`,
      );
      return;
    }

    if (onTabChange && pathname === '/portfolio') {
      onTabChange(tabId);
      return;
    }

    const basePortfolioQuery = activePortfolio ? `portfolioId=${activePortfolio.id}` : '';
    const tabQuery = tabId === 'overview' ? '' : `tab=${tabId}`;
    const qs = [basePortfolioQuery, tabQuery].filter(Boolean).join('&');
    router.push(`/portfolio${qs ? `?${qs}` : ''}`);
  };

  const openCreateModal = () => {
    if (onCreatePortfolio) {
      onCreatePortfolio();
    } else {
      setModalName('');
      setModalType('PERSONAL');
      setModalBaseCurrency('BRL');
      setModalError(null);
      setIsInternalModalOpen(true);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; type: PortfolioType; baseCurrency: string }) => {
      return apiClient.post<{ data: PortfolioDto }>('/api/v1/portfolios', payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      setIsInternalModalOpen(false);
      setModalName('');
      showToast('Carteira criada com sucesso!', 'positive');
      const newId = data.data?.id;
      if (newId) {
        handleSelectPortfolio(newId);
      }
    },
    onError: (err: ApiError) => {
      setModalError(err.message || 'Erro ao criar carteira. Tente novamente.');
    },
  });

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!modalName.trim()) {
      setModalError('O nome da carteira é obrigatório.');
      return;
    }
    createMutation.mutate({
      name: modalName.trim(),
      type: modalType,
      baseCurrency: modalBaseCurrency.trim().toUpperCase(),
    });
  };

  return (
    <div>
      {/* Unified Carteira Page Header */}
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            {portfoliosList.length > 0 && (
              <PortfolioSwitcher
                portfolios={portfoliosList}
                selectedPortfolioId={activePortfolio?.id || null}
                onSelectPortfolio={handleSelectPortfolio}
                onCreatePortfolio={openCreateModal}
              />
            )}
            <Button onClick={openCreateModal}>+ Nova Carteira</Button>
          </div>
        }
      />

      {/* Unified Tab Bar across all Carteira views */}
      {portfoliosList.length > 0 && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Tabs tabs={CARTEIRA_TABS} activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
      )}

      {/* Page Content */}
      {children}

      {/* Internal Create Portfolio Modal */}
      <Modal
        isOpen={isInternalModalOpen}
        onClose={() => setIsInternalModalOpen(false)}
        title="Criar Nova Carteira"
      >
        <form onSubmit={handleModalSubmit}>
          {modalError && (
            <div
              role="alert"
              style={{
                backgroundColor: colors.negativeSubtle,
                border: `1px solid ${colors.negative}`,
                color: colors.negative,
                padding: `${spacing.md}px`,
                borderRadius: '6px',
                fontSize: '0.875rem',
                marginBottom: `${spacing.base}px`,
              }}
            >
              {modalError}
            </div>
          )}

          <Input
            label="Nome da Carteira"
            placeholder="Ex: Carteira Principal, Reserva, Ações Brasil"
            value={modalName}
            onChange={(e) => setModalName(e.target.value)}
            disabled={createMutation.isPending}
            required
          />

          <Select
            label="Tipo de Carteira"
            options={PORTFOLIO_TYPE_OPTIONS}
            value={modalType}
            onChange={(e) => setModalType(e.target.value as PortfolioType)}
            disabled={createMutation.isPending}
          />

          <Input
            label="Moeda Base"
            value={modalBaseCurrency}
            onChange={(e) => setModalBaseCurrency(e.target.value.toUpperCase())}
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
              onClick={() => setIsInternalModalOpen(false)}
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

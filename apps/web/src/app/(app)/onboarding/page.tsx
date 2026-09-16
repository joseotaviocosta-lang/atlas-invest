'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { Button, Input, Select, Card, useToast } from '@/components/ui';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';

interface PortfolioItem {
  id: string;
  name: string;
  currency: string;
  type: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [portfolioName, setPortfolioName] = useState('Carteira Principal');
  const [portfolioType, setPortfolioType] = useState('PERSONAL');
  const [selectedMethod, setSelectedMethod] = useState<'manual' | 'import_later' | 'explore'>('explore');
  const [formError, setFormError] = useState<string | null>(null);

  // Check if existing portfolios exist
  const { data: portfolios = [], isLoading: isCheckingPortfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioItem[] }>('/api/v1/portfolios');
      return res.data || [];
    },
    staleTime: 60 * 1000,
  });

  // If already has portfolios and lands here, allow direct bypass
  const hasExistingPortfolios = portfolios.length > 0;

  const createPortfolioMutation = useMutation({
    mutationFn: async (payload: { name: string; currency: string; type: string }) => {
      const res = await apiClient.post<{ data: PortfolioItem }>('/api/v1/portfolios', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      showToast('Primeira carteira criada com sucesso!', 'positive');
      setStep(3);
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Falha ao criar carteira. Tente novamente.');
    },
  });

  const handleCreatePortfolio = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!portfolioName.trim()) {
      setFormError('Informe o nome da carteira.');
      return;
    }
    createPortfolioMutation.mutate({
      name: portfolioName.trim(),
      currency: 'BRL',
      type: portfolioType,
    });
  };

  const handleFinish = () => {
    router.replace('/today');
  };

  if (isCheckingPortfolios) {
    return (
      <div style={{ maxWidth: '540px', margin: '3rem auto', padding: '1rem', textAlign: 'center' }}>
        <p style={{ color: colors.textSecondary }}>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '580px', margin: '2rem auto', padding: `${spacing.base}px` }}>
      {/* Step Indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.xl}px`,
        }}
      >
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            style={{
              width: s === step ? '28px' : '10px',
              height: '10px',
              borderRadius: `${borderRadius.pill}px`,
              backgroundColor: s === step ? colors.accent : s < step ? colors.positive : colors.surfaceElevated,
              transition: 'all 0.25s ease',
            }}
          />
        ))}
      </div>

      <Card style={{ backgroundColor: colors.surface, padding: `${spacing.xl}px` }}>
        {hasExistingPortfolios && step === 1 && (
          <div
            style={{
              padding: `${spacing.md}px`,
              marginBottom: `${spacing.base}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.accentSubtle,
              border: `1px solid ${colors.accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.8125rem', color: colors.textPrimary }}>
              Você já possui carteiras configuradas.
            </span>
            <Button size="sm" onClick={() => router.replace('/today')}>
              Ir para o Início
            </Button>
          </div>
        )}

        {/* STEP 1: WELCOME */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: `${spacing.xl}px` }}>
              <h1
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '1.625rem',
                  fontWeight: 700,
                  color: colors.textPrimary,
                  letterSpacing: '-0.3px',
                }}
              >
                Bem-vindo ao Atlas{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9375rem',
                  color: colors.textSecondary,
                  lineHeight: 1.5,
                }}
              >
                Sua plataforma consolidada de gestão patrimonial e inteligência financeira para o mercado brasileiro.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: `${spacing.md}px`,
                marginBottom: `${spacing.xl}px`,
              }}
            >
              <div
                style={{
                  backgroundColor: colors.surfaceElevated,
                  padding: `${spacing.md}px`,
                  borderRadius: `${borderRadius.md}px`,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem', marginBottom: '4px' }}>
                  Controle
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Centralize suas contas, corretoras e classes de ativos em um único livro-razão.
                </div>
              </div>

              <div
                style={{
                  backgroundColor: colors.surfaceElevated,
                  padding: `${spacing.md}px`,
                  borderRadius: `${borderRadius.md}px`,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem', marginBottom: '4px' }}>
                  Análise
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Rentabilidade real, alocação estratégica e acompanhamento transparente de proventos.
                </div>
              </div>

              <div
                style={{
                  backgroundColor: colors.surfaceElevated,
                  padding: `${spacing.md}px`,
                  borderRadius: `${borderRadius.md}px`,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem', marginBottom: '4px' }}>
                  Fiscal
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Apuração de ganhos de capital, DARF e informes prontos para declaração anual.
                </div>
              </div>

              <div
                style={{
                  backgroundColor: colors.surfaceElevated,
                  padding: `${spacing.md}px`,
                  borderRadius: `${borderRadius.md}px`,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem', marginBottom: '4px' }}>
                  Inteligência
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Assistente contextual com respostas precisas sobre sua carteira e o mercado.
                </div>
              </div>
            </div>

            <Button fullWidth onClick={() => setStep(2)}>
              Configurar primeira carteira
            </Button>
          </div>
        )}

        {/* STEP 2: CREATE FIRST PORTFOLIO */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: `${spacing.xl}px` }}>
              <h2
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '1.375rem',
                  fontWeight: 700,
                  color: colors.textPrimary,
                }}
              >
                Criar primeira carteira
              </h2>
              <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textSecondary }}>
                Uma carteira organiza suas contas e operações sob uma mesma estratégia.
              </p>
            </div>

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

            <form onSubmit={handleCreatePortfolio}>
              <Input
                label="Nome da carteira"
                value={portfolioName}
                onChange={(e) => setPortfolioName(e.target.value)}
                placeholder="Ex: Carteira Principal, Longo Prazo, PJ"
                required
                disabled={createPortfolioMutation.isPending}
              />

              <div style={{ marginBottom: `${spacing.base}px` }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: colors.textSecondary,
                    marginBottom: '6px',
                  }}
                >
                  Moeda Base
                </label>
                <input
                  value="BRL (Real brasileiro)"
                  disabled
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    backgroundColor: colors.surfaceElevated,
                    color: colors.textMuted,
                    border: `1px solid ${colors.border}`,
                    borderRadius: `${borderRadius.md}px`,
                    fontSize: '0.875rem',
                    cursor: 'not-allowed',
                  }}
                />
              </div>

              <Select
                label="Tipo de Carteira"
                value={portfolioType}
                onChange={(e) => setPortfolioType(e.target.value)}
                options={[
                  { value: 'PERSONAL', label: 'Pessoal (Investimentos próprios)' },
                  { value: 'FAMILY', label: 'Familiar (Gestão conjunta)' },
                  { value: 'COMPANY', label: 'Pessoa Jurídica (Empresarial)' },
                  { value: 'SIMULATION', label: 'Simulação (Testes e estratégias)' },
                ]}
              />

              <div style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.lg}px` }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(1)}
                  disabled={createPortfolioMutation.isPending}
                >
                  Voltar
                </Button>
                <Button type="submit" fullWidth isLoading={createPortfolioMutation.isPending}>
                  Criar e continuar
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: START METHOD */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: `${spacing.xl}px` }}>
              <h2
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '1.375rem',
                  fontWeight: 700,
                  color: colors.textPrimary,
                }}
              >
                Como deseja começar?
              </h2>
              <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textSecondary }}>
                Sua carteira está pronta. Escolha seu próximo passo no Project Atlas.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px`, marginBottom: `${spacing.xl}px` }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedMethod('explore')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedMethod('explore');
                }}
                style={{
                  padding: `${spacing.base}px`,
                  borderRadius: `${borderRadius.md}px`,
                  backgroundColor: selectedMethod === 'explore' ? colors.accentSubtle : colors.surfaceElevated,
                  border: `1px solid ${selectedMethod === 'explore' ? colors.accent : colors.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem' }}>
                  Explorar plataforma com carteira vazia
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '2px' }}>
                  Conheça o painel diário, mercado, fiscal e IA antes de cadastrar operações.
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedMethod('manual')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedMethod('manual');
                }}
                style={{
                  padding: `${spacing.base}px`,
                  borderRadius: `${borderRadius.md}px`,
                  backgroundColor: selectedMethod === 'manual' ? colors.accentSubtle : colors.surfaceElevated,
                  border: `1px solid ${selectedMethod === 'manual' ? colors.accent : colors.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem' }}>
                  Adicionar operações manualmente
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '2px' }}>
                  Cadastre contas e lance suas compras, vendas e proventos na aba Carteira.
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedMethod('import_later')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedMethod('import_later');
                }}
                style={{
                  padding: `${spacing.base}px`,
                  borderRadius: `${borderRadius.md}px`,
                  backgroundColor: selectedMethod === 'import_later' ? colors.accentSubtle : colors.surfaceElevated,
                  border: `1px solid ${selectedMethod === 'import_later' ? colors.accent : colors.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem' }}>
                  Importar notas de corretagem depois
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: '2px' }}>
                  A integração via Open Finance e importação de notas B3 estará disponível em breve.
                </div>
              </div>
            </div>

            <Button fullWidth onClick={handleFinish}>
              Ir para o Início
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

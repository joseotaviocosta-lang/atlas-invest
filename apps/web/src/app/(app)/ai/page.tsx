'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { PortfolioDto } from '@/api/types';
import { PageHeader, Card, Button, Input, Chip, Badge, Skeleton } from '@/components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';
import {
  mapToPortfolioAiExplanationVM,
  PortfolioAiExplanationVM,
  GroundedExplanationDto,
} from '@atlas/ui';

const STARTER_QUESTIONS = [
  'Como foi o desempenho da minha carteira no período?',
  'Como minha carteira se compara ao Ibovespa?',
  'Explique o risco histórico da minha carteira.',
  'O que significa o cenário de queda de 10%?',
  'Há dados incompletos na minha carteira?',
];

export default function AIPage() {
  const [inputQuery, setInputQuery] = useState('');
  const [explanation, setExplanation] = useState<PortfolioAiExplanationVM | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

  // Load portfolios
  const { data: portfolios, isLoading: isLoadingPortfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => apiClient.get<PortfolioDto[]>('/api/v1/portfolios'),
  });

  const activePortfolioId = useMemo(() => {
    if (selectedPortfolioId) return selectedPortfolioId;
    if (portfolios && portfolios.length > 0) return portfolios[0]!.id;
    return null;
  }, [selectedPortfolioId, portfolios]);

  const explainMutation = useMutation({
    mutationFn: async (question: string) => {
      if (!activePortfolioId) throw new Error('Selecione uma carteira');
      const response = await apiClient.post<{ data: GroundedExplanationDto }>(
        `/api/v1/portfolios/${activePortfolioId}/ai/explain`,
        { question },
      );
      return response.data;
    },
    onSuccess: (dto) => {
      setExplanation(mapToPortfolioAiExplanationVM(dto));
    },
  });

  const handleSelectPrompt = (prompt: string) => {
    setInputQuery(prompt);
    if (activePortfolioId) {
      explainMutation.mutate(prompt);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || !activePortfolioId) return;
    explainMutation.mutate(inputQuery.trim());
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      <PageHeader
        title="IA Contextual"
        subtitle="Explicações factuais e comprovadas sobre sua carteira (Fase 3R)"
      />

      {/* Portfolio Selector if multiple */}
      {portfolios && portfolios.length > 1 && (
        <div
          style={{
            marginBottom: `${spacing.base}px`,
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
          }}
        >
          <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>Carteira:</span>
          <select
            value={activePortfolioId || ''}
            onChange={(e) => {
              setSelectedPortfolioId(e.target.value);
              setExplanation(null);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              fontSize: '0.8125rem',
            }}
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Chat / Explanation Container */}
      <Card
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '480px',
          justifyContent: 'space-between',
          padding: `${spacing.base}px`,
        }}
      >
        {/* Results Area */}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px`, flex: 1 }}
        >
          {isLoadingPortfolios ? (
            <Skeleton height={120} />
          ) : explainMutation.isPending ? (
            <div style={{ padding: `${spacing.base}px`, textAlign: 'center' }}>
              <Skeleton height={24} style={{ marginBottom: '8px' }} />
              <Skeleton height={60} style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                Consultando fatos comprovados no motor analítico...
              </div>
            </div>
          ) : explainMutation.isError ? (
            <div
              role="alert"
              style={{
                padding: `${spacing.base}px`,
                borderRadius: `${borderRadius.md}px`,
                backgroundColor: colors.negativeSubtle,
                border: `1px solid ${colors.negative}`,
                color: colors.negative,
                fontSize: '0.875rem',
              }}
            >
              Não foi possível gerar a explicação agora. Tente novamente mais tarde.
            </div>
          ) : explanation ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
              {/* Answer Card */}
              <div
                style={{
                  display: 'flex',
                  gap: `${spacing.md}px`,
                  alignItems: 'flex-start',
                  padding: `${spacing.base}px`,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: `${borderRadius.md}px`,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: `${borderRadius.pill}px`,
                    backgroundColor: colors.accentSubtle,
                    color: colors.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    flexShrink: 0,
                  }}
                >
                  ✨
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <div
                      style={{ fontWeight: 600, fontSize: '0.875rem', color: colors.textPrimary }}
                    >
                      Atlas Copilot
                    </div>
                    {explanation.isUnsupported && <Badge variant="warning">Não suportado</Badge>}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: colors.textPrimary, lineHeight: 1.6 }}>
                    {explanation.answer}
                  </div>
                </div>
              </div>

              {/* Evidence Section: "Dados usados nesta resposta" */}
              {explanation.hasEvidence && (
                <div
                  style={{
                    padding: `${spacing.base}px`,
                    backgroundColor: colors.surface,
                    borderRadius: `${borderRadius.md}px`,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: colors.textSecondary,
                      marginBottom: `${spacing.sm}px`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Dados usados nesta resposta
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
                    {explanation.evidence.map((ev) => (
                      <div
                        key={ev.factId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: `${spacing.xs}px ${spacing.sm}px`,
                          backgroundColor: colors.surfaceElevated,
                          borderRadius: `${borderRadius.sm}px`,
                          fontSize: '0.8125rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: colors.textPrimary, fontWeight: 500 }}>
                            {ev.label}
                          </span>
                          <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
                            ({ev.scope})
                          </span>
                          {ev.natureBadge === 'HIPOTESE' && <Badge variant="info">Hipótese</Badge>}
                          {ev.natureBadge === 'HISTORICO' && (
                            <Badge variant="neutral">Histórico</Badge>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                          {ev.valueFormatted}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Limitations Section */}
              {explanation.hasLimitations && (
                <div
                  style={{
                    padding: `${spacing.sm}px ${spacing.base}px`,
                    borderRadius: `${borderRadius.md}px`,
                    backgroundColor: colors.infoSubtle,
                    border: `1px solid ${colors.info}`,
                    color: colors.info,
                    fontSize: '0.8125rem',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>Limitações dos dados:</div>
                  <ul style={{ margin: 0, paddingLeft: '16px' }}>
                    {explanation.limitations.map((lim, idx) => (
                      <li key={idx}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            /* Initial Welcome State */
            <div
              style={{
                display: 'flex',
                gap: `${spacing.md}px`,
                alignItems: 'flex-start',
                padding: `${spacing.base}px`,
                backgroundColor: colors.surfaceElevated,
                borderRadius: `${borderRadius.md}px`,
                border: `1px solid ${colors.border}`,
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: `${borderRadius.pill}px`,
                  backgroundColor: colors.accentSubtle,
                  color: colors.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  flexShrink: 0,
                }}
              >
                ✨
              </div>
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: colors.textPrimary,
                    marginBottom: '4px',
                  }}
                >
                  Pergunte sobre sua carteira
                </div>
                <div
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.5 }}
                >
                  Olá! Sou o assistente factual do Project Atlas. Posso explicar o desempenho, risco
                  histórico, comparações com benchmarks e cenários de estresse da sua carteira com
                  base exclusivamente em fatos comprovados pelo motor analítico.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Suggested Prompts & Input Area */}
        <div
          style={{
            borderTop: `1px solid ${colors.border}`,
            paddingTop: `${spacing.base}px`,
            marginTop: `${spacing.base}px`,
          }}
        >
          <div style={{ marginBottom: `${spacing.sm}px` }}>
            <span
              style={{
                fontSize: '0.75rem',
                color: colors.textMuted,
                fontWeight: 500,
                marginBottom: '6px',
                display: 'block',
              }}
            >
              Sugestões de perguntas:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${spacing.xs}px` }}>
              {STARTER_QUESTIONS.map((prompt) => (
                <Chip
                  key={prompt}
                  label={prompt}
                  onClick={() => handleSelectPrompt(prompt)}
                  disabled={explainMutation.isPending}
                />
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSend}
            style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'flex-end' }}
          >
            <div style={{ flex: 1 }}>
              <Input
                placeholder="Pergunte sobre a rentabilidade, risco ou cenários da sua carteira..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                disabled={explainMutation.isPending}
                style={{ marginBottom: 0 }}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={explainMutation.isPending || !inputQuery.trim() || !activePortfolioId}
            >
              {explainMutation.isPending ? 'Analisando...' : 'Enviar'}
            </Button>
          </form>
          <div
            style={{
              fontSize: '0.6875rem',
              color: colors.textMuted,
              marginTop: '6px',
              textAlign: 'center',
            }}
          >
            Respostas estritamente ancoradas em fatos do ledger. Sem recomendações ou previsões de
            retorno.
          </div>
        </div>
      </Card>
    </div>
  );
}

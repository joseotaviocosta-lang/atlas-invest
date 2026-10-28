'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { PortfolioDto } from '@/api/types';
import { PageHeader, Card, Button, Input, Chip, Badge, Skeleton } from '@/components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';
import {
  mapToAiConversationDetailVM,
  mapToAiConversationListItemVM,
  AiConversationListItemDto,
  AiConversationMessageDto,
  AiConversationDetailVM,
  GroundedExplanationDto,
  AiStreamStateVM,
  AiStreamProgressStage,
} from '@atlas/ui';

// Multi-turn grounded conversation experience with streaming (Phase 3U, Phase 5U), maintaining backward compatibility with /ai/explain endpoints.

const STARTER_QUESTIONS = [
  'Explique minha carteira',
  'Explique meu imposto',
  'Explique esta pendência',
  'Explique minha alocação',
  'Explique meu planejamento',
  'Como foi o desempenho da minha carteira no período?',
  'Como minha carteira se compara ao Ibovespa?',
  'Explique o risco histórico da minha carteira.',
  'O que significa o cenário de queda de 10%?',
  'Há dados incompletos na minha carteira?',
  'Por que minha rentabilidade está incompleta?',
  'Quanto vale minha carteira em reais e dólares?',
];

const TAX_STARTER_QUESTIONS = [
  'Explique meu imposto',
  'Tenho imposto a pagar?',
  'Qual é o DARF deste mês?',
  'Tenho prejuízo a compensar?',
];

const OPERATIONS_STARTER_QUESTIONS = [
  'Explique esta pendência',
  'O que aconteceu com esta operação retificada?',
  'Quais foram as últimas decisões de reconciliação?',
  'Qual é o estado da auditoria operacional?',
];

const ALLOCATION_STARTER_QUESTIONS = [
  'Explique minha alocação',
  'Onde está minha maior concentração?',
  'Como está dividida minha carteira por classe?',
];

const CONTRIBUTION_STARTER_QUESTIONS = [
  'Explique meu planejamento',
  'Como está minha meta de aporte?',
  'Quanto aportei este mês e qual a aderência?',
];

const ASSET_STARTER_QUESTIONS = [
  'Explique esta posição',
  'Qual é meu preço médio neste ativo?',
  'Quantas cotas ou ações eu possuo?',
  'Qual é o valor atual de mercado da posição?',
  'Quanto recebi de proventos deste ativo?',
];

const TIMELINE_STARTER_QUESTIONS = [
  'Quais foram minhas últimas compras no período?',
  'Quando ocorreram vendas e quais foram os resultados?',
  'Quais proventos foram pagos neste período?',
  'Houve aportes ou retiradas recentes na carteira?',
];

function formatCivilDate(isoDate?: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export type TimelineScopeState = {
  type: 'TIMELINE' | 'ASSET_TIMELINE';
  from?: string;
  to?: string;
  assetId?: string;
  symbol?: string;
};

function AIContent() {
  const searchParams = useSearchParams();
  const initialAssetId = searchParams.get('assetId');
  const initialSymbol = searchParams.get('symbol');
  const portfolioIdParam = searchParams.get('portfolioId');
  const scopeParam = searchParams.get('scope');
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const queryClient = useQueryClient();
  const [inputQuery, setInputQuery] = useState('');
  const [assetScope, setAssetScope] = useState<{ assetId: string; symbol: string } | null>(
    initialAssetId && scopeParam !== 'timeline' && scopeParam !== 'asset_timeline'
      ? { assetId: initialAssetId, symbol: initialSymbol || initialAssetId }
      : null,
  );

  const initialTimelineScope = useMemo<TimelineScopeState | null>(() => {
    if (scopeParam === 'timeline') {
      return {
        type: 'TIMELINE',
        from: fromParam || undefined,
        to: toParam || undefined,
      };
    }
    if (scopeParam === 'asset_timeline' && initialAssetId) {
      return {
        type: 'ASSET_TIMELINE',
        assetId: initialAssetId,
        symbol: initialSymbol || initialAssetId,
        from: fromParam || undefined,
        to: toParam || undefined,
      };
    }
    return null;
  }, [scopeParam, initialAssetId, initialSymbol, fromParam, toParam]);

  const [timelineScope, setTimelineScope] = useState<TimelineScopeState | null>(
    initialTimelineScope,
  );
  const [domainScope, setDomainScope] = useState<
    'TAX' | 'OPERATIONS' | 'ALLOCATION' | 'CONTRIBUTION' | null
  >(
    scopeParam === 'tax'
      ? 'TAX'
      : scopeParam === 'operations'
        ? 'OPERATIONS'
        : scopeParam === 'allocation'
          ? 'ALLOCATION'
          : scopeParam === 'contribution'
            ? 'CONTRIBUTION'
            : null,
  );
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(portfolioIdParam);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<AiStreamStateVM>({
    isStreaming: false,
    stage: null,
    stageMessage: null,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Clean up streaming abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Load portfolios
  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => apiClient.get<PortfolioDto[]>('/api/v1/portfolios'),
  });

  const activePortfolioId = useMemo(() => {
    if (selectedPortfolioId) return selectedPortfolioId;
    if (portfolios && portfolios.length > 0) return portfolios[0]!.id;
    return null;
  }, [selectedPortfolioId, portfolios]);

  // Load conversations list
  const { data: conversationsData, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['ai-conversations', activePortfolioId],
    queryFn: () =>
      apiClient.get<{ data: AiConversationListItemDto[] }>(
        `/api/v1/portfolios/${activePortfolioId}/ai/conversations`,
      ),
    enabled: !!activePortfolioId,
  });

  const conversations = useMemo(() => {
    return (conversationsData?.data || []).map(mapToAiConversationListItemVM);
  }, [conversationsData]);

  // Auto-select first conversation if none selected
  useEffect(() => {
    if (!activeConversationId && conversations.length > 0 && conversations[0]) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  // Load active conversation messages
  const { data: activeConversationData, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['ai-conversation', activePortfolioId, activeConversationId],
    queryFn: () =>
      apiClient.get<{
        data: AiConversationListItemDto & { messages: AiConversationMessageDto[] };
      }>(
        `/api/v1/portfolios/${activePortfolioId}/ai/conversations/${activeConversationId}?limit=50`,
      ),
    enabled: !!activePortfolioId && !!activeConversationId,
  });

  const conversationDetail: AiConversationDetailVM | null = useMemo(() => {
    if (!activeConversationData?.data) return null;
    return mapToAiConversationDetailVM(
      activeConversationData.data,
      activeConversationData.data.messages || [],
    );
  }, [activeConversationData]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationDetail?.messages, streamState.stageMessage]);

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async (title?: string) => {
      if (!activePortfolioId) throw new Error('Selecione uma carteira');
      const response = await apiClient.post<{ data: AiConversationListItemDto }>(
        `/api/v1/portfolios/${activePortfolioId}/ai/conversations`,
        { title },
      );
      return response.data;
    },
    onSuccess: (newConv) => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations', activePortfolioId] });
      setActiveConversationId(newConv.id);
    },
  });

  const activePortfolioName = useMemo(() => {
    if (!portfolios || portfolios.length === 0) return 'Principal';
    const found = portfolios.find((p) => p.id === activePortfolioId);
    return found ? found.name : 'Principal';
  }, [portfolios, activePortfolioId]);

  // Resolve current active scope
  const currentScope = useMemo(() => {
    if (timelineScope) {
      if (timelineScope.type === 'ASSET_TIMELINE' && timelineScope.assetId) {
        return {
          type: 'ASSET_TIMELINE' as const,
          assetId: timelineScope.assetId,
          from: timelineScope.from,
          to: timelineScope.to,
        };
      }
      return {
        type: 'TIMELINE' as const,
        from: timelineScope.from,
        to: timelineScope.to,
      };
    }
    if (assetScope) {
      return {
        type: 'ASSET' as const,
        assetId: assetScope.assetId,
      };
    }
    if (domainScope === 'TAX') {
      return { type: 'TAX' as const };
    }
    if (domainScope === 'OPERATIONS') {
      return { type: 'OPERATIONS' as const };
    }
    if (domainScope === 'ALLOCATION') {
      return { type: 'ALLOCATION' as const };
    }
    if (domainScope === 'CONTRIBUTION') {
      return { type: 'CONTRIBUTION' as const };
    }
    return undefined;
  }, [timelineScope, assetScope, domainScope]);

  const activeStarterQuestions = useMemo(() => {
    if (timelineScope) return TIMELINE_STARTER_QUESTIONS;
    if (assetScope) return ASSET_STARTER_QUESTIONS;
    if (domainScope === 'TAX') return TAX_STARTER_QUESTIONS;
    if (domainScope === 'OPERATIONS') return OPERATIONS_STARTER_QUESTIONS;
    if (domainScope === 'ALLOCATION') return ALLOCATION_STARTER_QUESTIONS;
    if (domainScope === 'CONTRIBUTION') return CONTRIBUTION_STARTER_QUESTIONS;
    return STARTER_QUESTIONS;
  }, [timelineScope, assetScope, domainScope]);

  // Backward-compatible non-streaming fallback mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({
      conversationId,
      question,
    }: {
      conversationId: string;
      question: string;
    }) => {
      if (!activePortfolioId) throw new Error('Selecione uma carteira');
      const payload = {
        question,
        ...(currentScope ? { scope: currentScope } : {}),
      };
      const response = await apiClient.post<{ data: GroundedExplanationDto }>(
        `/api/v1/portfolios/${activePortfolioId}/ai/conversations/${conversationId}/messages`,
        payload,
      );
      return response.data;
    },
    onSuccess: () => {
      setInputQuery('');
      queryClient.invalidateQueries({
        queryKey: ['ai-conversation', activePortfolioId, activeConversationId],
      });
      queryClient.invalidateQueries({ queryKey: ['ai-conversations', activePortfolioId] });
    },
  });

  const handleSendMessageStream = async (targetConvId: string, q: string) => {
    if (streamState.isStreaming || sendMessageMutation.isPending) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStreamState({
      isStreaming: true,
      stage: 'CLASSIFYING',
      stageMessage: 'Analisando sua pergunta...',
      error: null,
    });
    setInputQuery('');

    try {
      const streamPayload = {
        question: q,
        ...(currentScope ? { scope: currentScope } : {}),
      };
      await apiClient.stream(
        `/api/v1/portfolios/${activePortfolioId}/ai/conversations/${targetConvId}/messages/stream`,
        streamPayload,
        (event: { type: string; data?: { stage?: string; message?: string } }) => {
          if (event?.type === 'PROGRESS') {
            setStreamState((prev) => ({
              ...prev,
              stage: (event.data?.stage as AiStreamProgressStage) ?? null,
              stageMessage: event.data?.message ?? 'Processando...',
            }));
          } else if (event?.type === 'FINAL') {
            setStreamState({
              isStreaming: false,
              stage: null,
              stageMessage: null,
              error: null,
            });
            queryClient.invalidateQueries({
              queryKey: ['ai-conversation', activePortfolioId, activeConversationId],
            });
            queryClient.invalidateQueries({ queryKey: ['ai-conversations', activePortfolioId] });
          } else if (event?.type === 'ERROR') {
            setStreamState({
              isStreaming: false,
              stage: null,
              stageMessage: null,
              error: event.data?.message || 'Não foi possível gerar a explicação agora.',
            });
          }
        },
        { signal: controller.signal },
      );
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        setStreamState({
          isStreaming: false,
          stage: null,
          stageMessage: null,
          error: null,
        });
        return;
      }
      setStreamState({
        isStreaming: false,
        stage: null,
        stageMessage: null,
        error: (err as Error).message || 'Não foi possível gerar a explicação agora.',
      });
    }
  };

  const handleStartNewConversation = () => {
    createConversationMutation.mutate(undefined);
  };

  const handleSelectPrompt = async (prompt: string) => {
    if (!activePortfolioId) return;

    let targetConvId = activeConversationId;
    if (!targetConvId) {
      const created = await createConversationMutation.mutateAsync(prompt.slice(0, 50));
      targetConvId = created.id;
    }

    if (targetConvId) {
      handleSendMessageStream(targetConvId, prompt);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputQuery.trim();
    if (!q || !activePortfolioId) return;

    let targetConvId = activeConversationId;
    if (!targetConvId) {
      const created = await createConversationMutation.mutateAsync(q.slice(0, 50));
      targetConvId = created.id;
    }

    if (targetConvId) {
      handleSendMessageStream(targetConvId, q);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        title="IA Contextual"
        subtitle="Diálogos explicativos fundamentados no ledger com evidências comprovadas (Fase 3S)"
      />

      {/* Portfolio Selector */}
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
              setActiveConversationId(null);
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
                {p.name} ({p.baseCurrency})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Main Conversation Container */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          gap: `${spacing.base}px`,
          minHeight: '620px',
        }}
      >
        {/* Sidebar: Conversation List */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.sm}px`,
            borderRight: `1px solid ${colors.border}`,
            paddingRight: `${spacing.base}px`,
          }}
        >
          <Button
            variant="outline"
            onClick={handleStartNewConversation}
            disabled={createConversationMutation.isPending || !activePortfolioId}
            style={{ width: '100%', marginBottom: `${spacing.sm}px` }}
          >
            + Nova conversa
          </Button>

          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Histórico de Conversas
          </span>

          {isLoadingConversations && <Skeleton height="40px" />}

          {!isLoadingConversations && conversations.length === 0 && (
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Nenhuma conversa iniciada.
            </span>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              overflowY: 'auto',
              maxHeight: '520px',
            }}
          >
            {conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: `${borderRadius.sm}px`,
                    border: `1px solid ${isActive ? colors.accent : colors.border}`,
                    backgroundColor: isActive ? colors.surfaceElevated : 'transparent',
                    color: isActive ? colors.accent : colors.textPrimary,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={conv.title}
                >
                  {conv.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat / Message Area */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
          }}
        >
          {/* AI Context Indicator & Source Provenance (Phase 5U, Step 47, 77, 78) */}
          <div
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.sm}px`,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: `${spacing.sm}px`,
              flexWrap: 'wrap',
              gap: `${spacing.xs}px`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
              <Badge variant="info">
                {domainScope === 'TAX'
                  ? 'Fiscal'
                  : domainScope === 'OPERATIONS'
                    ? 'Operações'
                    : domainScope === 'ALLOCATION'
                      ? 'Alocação'
                      : domainScope === 'CONTRIBUTION'
                        ? 'Planejamento'
                        : assetScope
                          ? `Ativo: ${assetScope.symbol}`
                          : timelineScope
                            ? 'Linha do Tempo'
                            : 'Geral'}
              </Badge>
              <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                Carteira: <strong style={{ color: colors.textPrimary }}>{activePortfolioName}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
                Baseado em dados do Atlas:
              </span>
              <a href="/portfolio" style={{ textDecoration: 'none' }}>
                <Chip label="Carteira" />
              </a>
              <a href="/tax" style={{ textDecoration: 'none' }}>
                <Chip label="Fiscal" />
              </a>
              <a href="/market" style={{ textDecoration: 'none' }}>
                <Chip label="Mercado" />
              </a>
              <a href="/portfolio/operations" style={{ textDecoration: 'none' }}>
                <Chip label="Histórico" />
              </a>
              {(domainScope || assetScope || timelineScope) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDomainScope(null);
                    setAssetScope(null);
                    setTimelineScope(null);
                  }}
                  style={{ fontSize: '0.6875rem', padding: '1px 6px', marginLeft: '4px' }}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Scrollable message thread */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: `${spacing.base}px`,
              paddingRight: `${spacing.sm}px`,
              marginBottom: `${spacing.base}px`,
            }}
          >
            {isLoadingMessages && <Skeleton height="120px" />}

            {/* Empty conversation: show starter chips */}
            {(!conversationDetail || !conversationDetail.hasMessages) && (
              <div style={{ textAlign: 'center', margin: 'auto 0' }}>
                <Card style={{ padding: `${spacing.lg}px`, textAlign: 'center' }}>
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: colors.textPrimary,
                      marginBottom: `${spacing.sm}px`,
                    }}
                  >
                    Como posso ajudar a entender sua carteira hoje?
                  </h3>
                  <p
                    style={{
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      marginBottom: `${spacing.base}px`,
                    }}
                  >
                    Pergunte sobre sua carteira: rentabilidade, impostos apurados, histórico de operações,
                    alocação ou dados incompletos.
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: `${spacing.sm}px`,
                      justifyContent: 'center',
                    }}
                  >
                    {activeStarterQuestions.map((q) => (
                      <Chip
                        key={q}
                        label={q}
                        onClick={() => handleSelectPrompt(q)}
                        disabled={sendMessageMutation.isPending}
                      />
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* Render message list */}
            {conversationDetail &&
              conversationDetail.messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: msg.isUser ? '80%' : '92%',
                      padding: `${spacing.base}px`,
                      borderRadius: `${borderRadius.md}px`,
                      backgroundColor: msg.isUser ? colors.surfaceElevated : colors.surface,
                      border: `1px solid ${msg.isUser ? colors.accent : colors.border}`,
                      color: colors.textPrimary,
                    }}
                  >
                    {/* Role header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: `${spacing.xs}px`,
                        gap: `${spacing.sm}px`,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: msg.isUser ? colors.accent : colors.textSecondary,
                        }}
                      >
                        {msg.isUser ? 'Você' : 'Atlas IA'}
                      </span>
                      {msg.providerInfo && (
                        <span style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
                          {msg.providerInfo.model}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <p
                      style={{
                        fontSize: '0.875rem',
                        lineHeight: 1.6,
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.content}
                    </p>

                    {/* Refusal notice for unsupported messages */}
                    {msg.isUnsupported && (
                      <div
                        style={{
                          marginTop: `${spacing.sm}px`,
                          padding: `${spacing.xs}px ${spacing.sm}px`,
                          borderRadius: `${borderRadius.sm}px`,
                          backgroundColor: 'rgba(234, 179, 8, 0.1)',
                          border: '1px solid rgba(234, 179, 8, 0.3)',
                          fontSize: '0.75rem',
                          color: '#eab308',
                        }}
                      >
                        ℹ️ Não suportado: Solicitação fora do escopo analítico aprovado (sem
                        recomendações ou projeções).
                      </div>
                    )}

                    {/* Evidence facts */}
                    {msg.hasEvidence && (
                      <div
                        style={{
                          marginTop: `${spacing.base}px`,
                          paddingTop: `${spacing.sm}px`,
                          borderTop: `1px solid ${colors.border}`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: colors.textSecondary,
                            display: 'block',
                            marginBottom: `${spacing.xs}px`,
                          }}
                        >
                          Dados usados nesta resposta:
                        </span>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: `${spacing.xs}px`,
                          }}
                        >
                          {msg.evidence.map((ev) => (
                            <div
                              key={ev.factId}
                              style={{
                                padding: '6px 8px',
                                borderRadius: `${borderRadius.sm}px`,
                                backgroundColor: colors.surfaceElevated,
                                border: `1px solid ${colors.border}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '0.6875rem',
                                    color: colors.textSecondary,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={ev.label}
                                >
                                  {ev.label}
                                </span>
                                <Badge
                                  variant={
                                    ev.natureBadge === 'HIPOTESE'
                                      ? 'warning'
                                      : ev.natureBadge === 'HISTORICO'
                                        ? 'info'
                                        : 'success'
                                  }
                                >
                                  {ev.natureBadgeLabel}
                                </Badge>
                              </div>
                              <span
                                style={{
                                  fontSize: '0.8125rem',
                                  fontWeight: 600,
                                  color: colors.textPrimary,
                                }}
                              >
                                {ev.valueFormatted}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Limitations */}
                    {msg.hasLimitations && (
                      <div
                        style={{
                          marginTop: `${spacing.sm}px`,
                          padding: `${spacing.xs}px ${spacing.sm}px`,
                          borderRadius: `${borderRadius.sm}px`,
                          backgroundColor: colors.surfaceElevated,
                          border: `1px solid ${colors.border}`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: colors.textSecondary,
                            display: 'block',
                            marginBottom: '2px',
                          }}
                        >
                          Limitações dos dados:
                        </span>
                        {msg.limitations.map((lim, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '0.75rem',
                              color: colors.textSecondary,
                              display: 'block',
                            }}
                          >
                            • {lim}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Deep links to product surfaces (Phase 5U, Step 48) */}
                    {!msg.isUser && msg.hasEvidence && (
                      <div
                        style={{
                          marginTop: `${spacing.sm}px`,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: `${spacing.xs}px`,
                        }}
                      >
                        {msg.evidence.some((e) =>
                          ['TAX_LIABILITY', 'TAX_CATEGORY', 'TAX_LOSS_BALANCE'].includes(
                            e.category,
                          ),
                        ) && (
                          <a href="/tax" style={{ textDecoration: 'none' }}>
                            <Button
                              variant="outline"
                              size="sm"
                              style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                            >
                              Ver painel fiscal →
                            </Button>
                          </a>
                        )}
                        {msg.evidence.some((e) =>
                          ['OPERATIONAL_AUDIT', 'RECTIFICATION', 'RECONCILIATION'].includes(
                            e.category,
                          ),
                        ) && (
                          <a href="/portfolio/operations" style={{ textDecoration: 'none' }}>
                            <Button
                              variant="outline"
                              size="sm"
                              style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                            >
                              Ver histórico e auditoria →
                            </Button>
                          </a>
                        )}
                        {msg.evidence.some((e) =>
                          ['ASSET_POSITION', 'ASSET_IDENTITY', 'ASSET_ALLOCATION'].includes(
                            e.category,
                          ),
                        ) && (
                          <a href="/portfolio" style={{ textDecoration: 'none' }}>
                            <Button
                              variant="outline"
                              size="sm"
                              style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                            >
                              Ver carteira →
                            </Button>
                          </a>
                        )}
                        {msg.evidence.some((e) =>
                          ['MARKET_QUOTE', 'MARKET_DATA_GAP'].includes(e.category),
                        ) && (
                          <a href="/market" style={{ textDecoration: 'none' }}>
                            <Button
                              variant="outline"
                              size="sm"
                              style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                            >
                              Ver mercado →
                            </Button>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

            {/* Streaming progress indicator (Phase 3U) */}
            {streamState.isStreaming && (
              <div style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
                <div
                  style={{
                    padding: `${spacing.sm}px ${spacing.base}px`,
                    borderRadius: `${borderRadius.md}px`,
                    backgroundColor: colors.surfaceElevated,
                    border: `1px solid ${colors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${spacing.sm}px`,
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: colors.accent,
                    }}
                  />
                  <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    {streamState.stageMessage || 'Analisando...'}
                  </span>
                </div>
              </div>
            )}

            {/* Mutation pending skeleton (fallback) */}
            {sendMessageMutation.isPending && !streamState.isStreaming && (
              <div style={{ alignSelf: 'flex-start', width: '70%' }}>
                <Skeleton height="80px" />
              </div>
            )}

            {/* Error state */}
            {(streamState.error || sendMessageMutation.isError) && (
              <div
                style={{
                  padding: `${spacing.sm}px`,
                  borderRadius: `${borderRadius.sm}px`,
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: colors.negative,
                  fontSize: '0.8125rem',
                }}
              >
                {streamState.error ||
                  'Não foi possível gerar a explicação agora. Tente novamente mais tarde.'}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Timeline Scope Indicator (Phase 3X) */}
          {timelineScope && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${spacing.xs}px ${spacing.md}px`,
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: `${borderRadius.md}px`,
                marginBottom: `${spacing.sm}px`,
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: colors.accent, fontWeight: 600 }}>
                📅 Período:{' '}
                {timelineScope.type === 'ASSET_TIMELINE'
                  ? `${timelineScope.symbol || 'Ativo'} · `
                  : 'Carteira · '}
                {timelineScope.from ? formatCivilDate(timelineScope.from) : 'Início'} a{' '}
                {timelineScope.to ? formatCivilDate(timelineScope.to) : 'Hoje'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTimelineScope(null)}
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
              >
                Limpar escopo
              </Button>
            </div>
          )}

          {/* Asset Scope Indicator (Phase 3W) */}
          {!timelineScope && assetScope && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${spacing.xs}px ${spacing.md}px`,
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: `${borderRadius.md}px`,
                marginBottom: `${spacing.sm}px`,
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: colors.accent, fontWeight: 600 }}>
                🎯 Sobre: {assetScope.symbol}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssetScope(null)}
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
              >
                Limpar escopo
              </Button>
            </div>
          )}

          {/* Message Composer */}
          <form
            onSubmit={handleSend}
            style={{
              display: 'flex',
              gap: `${spacing.sm}px`,
              alignItems: 'center',
              borderTop: `1px solid ${colors.border}`,
              paddingTop: `${spacing.sm}px`,
            }}
          >
            <div style={{ flex: 1 }}>
              <Input
                placeholder={
                  timelineScope
                    ? 'Pergunte sobre eventos ou transações deste período...'
                    : assetScope
                      ? `Pergunte sobre ${assetScope.symbol} (ex: 'Qual é meu preço médio?')...`
                      : "Pergunte sobre a carteira (ex: 'E o risco?', 'E contra o CDI?')..."
                }
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                disabled={
                  streamState.isStreaming || sendMessageMutation.isPending || !activePortfolioId
                }
                maxLength={2000}
              />
            </div>
            <Button
              type="submit"
              disabled={
                streamState.isStreaming ||
                sendMessageMutation.isPending ||
                !inputQuery.trim() ||
                !activePortfolioId
              }
            >
              {streamState.isStreaming
                ? 'Analisando...'
                : sendMessageMutation.isPending
                  ? 'Analisando...'
                  : 'Enviar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AIPage() {
  return (
    <React.Suspense fallback={<Skeleton width="100%" height="400px" />}>
      <AIContent />
    </React.Suspense>
  );
}

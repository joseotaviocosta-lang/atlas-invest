'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
} from '@atlas/ui';

// Multi-turn grounded conversation experience (Phase 3S), maintaining backward compatibility with /ai/explain endpoints.

const STARTER_QUESTIONS = [
  'Como foi o desempenho da minha carteira no período?',
  'Como minha carteira se compara ao Ibovespa?',
  'Explique o risco histórico da minha carteira.',
  'O que significa o cenário de queda de 10%?',
  'Há dados incompletos na minha carteira?',
];

export default function AIPage() {
  const queryClient = useQueryClient();
  const [inputQuery, setInputQuery] = useState('');
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  }, [conversationDetail?.messages]);

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

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({
      conversationId,
      question,
    }: {
      conversationId: string;
      question: string;
    }) => {
      if (!activePortfolioId) throw new Error('Selecione uma carteira');
      const response = await apiClient.post<{ data: GroundedExplanationDto }>(
        `/api/v1/portfolios/${activePortfolioId}/ai/conversations/${conversationId}/messages`,
        { question },
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
      sendMessageMutation.mutate({
        conversationId: targetConvId,
        question: prompt,
      });
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
      sendMessageMutation.mutate({
        conversationId: targetConvId,
        question: q,
      });
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
                    Pergunte sobre sua carteira: rentabilidade, benchmarks, risco histórico,
                    estresse ou dados incompletos.
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: `${spacing.sm}px`,
                      justifyContent: 'center',
                    }}
                  >
                    {STARTER_QUESTIONS.map((q) => (
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
                  </div>
                </div>
              ))}

            {/* Mutation pending skeleton */}
            {sendMessageMutation.isPending && (
              <div style={{ alignSelf: 'flex-start', width: '70%' }}>
                <Skeleton height="80px" />
              </div>
            )}

            {/* Error state */}
            {sendMessageMutation.isError && (
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
                Não foi possível gerar a explicação agora. Tente novamente mais tarde.
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

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
                placeholder="Pergunte sobre a carteira (ex: 'E o risco?', 'E contra o CDI?')..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                disabled={sendMessageMutation.isPending || !activePortfolioId}
                maxLength={2000}
              />
            </div>
            <Button
              type="submit"
              disabled={sendMessageMutation.isPending || !inputQuery.trim() || !activePortfolioId}
            >
              {sendMessageMutation.isPending ? 'Analisando...' : 'Enviar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

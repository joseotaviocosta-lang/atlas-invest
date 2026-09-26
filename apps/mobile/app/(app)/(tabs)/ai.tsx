import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  themeTokens,
  colors,
  mapToAiConversationDetailVM,
  mapToAiConversationListItemVM,
  AiConversationDetailVM,
} from '@atlas/ui';
import { Screen, Header, Card, Button } from '../../../src/components/ui';
import { portfoliosApi } from '../../../src/api/portfolios';

const STARTER_QUESTIONS = [
  'Como foi o desempenho da minha carteira no período?',
  'Como minha carteira se compara ao Ibovespa?',
  'Explique o risco histórico da minha carteira.',
  'O que significa o cenário de queda de 10%?',
  'Há dados incompletos na minha carteira?',
];

const ASSET_STARTER_QUESTIONS = [
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

export default function AIScreen() {
  const router = useRouter();
  const localParams = useLocalSearchParams<{
    portfolioId?: string;
    assetId?: string;
    symbol?: string;
    scope?: string;
    from?: string;
    to?: string;
  }>();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');

  const initialTimelineScope = useMemo(() => {
    if (localParams.scope === 'timeline') {
      return {
        type: 'TIMELINE' as const,
        from: localParams.from || undefined,
        to: localParams.to || undefined,
      };
    }
    if (localParams.scope === 'asset_timeline' && localParams.assetId) {
      return {
        type: 'ASSET_TIMELINE' as const,
        assetId: localParams.assetId,
        symbol: localParams.symbol || localParams.assetId,
        from: localParams.from || undefined,
        to: localParams.to || undefined,
      };
    }
    return null;
  }, [
    localParams.scope,
    localParams.assetId,
    localParams.symbol,
    localParams.from,
    localParams.to,
  ]);

  const [timelineScope, setTimelineScope] = useState(initialTimelineScope);
  const [assetScope, setAssetScope] = useState<{ assetId: string; symbol: string } | null>(
    localParams.assetId &&
      localParams.scope !== 'timeline' &&
      localParams.scope !== 'asset_timeline'
      ? { assetId: localParams.assetId, symbol: localParams.symbol || localParams.assetId }
      : null,
  );

  const currentScope = useMemo(() => {
    if (timelineScope) {
      if (timelineScope.type === 'ASSET_TIMELINE') {
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
    return undefined;
  }, [timelineScope, assetScope]);
  const [selectedPortfolioId, _setSelectedPortfolioId] = useState<string | null>(
    localParams.portfolioId || null,
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Load portfolios
  const { data: portfoliosData, isLoading: isLoadingPortfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.listPortfolios(),
  });

  const activePortfolioId = useMemo(() => {
    if (selectedPortfolioId) return selectedPortfolioId;
    if (portfoliosData?.data && portfoliosData.data.length > 0 && portfoliosData.data[0]) {
      return portfoliosData.data[0].id;
    }
    return null;
  }, [selectedPortfolioId, portfoliosData]);

  // Load conversations
  const { data: conversationsData, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['ai-conversations', activePortfolioId],
    queryFn: () => portfoliosApi.listAiConversations(activePortfolioId!),
    enabled: !!activePortfolioId,
  });

  const conversations = useMemo(() => {
    return (conversationsData?.data || []).map(mapToAiConversationListItemVM);
  }, [conversationsData]);

  // Auto-select latest conversation
  React.useEffect(() => {
    if (!activeConversationId && conversations.length > 0 && conversations[0]) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  // Load active conversation messages
  const { data: activeConversationData, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['ai-conversation', activePortfolioId, activeConversationId],
    queryFn: () => portfoliosApi.getAiConversation(activePortfolioId!, activeConversationId!),
    enabled: !!activePortfolioId && !!activeConversationId,
  });

  const conversationDetail: AiConversationDetailVM | null = useMemo(() => {
    if (!activeConversationData?.data) return null;
    return mapToAiConversationDetailVM(
      activeConversationData.data,
      activeConversationData.data.messages || [],
    );
  }, [activeConversationData]);

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async (title?: string) => {
      if (!activePortfolioId) throw new Error('Selecione uma carteira');
      const response = await portfoliosApi.createAiConversation(activePortfolioId, title);
      return response.data;
    },
    onSuccess: (newConv) => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations', activePortfolioId] });
      setActiveConversationId(newConv.id);
    },
  });

  const [streamState, setStreamState] = useState<{
    isStreaming: boolean;
    stage: string | null;
    message: string | null;
    error: string | null;
  }>({
    isStreaming: false,
    stage: null,
    message: null,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Send message mutation (fallback)
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, q }: { conversationId: string; q: string }) => {
      if (!activePortfolioId) throw new Error('Selecione uma carteira');
      const response = await portfoliosApi.sendAiConversationMessage(
        activePortfolioId,
        conversationId,
        q,
        currentScope,
      );
      return response.data;
    },
    onSuccess: () => {
      setQuestion('');
      queryClient.invalidateQueries({
        queryKey: ['ai-conversation', activePortfolioId, activeConversationId],
      });
      queryClient.invalidateQueries({ queryKey: ['ai-conversations', activePortfolioId] });
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
    },
  });

  const handleSendMessageStream = async (targetConvId: string, q: string) => {
    if (!activePortfolioId) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStreamState({
      isStreaming: true,
      stage: 'CLASSIFYING',
      message: 'Processando requisição...',
      error: null,
    });
    setQuestion('');

    try {
      await portfoliosApi.streamAiConversationMessage<{
        type: string;
        data?: { stage?: string; message?: string };
      }>(
        activePortfolioId,
        targetConvId,
        q,
        (event) => {
          if (event.type === 'PROGRESS') {
            setStreamState({
              isStreaming: true,
              stage: event.data?.stage ?? null,
              message: event.data?.message ?? null,
              error: null,
            });
          } else if (event.type === 'FINAL') {
            setStreamState({
              isStreaming: false,
              stage: null,
              message: null,
              error: null,
            });
            queryClient.invalidateQueries({
              queryKey: ['ai-conversation', activePortfolioId, targetConvId],
            });
            queryClient.invalidateQueries({ queryKey: ['ai-conversations', activePortfolioId] });
            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
          } else if (event.type === 'ERROR') {
            setStreamState({
              isStreaming: false,
              stage: null,
              message: null,
              error: event.data?.message ?? 'Erro no processamento.',
            });
          }
        },
        {
          scope: currentScope,
          signal: controller.signal,
        },
      );
    } catch {
      if (controller.signal.aborted) {
        setStreamState({ isStreaming: false, stage: null, message: null, error: null });
        return;
      }
      setStreamState({
        isStreaming: false,
        stage: null,
        message: null,
        error: 'Não foi possível gerar a explicação agora.',
      });
    }
  };

  const handleStartNewConversation = () => {
    createConversationMutation.mutate(undefined);
  };

  const handleSelectPrompt = async (prompt: string) => {
    if (!activePortfolioId || streamState.isStreaming) return;

    let targetConvId = activeConversationId;
    if (!targetConvId) {
      const created = await createConversationMutation.mutateAsync(prompt.slice(0, 50));
      targetConvId = created.id;
    }

    if (targetConvId) {
      await handleSendMessageStream(targetConvId, prompt);
    }
  };

  const handleSend = async () => {
    const q = question.trim();
    if (!q || !activePortfolioId || streamState.isStreaming) return;

    let targetConvId = activeConversationId;
    if (!targetConvId) {
      const created = await createConversationMutation.mutateAsync(q.slice(0, 50));
      targetConvId = created.id;
    }

    if (targetConvId) {
      await handleSendMessageStream(targetConvId, q);
    }
  };

  return (
    <Screen>
      <Header
        title="Atlas IA"
        subtitle="Diálogos explicativos fundamentados no ledger (Fase 3S)"
        rightAction={{
          title: 'Perfil',
          onPress: () => router.push('/(app)/profile'),
        }}
      />
      <View style={styles.topActionsRow}>
        <Button
          title="+ Nova conversa"
          variant="secondary"
          onPress={handleStartNewConversation}
          disabled={createConversationMutation.isPending || !activePortfolioId}
        />
        {conversations.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.conversationChipsContainer}
          >
            {conversations.map((conv) => {
              const isSelected = conv.id === activeConversationId;
              return (
                <TouchableOpacity
                  key={conv.id}
                  style={[styles.convChip, isSelected && styles.convChipActive]}
                  onPress={() => setActiveConversationId(conv.id)}
                >
                  <Text
                    style={[styles.convChipText, isSelected && styles.convChipTextActive]}
                    numberOfLines={1}
                  >
                    {conv.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {isLoadingPortfolios || isLoadingConversations ? (
          <ActivityIndicator color={themeTokens.colors.primary} style={{ marginTop: 24 }} />
        ) : (!conversationDetail || !conversationDetail.hasMessages) && !isLoadingMessages ? (
          <View style={styles.emptyContainer}>
            <Card>
              <Text style={styles.emptyTitle}>Como posso ajudar hoje?</Text>
              <Text style={styles.emptySubtitle}>
                Pergunte sobre rentabilidade, benchmarks, risco histórico, estresse ou dados
                incompletos.
              </Text>
              <View style={styles.starterChipsContainer}>
                {(timelineScope
                  ? TIMELINE_STARTER_QUESTIONS
                  : assetScope
                    ? ASSET_STARTER_QUESTIONS
                    : STARTER_QUESTIONS
                ).map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={styles.starterChip}
                    onPress={() => handleSelectPrompt(q)}
                    disabled={sendMessageMutation.isPending || streamState.isStreaming}
                  >
                    <Text style={styles.starterChipText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          </View>
        ) : (
          <View style={styles.messagesContainer}>
            {conversationDetail?.messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.messageBubble,
                  msg.isUser ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                <Text style={msg.isUser ? styles.userSenderText : styles.assistantSenderText}>
                  {msg.isUser ? 'Você' : 'Atlas IA'}
                </Text>
                <Text style={styles.messageContentText}>{msg.content}</Text>

                {msg.isUnsupported && (
                  <View style={styles.unsupportedBadge}>
                    <Text style={styles.unsupportedBadgeText}>
                      ℹ️ Não suportado: fora do escopo analítico aprovado
                    </Text>
                  </View>
                )}

                {msg.hasEvidence && (
                  <View style={styles.evidenceContainer}>
                    <Text style={styles.evidenceSectionTitle}>Dados usados nesta resposta:</Text>
                    {msg.evidence.map((ev) => (
                      <View key={ev.factId} style={styles.evidenceRow}>
                        <View style={styles.evidenceLabelCol}>
                          <Text style={styles.evidenceLabelText}>{ev.label}</Text>
                          <View style={styles.badgeRow}>
                            <Text style={styles.scopeText}>({ev.scope})</Text>
                            {ev.natureBadge === 'HIPOTESE' && (
                              <View style={styles.badgeHypo}>
                                <Text style={styles.badgeHypoText}>Hipótese</Text>
                              </View>
                            )}
                            {ev.natureBadge === 'HISTORICO' && (
                              <View style={styles.badgeHist}>
                                <Text style={styles.badgeHistText}>Histórico</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Text style={styles.evidenceValueText}>{ev.valueFormatted}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {msg.hasLimitations && (
                  <View style={styles.limitationsContainer}>
                    <Text style={styles.limitationsTitle}>Limitações dos dados:</Text>
                    {msg.limitations.map((lim, idx) => (
                      <Text key={idx} style={styles.limitationItem}>
                        • {lim}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {(sendMessageMutation.isPending || streamState.isStreaming) && (
              <Card style={{ marginVertical: 8 }}>
                <ActivityIndicator color={themeTokens.colors.primary} />
                <Text style={styles.loadingText}>
                  {streamState.message || 'Analisando fatos comprovados...'}
                </Text>
              </Card>
            )}

            {(sendMessageMutation.isError || streamState.error) && (
              <Card style={{ marginVertical: 8, borderColor: themeTokens.colors.danger }}>
                <Text style={{ color: themeTokens.colors.danger, fontSize: 12 }}>
                  {streamState.error || 'Não foi possível gerar a explicação agora.'}
                </Text>
              </Card>
            )}
          </View>
        )}
      </ScrollView>

      {/* Scope Banner (Phase 3X Timeline) */}
      {timelineScope && (
        <View style={styles.scopeBanner}>
          <Text style={styles.scopeBannerText}>
            📅 Período:{' '}
            <Text style={{ fontWeight: '700', color: themeTokens.colors.primary }}>
              {timelineScope.type === 'ASSET_TIMELINE'
                ? `${timelineScope.symbol || 'Ativo'} · `
                : 'Carteira · '}
              {timelineScope.from ? formatCivilDate(timelineScope.from) : 'Início'} a{' '}
              {timelineScope.to ? formatCivilDate(timelineScope.to) : 'Hoje'}
            </Text>
          </Text>
          <TouchableOpacity onPress={() => setTimelineScope(null)} style={styles.clearScopeButton}>
            <Text style={styles.clearScopeButtonText}>Limpar escopo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Scope Banner (Phase 3W Asset) */}
      {!timelineScope && assetScope && (
        <View style={styles.scopeBanner}>
          <Text style={styles.scopeBannerText}>
            🎯 Sobre:{' '}
            <Text style={{ fontWeight: '700', color: themeTokens.colors.primary }}>
              {assetScope.symbol}
            </Text>
          </Text>
          <TouchableOpacity onPress={() => setAssetScope(null)} style={styles.clearScopeButton}>
            <Text style={styles.clearScopeButtonText}>Limpar escopo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Composer */}
      <View style={styles.composerContainer}>
        <TextInput
          style={styles.textInput}
          placeholder={
            timelineScope
              ? 'Pergunte sobre eventos deste período...'
              : assetScope
                ? `Pergunte sobre ${assetScope.symbol}...`
                : 'Pergunte sobre sua carteira...'
          }
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          multiline
          maxLength={2000}
          editable={
            !sendMessageMutation.isPending && !streamState.isStreaming && !!activePortfolioId
          }
        />
        <Button
          title={sendMessageMutation.isPending || streamState.isStreaming ? '...' : 'Enviar'}
          onPress={handleSend}
          disabled={
            sendMessageMutation.isPending ||
            streamState.isStreaming ||
            !question.trim() ||
            !activePortfolioId
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: themeTokens.spacing.md,
    paddingBottom: 24,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: themeTokens.spacing.md,
    paddingVertical: themeTokens.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
    gap: 8,
  },
  conversationChipsContainer: {
    gap: 6,
    paddingRight: 16,
  },
  convChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.surface,
  },
  convChipActive: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.surfaceElevated,
  },
  convChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    maxWidth: 140,
  },
  convChipTextActive: {
    color: themeTokens.colors.primary,
    fontWeight: '600',
  },
  emptyContainer: {
    marginVertical: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  starterChipsContainer: {
    gap: 8,
  },
  starterChip: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.surfaceElevated,
  },
  starterChipText: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  messagesContainer: {
    gap: 12,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: themeTokens.colors.surfaceElevated,
    borderColor: themeTokens.colors.primary,
    maxWidth: '85%',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: themeTokens.colors.surface,
    borderColor: themeTokens.colors.border,
    maxWidth: '92%',
  },
  userSenderText: {
    fontSize: 11,
    fontWeight: '600',
    color: themeTokens.colors.primary,
    marginBottom: 4,
  },
  assistantSenderText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  messageContentText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  unsupportedBadge: {
    marginTop: 8,
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
  },
  unsupportedBadgeText: {
    fontSize: 11,
    color: '#eab308',
  },
  evidenceContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
  },
  evidenceSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  evidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themeTokens.colors.border,
  },
  evidenceLabelCol: {
    flex: 1,
    marginRight: 8,
  },
  evidenceLabelText: {
    fontSize: 11,
    color: colors.textPrimary,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  scopeText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  badgeHypo: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
  },
  badgeHypoText: {
    fontSize: 9,
    color: '#eab308',
    fontWeight: '600',
  },
  badgeHist: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  badgeHistText: {
    fontSize: 9,
    color: '#3b82f6',
    fontWeight: '600',
  },
  evidenceValueText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  limitationsContainer: {
    marginTop: 8,
    padding: 6,
    borderRadius: 6,
    backgroundColor: themeTokens.colors.surfaceElevated,
  },
  limitationsTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  limitationItem: {
    fontSize: 10,
    color: colors.textMuted,
  },
  loadingText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: themeTokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.surface,
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.surfaceElevated,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  scopeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: themeTokens.spacing.md,
    paddingVertical: 6,
    backgroundColor: themeTokens.colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
  },
  scopeBannerText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  clearScopeButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
  },
  clearScopeButtonText: {
    fontSize: 11,
    color: themeTokens.colors.primary,
  },
});

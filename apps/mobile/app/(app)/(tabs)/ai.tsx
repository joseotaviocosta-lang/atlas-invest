import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  themeTokens,
  mapToPortfolioAiExplanationVM,
  PortfolioAiExplanationVM,
  GroundedExplanationDto,
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

export default function AIScreen() {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [explanation, setExplanation] = useState<PortfolioAiExplanationVM | null>(null);
  const [selectedPortfolioId, _setSelectedPortfolioId] = useState<string | null>(null);

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

  const explainMutation = useMutation({
    mutationFn: async (q: string) => {
      if (!activePortfolioId) throw new Error('Selecione uma carteira');
      const response = await portfoliosApi.explainPortfolio(activePortfolioId, q);
      return response.data;
    },
    onSuccess: (dto) => {
      setExplanation(mapToPortfolioAiExplanationVM(dto as unknown as GroundedExplanationDto));
    },
  });

  const handleSelectPrompt = (prompt: string) => {
    setQuestion(prompt);
    if (activePortfolioId) {
      explainMutation.mutate(prompt);
    }
  };

  const handleSend = () => {
    if (!question.trim() || !activePortfolioId) return;
    explainMutation.mutate(question.trim());
  };

  return (
    <Screen>
      <Header
        title="Atlas IA"
        subtitle="Explicações factuais ancoradas no ledger (Fase 3R)"
        rightAction={{
          title: 'Perfil',
          onPress: () => router.push('/(app)/profile'),
        }}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Results Area */}
        {isLoadingPortfolios ? (
          <ActivityIndicator color={themeTokens.colors.primary} style={{ marginTop: 24 }} />
        ) : explainMutation.isPending ? (
          <Card>
            <ActivityIndicator color={themeTokens.colors.primary} style={{ marginVertical: 16 }} />
            <Text style={styles.loadingText}>
              Consultando fatos comprovados no motor analítico...
            </Text>
          </Card>
        ) : explainMutation.isError ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Indisponível</Text>
            <Text style={styles.errorText}>
              Não foi possível gerar a explicação agora. Tente novamente mais tarde.
            </Text>
          </Card>
        ) : explanation ? (
          <View style={styles.resultContainer}>
            {/* Answer Card */}
            <Card>
              <View style={styles.answerHeader}>
                <Text style={styles.assistantBadge}>✨ Atlas Copilot</Text>
                {explanation.isUnsupported && (
                  <View style={styles.unsupportedBadge}>
                    <Text style={styles.unsupportedBadgeText}>Não suportado</Text>
                  </View>
                )}
              </View>
              <Text style={styles.answerText}>{explanation.answer}</Text>
            </Card>

            {/* Evidence Section */}
            {explanation.hasEvidence && (
              <Card>
                <Text style={styles.sectionTitle}>Dados usados nesta resposta</Text>
                {explanation.evidence.map((ev) => (
                  <View key={ev.factId} style={styles.evidenceRow}>
                    <View style={styles.evidenceLabelCol}>
                      <Text style={styles.evidenceLabel}>{ev.label}</Text>
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
                    <Text style={styles.evidenceValue}>{ev.valueFormatted}</Text>
                  </View>
                ))}
              </Card>
            )}

            {/* Limitations Section */}
            {explanation.hasLimitations && (
              <Card style={styles.limitationsCard}>
                <Text style={styles.limitationsTitle}>Limitações dos dados:</Text>
                {explanation.limitations.map((lim, idx) => (
                  <Text key={idx} style={styles.limitationText}>
                    • {lim}
                  </Text>
                ))}
              </Card>
            )}
          </View>
        ) : (
          /* Welcome Card */
          <Card>
            <Text style={styles.cardTitle}>Pergunte sobre sua carteira</Text>
            <Text style={styles.cardText}>
              Olá! Sou o assistente factual do Project Atlas. Posso explicar o desempenho, risco
              histórico, comparações com benchmarks e cenários da sua carteira com base
              exclusivamente nos fatos comprovados do ledger.
            </Text>
          </Card>
        )}

        {/* Starter Questions */}
        <View style={styles.starterContainer}>
          <Text style={styles.starterTitle}>Sugestões de perguntas:</Text>
          <View style={styles.chipGrid}>
            {STARTER_QUESTIONS.map((q) => (
              <TouchableOpacity
                key={q}
                style={styles.chip}
                onPress={() => handleSelectPrompt(q)}
                disabled={explainMutation.isPending}
              >
                <Text style={styles.chipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Input Form */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Pergunte sobre rentabilidade ou risco..."
            placeholderTextColor={themeTokens.colors.textMuted}
            value={question}
            onChangeText={setQuestion}
            editable={!explainMutation.isPending}
          />
          <Button
            title={explainMutation.isPending ? 'Enviando...' : 'Enviar'}
            onPress={handleSend}
            disabled={explainMutation.isPending || !question.trim() || !activePortfolioId}
          />
        </View>

        <Text style={styles.footerNote}>
          Respostas estritamente ancoradas em fatos do ledger. Sem recomendações ou previsões.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: themeTokens.spacing.md,
    gap: themeTokens.spacing.md,
  },
  cardTitle: {
    color: themeTokens.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  cardText: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  loadingText: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorCard: {
    backgroundColor: '#381E1E',
    borderColor: '#9E3A3A',
  },
  errorTitle: {
    color: '#F87171',
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 4,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
  },
  resultContainer: {
    gap: themeTokens.spacing.sm,
  },
  answerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  assistantBadge: {
    color: themeTokens.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  unsupportedBadge: {
    backgroundColor: '#4D3800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  unsupportedBadgeText: {
    color: '#FCD34D',
    fontSize: 11,
    fontWeight: '600',
  },
  answerText: {
    color: themeTokens.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: themeTokens.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  evidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  evidenceLabelCol: {
    flex: 1,
    marginRight: 8,
  },
  evidenceLabel: {
    color: themeTokens.colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  scopeText: {
    color: themeTokens.colors.textMuted,
    fontSize: 11,
  },
  badgeHypo: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeHypoText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '600',
  },
  badgeHist: {
    backgroundColor: '#27272A',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeHistText: {
    color: '#A1A1AA',
    fontSize: 10,
    fontWeight: '600',
  },
  evidenceValue: {
    color: themeTokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  limitationsCard: {
    backgroundColor: '#1E293B',
  },
  limitationsTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  limitationText: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  starterContainer: {
    marginTop: 8,
  },
  starterTitle: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: themeTokens.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
  },
  chipText: {
    color: themeTokens.colors.text,
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  input: {
    flex: 1,
    backgroundColor: themeTokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: themeTokens.colors.text,
    fontSize: 13,
  },
  footerNote: {
    color: themeTokens.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginVertical: 8,
  },
});

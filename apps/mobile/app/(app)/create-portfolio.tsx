import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { themeTokens } from '@atlas/ui';
import { Screen, Header, Card, Button, TextField } from '../../src/components/ui';
import { portfoliosApi } from '../../src/api/portfolios';
import { ApiError } from '../../src/api/client';

export default function CreatePortfolioScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('BRL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string; baseCurrency: string }) =>
      portfoliosApi.createPortfolio(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      router.back();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrorMessage(error.message || 'Erro ao criar carteira.');
      } else {
        setErrorMessage('Erro ao criar carteira.');
      }
    },
  });

  const handleCreate = () => {
    setErrorMessage(null);
    if (!name.trim()) {
      setErrorMessage('Informe o nome da carteira.');
      return;
    }

    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      baseCurrency,
    });
  };

  return (
    <Screen scrollable>
      <Header title="Nova Carteira" subtitle="Organize seus ativos" onBack={() => router.back()} />
      <View style={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Dados da Carteira</Text>

          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <TextField
            label="Nome da Carteira"
            placeholder="Ex: Carteira Principal, Dividendos, Reserva..."
            value={name}
            onChangeText={setName}
            testID="portfolio-name-input"
          />

          <TextField
            label="Descricao (Opcional)"
            placeholder="Ex: Foco em longo prazo e renda passiva"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            testID="portfolio-desc-input"
          />

          <TextField
            label="Moeda Base"
            placeholder="BRL"
            value={baseCurrency}
            onChangeText={setBaseCurrency}
            autoCapitalize="characters"
            testID="portfolio-currency-input"
          />

          <Button
            title="Salvar Carteira"
            onPress={handleCreate}
            loading={mutation.isPending}
            testID="portfolio-save-button"
            style={styles.saveButton}
          />

          <Button
            title="Cancelar"
            onPress={() => router.back()}
            variant="ghost"
            style={styles.cancelButton}
          />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: themeTokens.spacing.md,
  },
  card: {
    padding: themeTokens.spacing.lg,
  },
  cardTitle: {
    color: themeTokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: themeTokens.spacing.md,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: themeTokens.colors.danger,
    borderWidth: 1,
    borderRadius: themeTokens.borderRadius.md,
    padding: themeTokens.spacing.sm,
    marginBottom: themeTokens.spacing.md,
  },
  errorText: {
    color: themeTokens.colors.danger,
    fontSize: 13,
  },
  saveButton: {
    marginTop: themeTokens.spacing.sm,
    width: '100%',
  },
  cancelButton: {
    marginTop: themeTokens.spacing.xs,
    width: '100%',
  },
});

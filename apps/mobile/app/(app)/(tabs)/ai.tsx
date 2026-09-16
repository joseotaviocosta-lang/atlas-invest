import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens } from '@atlas/ui';
import { Screen, Header, Card } from '../../../src/components/ui';

export default function AIScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Header
        title="Atlas IA"
        subtitle="Analises patrimoniais inteligentes"
        rightAction={{
          title: 'Perfil',
          onPress: () => router.push('/(app)/profile'),
        }}
      />
      <View style={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>Assistente Contextual de Investimentos</Text>
          <Text style={styles.cardText}>
            A inteligência artificial contextual analisará alocação de ativos, exposição cambial e
            teses de investimento com base exclusivamente no seu livro de transações.
          </Text>
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
});

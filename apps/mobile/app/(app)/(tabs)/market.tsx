import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens } from '@atlas/ui';
import { Screen, Header, Card } from '../../../src/components/ui';

export default function MarketScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Header
        title="Mercado"
        subtitle="Cotacoes e indices financeiros"
        rightAction={{
          title: 'Perfil',
          onPress: () => router.push('/(app)/profile'),
        }}
      />
      <View style={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>Mercado em Tempo Real</Text>
          <Text style={styles.cardText}>
            A integracao com dados da B3, cotacoes de acoes, FIIs, Tesouro Direto e indices
            macroeconomicos (IPCA, CDI, Selic) sera implementada na fase de Market Data.
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

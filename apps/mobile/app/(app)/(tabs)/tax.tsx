import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens } from '@atlas/ui';
import { Screen, Header, Card } from '../../../src/components/ui';

export default function TaxScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Header
        title="Fiscal"
        subtitle="Tributacao e apuracao de DARF"
        rightAction={{
          title: 'Perfil',
          onPress: () => router.push('/(app)/profile'),
        }}
      />
      <View style={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>Modulo Tributario</Text>
          <Text style={styles.cardText}>
            A apuracao automatica de ganho de capital, controle do limite de R$ 20.000 em operacoes
            comuns, compensacao de prejuizos acumulados e emissao de DARF serao integrados no Motor
            Fiscal.
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

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens } from '@atlas/ui';
import { Screen, Header, Card } from '../../../src/components/ui';
import { useAuthStore } from '../../../src/stores/auth.store';

export default function TodayScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const greeting = user?.name ? `Ola, ${user.name.split(' ')[0]}` : 'Ola, Investidor';

  return (
    <Screen>
      <Header
        title="Hoje"
        subtitle="Visao geral do seu dia"
        rightAction={{
          title: 'Perfil',
          onPress: () => router.push('/(app)/profile'),
        }}
      />
      <View style={styles.content}>
        <Card style={styles.welcomeCard}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.welcomeSub}>
            Bem-vindo ao Project Atlas. Aqui voce acompanhara as principais movimentacoes diarias da
            sua carteira.
          </Text>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Resumo do Dia</Text>
          <Text style={styles.placeholderText}>
            Nenhuma notificacao financeira pendente. O acompanhamento em tempo real de proventos e
            eventos corporativos sera ativado nas proximas fases.
          </Text>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Fechamento de Mercado</Text>
          <Text style={styles.placeholderText}>
            Ibovespa, CDI e taxas de cambio serao consolidados neste painel.
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
  welcomeCard: {
    backgroundColor: themeTokens.colors.surface,
    borderColor: themeTokens.colors.primary,
    borderWidth: 1,
  },
  greeting: {
    color: themeTokens.colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  welcomeSub: {
    color: themeTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    marginTop: themeTokens.spacing.xs,
  },
  sectionTitle: {
    color: themeTokens.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  placeholderText: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { themeTokens } from '@atlas/ui';
import { Screen, Header, Card, Button } from '../../../src/components/ui';
import { useAuthStore } from '../../../src/stores/auth.store';
import { reviewsApi } from '../../../src/api/reviews';

export default function TodayScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const greeting = user?.name ? `Ola, ${user.name.split(' ')[0]}` : 'Ola, Investidor';

  const { data: pendingData } = useQuery({
    queryKey: ['integration-reviews', 'count'],
    queryFn: () => reviewsApi.countPending(),
    staleTime: 60_000,
  });
  const pendingCount = pendingData?.data.pendingCount ?? 0;

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
          <Text style={styles.sectionTitle}>Pendências</Text>
          {pendingCount > 0 ? (
            <>
              <Text style={styles.attentionText}>
                {pendingCount === 1
                  ? '1 item precisa da sua atenção.'
                  : `${pendingCount} itens precisam da sua atenção.`}
              </Text>
              <Button
                title="Ver pendências"
                onPress={() => router.push('/(app)/reviews')}
                variant="primary"
                style={styles.actionButton}
              />
            </>
          ) : (
            <Text style={styles.placeholderText}>
              Nenhuma pendência no momento. Quando uma importação ou sincronização precisar da sua
              atenção, ela aparece aqui.
            </Text>
          )}
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
  attentionText: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 8,
  },
  actionButton: {
    marginTop: 4,
    minWidth: 180,
  },
});

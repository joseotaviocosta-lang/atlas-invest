import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens } from '@atlas/ui';
import { Screen, Header, Card, Button } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { authApi } from '../../src/api/auth';
import { clearQueryCache } from '../../src/lib/react-query';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await authApi.logout().catch(() => {});
    } finally {
      clearQueryCache();
      await logout();
      setLoggingOut(false);
      router.replace('/(auth)/login');
    }
  };

  return (
    <Screen scrollable>
      <Header
        title="Perfil"
        subtitle="Dados da conta e preferencias"
        onBack={() => router.back()}
      />

      <View style={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Dados do Investidor</Text>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Nome</Text>
            <Text style={styles.value}>{user?.name || 'N/A'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>E-mail</Text>
            <Text style={styles.value}>{user?.email || 'N/A'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Moeda Padrao</Text>
            <Text style={styles.value}>{user?.baseCurrency || 'BRL'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Fuso Horario</Text>
            <Text style={styles.value}>{user?.timezone || 'America/Sao_Paulo'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Idioma</Text>
            <Text style={styles.value}>{user?.locale || 'pt-BR'}</Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Sessao e Seguranca</Text>
          <Text style={styles.securityText}>
            Sua sessao esta protegida com tokens rotativos e armazenamento criptografado no hardware
            do seu dispositivo.
          </Text>

          <Button
            title="Sair da Conta (Logout)"
            variant="danger"
            onPress={handleLogout}
            loading={loggingOut}
            testID="logout-button"
            style={styles.logoutButton}
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
    marginBottom: themeTokens.spacing.md,
  },
  sectionTitle: {
    color: themeTokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: themeTokens.spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  label: {
    color: themeTokens.colors.textMuted,
    fontSize: 14,
  },
  value: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  securityText: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: themeTokens.spacing.md,
  },
  logoutButton: {
    width: '100%',
  },
});

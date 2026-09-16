import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens } from '@atlas/ui';
import { Screen, Button, TextField, PasswordField, Card } from '../../src/components/ui';
import { authApi } from '../../src/api/auth';
import { useAuthStore } from '../../src/stores/auth.store';
import { ApiError } from '../../src/api/client';

export default function LoginScreen() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMessage(null);
    if (!email || !password) {
      setErrorMessage('Preencha seu e-mail e sua senha.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.login({
        email: email.trim(),
        password,
      });

      await setSession(res.data.user, res.data.accessToken, res.data.refreshToken);
      router.replace('/(app)/(tabs)/today');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'AUTH.INVALID_CREDENTIALS') {
          setErrorMessage('E-mail ou senha incorretos.');
        } else if (error.isOffline) {
          setErrorMessage('Sem conexao com a internet. Tente novamente mais tarde.');
        } else {
          setErrorMessage(error.message || 'Erro ao realizar login.');
        }
      } else {
        setErrorMessage('Ocorreu um erro inesperado. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scrollable>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Project Atlas</Text>
          <Text style={styles.subtitle}>Gestao profissional de investimentos</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Entrar na sua conta</Text>

          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <TextField
            label="E-mail"
            placeholder="seu.email@exemplo.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="login-email-input"
          />

          <PasswordField
            label="Senha"
            placeholder="Sua senha secreta"
            value={password}
            onChangeText={setPassword}
            testID="login-password-input"
          />

          <TouchableOpacity
            onPress={() => router.push('/(auth)/forgot-password')}
            style={styles.forgotPassword}
          >
            <Text style={styles.linkText}>Esqueceu a senha?</Text>
          </TouchableOpacity>

          <Button
            title="Entrar"
            onPress={handleLogin}
            loading={loading}
            testID="login-submit-button"
            style={styles.submitButton}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Ainda nao possui uma conta? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.linkBold}>Cadastre-se</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: themeTokens.spacing.xl,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: themeTokens.spacing.xl,
  },
  title: {
    color: themeTokens.colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: themeTokens.colors.textMuted,
    fontSize: 14,
    marginTop: 6,
  },
  card: {
    padding: themeTokens.spacing.lg,
  },
  cardTitle: {
    color: themeTokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: themeTokens.spacing.lg,
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: themeTokens.spacing.lg,
  },
  linkText: {
    color: themeTokens.colors.primary,
    fontSize: 13,
  },
  submitButton: {
    width: '100%',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: themeTokens.spacing.xl,
  },
  footerText: {
    color: themeTokens.colors.textMuted,
    fontSize: 14,
  },
  linkBold: {
    color: themeTokens.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});

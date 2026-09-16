import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens } from '@atlas/ui';
import { Screen, Button, TextField, PasswordField, Card } from '../../src/components/ui';
import { authApi } from '../../src/api/auth';
import { useAuthStore } from '../../src/stores/auth.store';
import { ApiError } from '../../src/api/client';

export default function RegisterScreen() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRegister = async () => {
    setErrorMessage(null);

    if (!name.trim() || !email.trim() || !password) {
      setErrorMessage('Preencha todos os campos.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('As senhas digitadas nao coincidem.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('A senha deve possuir pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await authApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      // Automatically login after successful registration
      const loginRes = await authApi.login({
        email: email.trim(),
        password,
      });

      await setSession(loginRes.data.user, loginRes.data.accessToken, loginRes.data.refreshToken);
      router.replace('/(app)/(tabs)/today');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.statusCode === 409) {
          setErrorMessage('Este e-mail ja esta cadastrado no sistema.');
        } else if (error.isOffline) {
          setErrorMessage('Sem conexao com a internet.');
        } else {
          setErrorMessage(error.message || 'Erro ao registrar usuario.');
        }
      } else {
        setErrorMessage('Ocorreu um erro ao criar a conta.');
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
          <Text style={styles.subtitle}>Crie sua conta de investidor</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Cadastro</Text>

          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <TextField
            label="Nome completo"
            placeholder="Seu Nome"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            testID="register-name-input"
          />

          <TextField
            label="E-mail"
            placeholder="seu.email@exemplo.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="register-email-input"
          />

          <PasswordField
            label="Senha"
            placeholder="Minimo 8 caracteres"
            value={password}
            onChangeText={setPassword}
            testID="register-password-input"
          />

          <PasswordField
            label="Confirmar Senha"
            placeholder="Repita sua senha"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            testID="register-confirm-password-input"
          />

          <Button
            title="Criar Conta"
            onPress={handleRegister}
            loading={loading}
            testID="register-submit-button"
            style={styles.submitButton}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Ja possui uma conta? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.linkBold}>Fazer login</Text>
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
  submitButton: {
    width: '100%',
    marginTop: themeTokens.spacing.sm,
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

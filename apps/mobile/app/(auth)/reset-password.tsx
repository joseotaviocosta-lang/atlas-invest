import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens } from '@atlas/ui';
import { Screen, Button, TextField, PasswordField, Card } from '../../src/components/ui';
import { authApi } from '../../src/api/auth';
import { ApiError } from '../../src/api/client';

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleReset = async () => {
    setErrorMessage(null);

    if (!token.trim() || !newPassword) {
      setErrorMessage('Informe o token recebido e a nova senha.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('As senhas nao coincidem.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('A nova senha deve possuir pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({
        token: token.trim(),
        newPassword,
      });
      setSuccess(true);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'AUTH.INVALID_RESET_TOKEN') {
          setErrorMessage('Token de redefinicao invalido ou ja utilizado.');
        } else if (error.code === 'AUTH.RESET_TOKEN_EXPIRED') {
          setErrorMessage('Token de redefinicao expirado. Solicite um novo.');
        } else {
          setErrorMessage(error.message || 'Erro ao redefinir a senha.');
        }
      } else {
        setErrorMessage('Ocorreu um erro ao processar sua solicitacao.');
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
          <Text style={styles.subtitle}>Criar Nova Senha</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Redefinir Senha</Text>

          {success ? (
            <View style={styles.successContainer}>
              <Text style={styles.successText}>
                Sua senha foi redefinida com sucesso! Por seguranca, todas as sessoes anteriores
                foram desconectadas.
              </Text>
              <Button
                title="Ir para o Login"
                onPress={() => router.replace('/(auth)/login')}
                variant="primary"
                style={styles.submitButton}
              />
            </View>
          ) : (
            <>
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <TextField
                label="Token de Redefinicao"
                placeholder="Cole o token recebido"
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
                testID="reset-password-token-input"
              />

              <PasswordField
                label="Nova Senha"
                placeholder="Minimo 8 caracteres"
                value={newPassword}
                onChangeText={setNewPassword}
                testID="reset-password-new-input"
              />

              <PasswordField
                label="Confirmar Nova Senha"
                placeholder="Repita a nova senha"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                testID="reset-password-confirm-input"
              />

              <Button
                title="Salvar Nova Senha"
                onPress={handleReset}
                loading={loading}
                testID="reset-password-submit-button"
                style={styles.submitButton}
              />
            </>
          )}
        </Card>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.linkBold}>Voltar para o Login</Text>
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
  successContainer: {
    marginVertical: themeTokens.spacing.sm,
  },
  successText: {
    color: themeTokens.colors.success,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: themeTokens.spacing.lg,
  },
  submitButton: {
    width: '100%',
    marginTop: themeTokens.spacing.sm,
  },
  footer: {
    alignItems: 'center',
    marginTop: themeTokens.spacing.xl,
  },
  linkBold: {
    color: themeTokens.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});

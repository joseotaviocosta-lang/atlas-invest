import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { themeTokens } from '@atlas/ui';
import { Screen, Button, TextField, Card } from '../../src/components/ui';
import { authApi } from '../../src/api/auth';
import { ApiError } from '../../src/api/client';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMessage(null);
    if (!email.trim()) {
      setErrorMessage('Informe seu e-mail.');
      return;
    }

    setLoading(true);
    try {
      await authApi.forgotPassword({ email: email.trim() });
      setSubmitted(true);
    } catch (error) {
      if (error instanceof ApiError && error.isOffline) {
        setErrorMessage('Sem conexao com a internet.');
      } else {
        // Even on backend errors, generic message is preferred
        setSubmitted(true);
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
          <Text style={styles.subtitle}>Recuperacao de Acesso</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Esqueci minha senha</Text>

          {submitted ? (
            <View style={styles.successContainer}>
              <Text style={styles.successText}>
                Se o e-mail informado estiver cadastrado, voce recebera um codigo/link para
                redefinir sua senha.
              </Text>
              <Button
                title="Inserir Token de Redefinicao"
                onPress={() => router.push('/(auth)/reset-password')}
                variant="primary"
                style={styles.actionButton}
              />
              <Button
                title="Voltar para Login"
                onPress={() => router.push('/(auth)/login')}
                variant="secondary"
                style={styles.actionButton}
              />
            </View>
          ) : (
            <>
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <Text style={styles.instruction}>
                Digite o e-mail associado a sua conta para receber instrucoes de redefinicao de
                senha.
              </Text>

              <TextField
                label="E-mail"
                placeholder="seu.email@exemplo.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                testID="forgot-password-email-input"
              />

              <Button
                title="Enviar Instrucoes"
                onPress={handleSubmit}
                loading={loading}
                testID="forgot-password-submit-button"
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
    marginBottom: themeTokens.spacing.md,
  },
  instruction: {
    color: themeTokens.colors.textMuted,
    fontSize: 14,
    marginBottom: themeTokens.spacing.md,
    lineHeight: 20,
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
  actionButton: {
    width: '100%',
    marginBottom: themeTokens.spacing.sm,
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

import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { Input, PasswordInput, Button } from '../components/ui';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { getRuntimeConfig } from '../config/runtime';
import { ApiError } from '@atlas/api-client';

export const LoginRoute: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, isRestoring } = useAuth();
  const config = getRuntimeConfig();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // If already authenticated, redirect to /today immediately
  if (!isRestoring && isAuthenticated) {
    return <Navigate to="/today" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Preencha todos os campos.');
      return;
    }

    setIsLoading(true);
    try {
      await login({ email: trimmedEmail, password });
      navigate('/today', { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401 || err.code === 'AUTH.INVALID_CREDENTIALS') {
          setError('E-mail ou senha incorretos.');
        } else if (err.isOffline || err.statusCode === 0) {
          setError('Erro de conexão. Verifique se o backend está em execução e tente novamente.');
        } else if (err.statusCode >= 500) {
          setError('O serviço está temporariamente indisponível. Tente novamente em instantes.');
        } else {
          setError(err.message || 'Falha ao realizar login. Tente novamente.');
        }
      } else if (err instanceof Error) {
        if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('offline')) {
          setError('Erro de conexão. Verifique sua rede e tente novamente.');
        } else {
          setError(err.message || 'Falha ao realizar login.');
        }
      } else {
        setError('Falha ao autenticar. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: colors.background,
        padding: spacing.xl,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: `${borderRadius.lg}px`,
              backgroundColor: colors.accent,
              color: '#FFFFFF',
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '1rem',
              boxShadow: '0 4px 12px rgba(10, 132, 255, 0.3)',
            }}
          >
            A
          </div>
          <h1
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '1.75rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: colors.textPrimary,
            }}
          >
            Atlas Desktop
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '0.875rem',
              color: colors.textSecondary,
            }}
          >
            Gestão inteligente de investimentos
          </p>
        </div>

        {/* Form Card */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.lg}px`,
            padding: '2rem',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
          }}
        >
          <h2
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: colors.textPrimary,
            }}
          >
            Entrar na sua conta
          </h2>
          <p
            style={{
              margin: '0 0 1.5rem 0',
              fontSize: '0.875rem',
              color: colors.textSecondary,
            }}
          >
            Acesse seus investimentos com segurança nativa
          </p>

          {error && (
            <div
              role="alert"
              data-testid="login-error-alert"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${colors.negative}`,
                color: colors.negative,
                padding: '0.75rem',
                borderRadius: `${borderRadius.md}px`,
                fontSize: '0.875rem',
                marginBottom: '1.25rem',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Input
              label="E-mail"
              type="email"
              autoComplete="email"
              placeholder="investidor@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />

            <PasswordInput
              label="Senha"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />

            <Button
              type="submit"
              fullWidth
              isLoading={isLoading}
              style={{ marginTop: '0.75rem' }}
            >
              Entrar
            </Button>
          </form>

          {/* Connection Target Hint */}
          <div
            style={{
              marginTop: '1.5rem',
              paddingTop: '1rem',
              borderTop: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: colors.textMuted,
            }}
          >
            <span>Alvo da API:</span>
            <span style={{ fontFamily: 'monospace', color: colors.accent }}>
              {config.apiUrl}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

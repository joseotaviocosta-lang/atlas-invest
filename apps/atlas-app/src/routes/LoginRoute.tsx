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
        padding: spacing.md,
        paddingTop: 'calc(var(--sat, 0px) + 24px)',
        paddingBottom: 'calc(var(--sab, 0px) + 24px)',
        paddingLeft: 'calc(var(--sal, 0px) + 16px)',
        paddingRight: 'calc(var(--sar, 0px) + 16px)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box',
      }}
      data-testid="login-route"
    >
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
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
              marginBottom: '0.75rem',
              boxShadow: '0 4px 12px rgba(10, 132, 255, 0.3)',
            }}
          >
            A
          </div>
          <h1
            style={{
              margin: '0 0 0.25rem 0',
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
            padding: '1.75rem 1.5rem',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
          }}
        >
          <h2
            style={{
              margin: '0 0 0.375rem 0',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: colors.textPrimary,
            }}
          >
            Entrar na sua conta
          </h2>
          <p
            style={{
              margin: '0 0 1.25rem 0',
              fontSize: '0.8125rem',
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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
            <div>
              <Input
                label="E-mail"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="investidor@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <PasswordInput
                label="Senha"
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              style={{ width: '100%', minHeight: '48px', marginTop: `${spacing.xs}px` }}
              data-testid="login-submit-button"
            >
              Entrar
            </Button>
          </form>
        </div>

        {/* Footer info */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              color: colors.textSecondary,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: colors.positive,
              }}
            />
            {config.isTauri ? 'Dispositivo Instalado' : 'Ambiente Local'}
          </span>
        </div>
      </div>
    </div>
  );
};

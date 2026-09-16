'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Input, Button } from '@/components/ui';
import { themeTokens } from '@atlas/ui';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Token de recuperação não fornecido.');
      return;
    }

    if (!password || !confirmPassword) {
      setError('Preencha a nova senha.');
      return;
    }

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'AUTH.INVALID_RESET_TOKEN') {
          setError('Token de recuperação inválido ou expirado. Solicite uma nova recuperação.');
        } else {
          setError(data.message || 'Falha ao redefinir a senha.');
        }
        return;
      }

      setIsSuccess(true);
    } catch {
      setError('Erro de conexão. Tente novamente mais tarde.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h2
        style={{
          margin: '0 0 0.5rem 0',
          fontSize: '1.25rem',
          fontWeight: 600,
          color: themeTokens.colors.text,
        }}
      >
        Redefinir senha
      </h2>
      <p
        style={{
          margin: '0 0 1.5rem 0',
          fontSize: '0.875rem',
          color: themeTokens.colors.textMuted,
        }}
      >
        Crie uma nova senha segura para sua conta
      </p>

      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${themeTokens.colors.danger}`,
            color: themeTokens.colors.danger,
            padding: '0.75rem',
            borderRadius: `${themeTokens.borderRadius.md}px`,
            fontSize: '0.875rem',
            marginBottom: '1.25rem',
          }}
        >
          {error}
        </div>
      )}

      {isSuccess ? (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: themeTokens.colors.success,
              fontSize: '1.5rem',
              marginBottom: '1rem',
            }}
          >
            ✓
          </div>
          <p
            style={{
              fontSize: '0.9375rem',
              color: themeTokens.colors.text,
              lineHeight: 1.5,
              marginBottom: '1.5rem',
            }}
          >
            Sua senha foi redefinida com sucesso! Todas as sessões anteriores foram revogadas por
            segurança.
          </p>
          <Link href="/login">
            <Button fullWidth>Ir para o login</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {!tokenFromUrl && (
            <Input
              label="Token de recuperação"
              type="text"
              placeholder="Cole seu token de recuperação"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={isLoading}
              required
            />
          )}

          <Input
            label="Nova senha"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
          />

          <Input
            label="Confirmar nova senha"
            type="password"
            placeholder="Repita a nova senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            required
          />

          <Button type="submit" fullWidth isLoading={isLoading} style={{ marginTop: '0.5rem' }}>
            Salvar nova senha
          </Button>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <Link
              href="/login"
              style={{
                fontSize: '0.875rem',
                color: themeTokens.colors.textMuted,
                textDecoration: 'none',
              }}
            >
              ← Voltar para o login
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div style={{ textAlign: 'center', padding: '2rem', color: themeTokens.colors.textMuted }}>
          Carregando...
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

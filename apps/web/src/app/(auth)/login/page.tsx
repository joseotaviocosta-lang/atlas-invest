'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input, Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { themeTokens } from '@atlas/ui';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/today';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setSession = useAuthStore((state) => state.setSession);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Preencha todos os campos.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'AUTH.INVALID_CREDENTIALS') {
          setError('E-mail ou senha incorretos.');
        } else {
          setError(data.message || 'Falha ao realizar login. Tente novamente.');
        }
        return;
      }

      setSession(data.data.user, data.data.accessToken);
      router.replace(redirectPath);
    } catch {
      setError('Erro de conexão. Verifique sua rede e tente novamente.');
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
        Entrar na sua conta
      </h2>
      <p
        style={{
          margin: '0 0 1.5rem 0',
          fontSize: '0.875rem',
          color: themeTokens.colors.textMuted,
        }}
      >
        Acesse seus investimentos com segurança
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

        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          required
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
          <Link
            href="/forgot-password"
            style={{
              fontSize: '0.8125rem',
              color: themeTokens.colors.primary,
              textDecoration: 'none',
            }}
          >
            Esqueceu a senha?
          </Link>
        </div>

        <Button type="submit" fullWidth isLoading={isLoading}>
          Entrar
        </Button>
      </form>

      <div
        style={{
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: `1px solid ${themeTokens.colors.border}`,
          textAlign: 'center',
          fontSize: '0.875rem',
          color: themeTokens.colors.textMuted,
        }}
      >
        Não tem uma conta?{' '}
        <Link
          href="/register"
          style={{
            color: themeTokens.colors.primary,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Cadastre-se gratuitamente
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ textAlign: 'center', padding: '2rem', color: themeTokens.colors.textMuted }}>
          Carregando...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

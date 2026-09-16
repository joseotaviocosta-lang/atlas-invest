'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input, Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { themeTokens } from '@atlas/ui';

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setSession = useAuthStore((state) => state.setSession);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password || !confirmPassword) {
      setError('Preencha todos os campos.');
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError('Este e-mail já está em uso.');
        } else {
          setError(data.message || 'Falha ao criar conta. Tente novamente.');
        }
        return;
      }

      if (data?.data?.user && data?.data?.accessToken) {
        setSession(data.data.user, data.data.accessToken);
        router.replace('/today');
      } else {
        router.replace('/login');
      }
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
        Crie sua conta
      </h2>
      <p
        style={{
          margin: '0 0 1.5rem 0',
          fontSize: '0.875rem',
          color: themeTokens.colors.textMuted,
        }}
      >
        Comece a gerenciar seu patrimônio com inteligência
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
          label="Nome completo"
          type="text"
          autoComplete="name"
          placeholder="Seu Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          required
        />

        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="seu.email@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          required
        />

        <Input
          label="Senha"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          required
        />

        <Input
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          placeholder="Repita sua senha"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isLoading}
          required
        />

        <Button type="submit" fullWidth isLoading={isLoading} style={{ marginTop: '0.5rem' }}>
          Criar conta
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
        Já tem uma conta?{' '}
        <Link
          href="/login"
          style={{
            color: themeTokens.colors.primary,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Entrar
        </Link>
      </div>
    </div>
  );
}

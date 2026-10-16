'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Input, Button } from '@/components/ui';
import { themeTokens } from '@atlas/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('Por favor, informe seu e-mail.');
      return;
    }

    setIsLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      // Anti-enumeration: always display success state regardless of email existence
      setIsSubmitted(true);
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
        Recuperar senha
      </h2>
      <p
        style={{
          margin: '0 0 1rem 0',
          fontSize: '0.875rem',
          color: themeTokens.colors.textMuted,
        }}
      >
        Enviaremos um link para você redefinir sua senha
      </p>

      <div
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          color: themeTokens.colors.text,
          padding: '0.75rem 1rem',
          borderRadius: `${themeTokens.borderRadius.md}px`,
          fontSize: '0.8125rem',
          lineHeight: 1.45,
          marginBottom: '1.25rem',
        }}
      >
        <strong>Aviso Operacional:</strong> O envio automático por e-mail (SMTP) está planejado para
        a fase pós-MVP. Durante o uso remoto pelo titular, a recuperação e redefinição de acesso
        podem ser efetuadas via CLI administrativa no servidor.
      </div>

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

      {isSubmitted ? (
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
            Se o e-mail <strong>{email}</strong> estiver cadastrado em nossa base, você receberá as
            instruções para redefinir sua senha em instantes.
          </p>
          <Link
            href="/login"
            style={{
              color: themeTokens.colors.primary,
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <Input
            label="E-mail cadastrado"
            type="email"
            autoComplete="email"
            placeholder="seu.email@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
          />

          <Button type="submit" fullWidth isLoading={isLoading} style={{ marginTop: '0.5rem' }}>
            Enviar instruções
          </Button>

          <div
            style={{
              marginTop: '1.5rem',
              textAlign: 'center',
            }}
          >
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

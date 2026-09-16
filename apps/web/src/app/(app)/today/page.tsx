'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Button, Badge } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { themeTokens } from '@atlas/ui';

export default function TodayPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header Greeting */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.75rem',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 0.375rem 0',
              fontSize: '1.75rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              letterSpacing: '-0.02em',
            }}
          >
            Hoje
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: themeTokens.colors.textMuted }}>
            {user ? `Bem-vindo de volta, ${user.name}` : 'Visão geral do seu dia no mercado'}
          </p>
        </div>

        <Link href="/portfolio">
          <Button variant="primary">Minhas Carteiras →</Button>
        </Link>
      </div>

      {/* Grid of Overview Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: themeTokens.colors.textMuted,
              }}
            >
              PATRIMÔNIO CONSOLIDADO
            </span>
            <Badge variant="primary">ESTRUTURAL</Badge>
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              marginBottom: '0.5rem',
            }}
          >
            R$ --
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
            Motores de rentabilidade e cálculo financeiro serão integrados nas fases subsequentes.
          </p>
        </Card>

        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: themeTokens.colors.textMuted,
              }}
            >
              MERCADO HOJE
            </span>
            <Badge variant="neutral">B3 / MACRO</Badge>
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              marginBottom: '0.5rem',
            }}
          >
            IBOV --
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
            Integração com feeds de cotações em tempo real programada para as próximas fases.
          </p>
        </Card>

        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: themeTokens.colors.textMuted,
              }}
            >
              PROVENTOS PREVISTOS
            </span>
            <Badge variant="success">DIVIDENDOS</Badge>
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              marginBottom: '0.5rem',
            }}
          >
            0 eventos
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
            Agenda de proventos e datas-com ativadas com o módulo de eventos corporativos.
          </p>
        </Card>
      </div>

      {/* Quick Access Section */}
      <Card>
        <h2
          style={{
            margin: '0 0 1rem 0',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: themeTokens.colors.text,
          }}
        >
          Primeiros Passos no Project Atlas
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#11161F',
              borderRadius: `${themeTokens.borderRadius.md}px`,
              border: `1px solid ${themeTokens.colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{ fontWeight: 600, fontSize: '0.875rem', color: themeTokens.colors.text }}
              >
                1. Crie sua carteira de investimentos
              </div>
              <div style={{ fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
                Organize seus ativos por tipo: Pessoal, Família, Empresa ou Simulação.
              </div>
            </div>
            <Link href="/portfolio">
              <Button variant="secondary">Ir para Carteiras</Button>
            </Link>
          </div>

          <div
            style={{
              padding: '1rem',
              backgroundColor: '#11161F',
              borderRadius: `${themeTokens.borderRadius.md}px`,
              border: `1px solid ${themeTokens.colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{ fontWeight: 600, fontSize: '0.875rem', color: themeTokens.colors.text }}
              >
                2. Verifique os módulos em desenvolvimento
              </div>
              <div style={{ fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
                Mercado, controle de DARF fiscal e Assistente IA estão estruturados.
              </div>
            </div>
            <Link href="/market">
              <Button variant="outline">Explorar</Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

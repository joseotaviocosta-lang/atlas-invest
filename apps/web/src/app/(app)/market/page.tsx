'use client';

import React from 'react';
import { Card, Badge } from '@/components/ui';
import { themeTokens } from '@atlas/ui';

export default function MarketPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1
          style={{
            margin: '0 0 0.375rem 0',
            fontSize: '1.75rem',
            fontWeight: 700,
            color: themeTokens.colors.text,
            letterSpacing: '-0.02em',
          }}
        >
          Mercado
        </h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color: themeTokens.colors.textMuted }}>
          Acompanhamento de cotações B3, índices macroeconômicos e moedas
        </p>
      </div>

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
              IBOVESPA
            </span>
            <Badge variant="neutral">ÍNDICE</Badge>
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              marginBottom: '0.5rem',
            }}
          >
            -- pts
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
            Feed de dados de mercado em tempo real planejado para Fase 2.
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
              TAXA SELIC
            </span>
            <Badge variant="neutral">MACRO</Badge>
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              marginBottom: '0.5rem',
            }}
          >
            -- % a.a.
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
            Indicadores oficiais do Banco Central (Bacen / SGS).
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
              DÓLAR COMERCIAL
            </span>
            <Badge variant="neutral">CÂMBIO</Badge>
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              marginBottom: '0.5rem',
            }}
          >
            R$ --
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
            Cotação PTAX e cotações spot multimoedas.
          </p>
        </Card>
      </div>

      <Card>
        <h3
          style={{
            margin: '0 0 0.5rem 0',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: themeTokens.colors.text,
          }}
        >
          Módulo de Mercado Estruturado
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: themeTokens.colors.textMuted,
            lineHeight: 1.6,
          }}
        >
          A camada estrutural da web está pronta para renderizar livros de ofertas, gráficos
          interativos e notícias financeiras assim que as integrações de provedores forem
          disponibilizadas.
        </p>
      </Card>
    </div>
  );
}

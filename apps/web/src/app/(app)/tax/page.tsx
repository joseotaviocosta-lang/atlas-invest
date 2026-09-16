'use client';

import React from 'react';
import { Card, Badge } from '@/components/ui';
import { themeTokens } from '@atlas/ui';

export default function TaxPage() {
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
          Fiscal & IRPF
        </h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color: themeTokens.colors.textMuted }}>
          Apuração mensal de DARF, controle de limites de isenção e declaração anual de IRPF
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
              DARF DO MÊS ATUAL
            </span>
            <Badge variant="success">EM DIA</Badge>
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              marginBottom: '0.5rem',
            }}
          >
            R$ 0,00
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
            Cálculo automático de DARF código 6015 (Swing Trade e Day Trade).
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
              LIMITE DE ISENÇÃO (AÇÕES)
            </span>
            <Badge variant="primary">R$ 20.000 / MÊS</Badge>
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              marginBottom: '0.5rem',
            }}
          >
            R$ 0,00 vendas
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
            Monitoramento de volume de alienação para manutenção da isenção legal.
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
              PREJUÍZOS A COMPENSAR
            </span>
            <Badge variant="neutral">HISTÓRICO</Badge>
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: themeTokens.colors.text,
              marginBottom: '0.5rem',
            }}
          >
            R$ 0,00
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
            Compensação automática de perdas passadas em meses futuros.
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
          Motor Fiscal em Preparação
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: themeTokens.colors.textMuted,
            lineHeight: 1.6,
          }}
        >
          O motor de apuração tributária (operações comuns 15%, Day Trade 20%, FIIs 20%) será
          introduzido no Tax Engine nas próximas fases, mantendo desacoplamento da interface web.
        </p>
      </Card>
    </div>
  );
}

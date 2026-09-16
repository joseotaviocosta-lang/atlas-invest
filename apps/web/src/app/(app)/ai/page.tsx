'use client';

import React, { useState } from 'react';
import { Card, Button, Input, Badge } from '@/components/ui';
import { themeTokens } from '@atlas/ui';

export default function AIPage() {
  const [prompt, setPrompt] = useState('');

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
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
          Assistente Inteligente (IA)
        </h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color: themeTokens.colors.textMuted }}>
          Análises contextuais de carteira, rebalanceamento e sínteses de relatórios
        </p>
      </div>

      <Card style={{ marginBottom: '1.5rem' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: `${themeTokens.borderRadius.md}px`,
              backgroundColor: 'rgba(10, 132, 255, 0.15)',
              color: themeTokens.colors.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
            }}
          >
            ✨
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 600,
                color: themeTokens.colors.text,
              }}
            >
              Atlas Copilot
            </h3>
            <div style={{ fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
              Modelos de linguagem conectados ao seu histórico seguro de posições
            </div>
          </div>
          <Badge variant="primary" style={{ marginLeft: 'auto' }}>
            EM BREVE
          </Badge>
        </div>

        <p
          style={{
            margin: '0 0 1.5rem 0',
            fontSize: '0.875rem',
            color: themeTokens.colors.textMuted,
            lineHeight: 1.6,
          }}
        >
          O módulo de IA fornecerá insights probabilísticos sobre sua exposição patrimonial,
          concentração setorial e alertas de governança corporativa sem armazenar dados financeiros
          em servidores de terceiros.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <Input
              placeholder="Ex: Como está a diversificação das minhas carteiras?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={true}
              style={{ marginBottom: 0 }}
            />
          </div>
          <Button disabled={true}>Perguntar</Button>
        </div>
      </Card>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { PageHeader, Card, Button, Input, Chip } from '@/components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';

const SUGGESTED_PROMPTS = [
  'Como está distribuída minha carteira?',
  'Quanto recebi de proventos no último ano?',
  'O que mudou nas cotações dos meus ativos hoje?',
  'Qual o impacto fiscal das vendas deste mês?',
];

export default function AIPage() {
  const [inputQuery, setInputQuery] = useState('');
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const handleSelectPrompt = (prompt: string) => {
    setInputQuery(prompt);
    setFeedbackNotice('O assistente de IA estará disponível com modelos locais e seguros na Fase de IA Contextual.');
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackNotice('O assistente de IA estará disponível com modelos locais e seguros na Fase de IA Contextual.');
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      <PageHeader
        title="IA Contextual"
        subtitle="Assistente de inteligência artificial conectado com segurança ao seu patrimônio"
      />

      {/* Chat Container */}
      <Card
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '480px',
          justifyContent: 'space-between',
          padding: `${spacing.base}px`,
        }}
      >
        {/* Chat History / Placeholder Message */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px`, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              gap: `${spacing.md}px`,
              alignItems: 'flex-start',
              padding: `${spacing.base}px`,
              backgroundColor: colors.surfaceElevated,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: `${borderRadius.pill}px`,
                backgroundColor: colors.accentSubtle,
                color: colors.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.875rem',
                flexShrink: 0,
              }}
            >
              ✨
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: colors.textPrimary, marginBottom: '4px' }}>
                Atlas Copilot
              </div>
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.5 }}>
                Olá! Sou o assistente contextual do Project Atlas. Quando ativado, responderei perguntas sobre
                suas posições, tributação, eventos de custódia e relatórios de mercado com precisão e
                privacidade integral dos seus dados.
              </div>
            </div>
          </div>

          {feedbackNotice && (
            <div
              role="alert"
              style={{
                padding: `${spacing.sm}px ${spacing.base}px`,
                borderRadius: `${borderRadius.md}px`,
                backgroundColor: colors.infoSubtle,
                border: `1px solid ${colors.info}`,
                color: colors.info,
                fontSize: '0.8125rem',
              }}
            >
              {feedbackNotice}
            </div>
          )}
        </div>

        {/* Suggested Prompts & Input Area */}
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: `${spacing.base}px`, marginTop: `${spacing.base}px` }}>
          <div style={{ marginBottom: `${spacing.sm}px` }}>
            <span style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: 500, marginBottom: '6px', display: 'block' }}>
              Sugestões de perguntas:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${spacing.xs}px` }}>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <Chip
                  key={prompt}
                  label={prompt}
                  onClick={() => handleSelectPrompt(prompt)}
                />
              ))}
            </div>
          </div>

          <form onSubmit={handleSend} style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Input
                placeholder="Pergunte sobre sua carteira, proventos ou tributação..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <Button type="submit" variant="primary">
              Enviar
            </Button>
          </form>
          <div style={{ fontSize: '0.6875rem', color: colors.textMuted, marginTop: '6px', textAlign: 'center' }}>
            A conexão com LLM seguro e Portfolio Engine será disponibilizada nas fases posteriores.
          </div>
        </div>
      </Card>
    </div>
  );
}

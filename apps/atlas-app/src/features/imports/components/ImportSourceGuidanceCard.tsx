import React, { useState } from 'react';
import { Card, Badge, Button } from '../../../components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';

export const ImportSourceGuidanceCard: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  const steps = [
    { num: '1', title: 'Selecionar Arquivo', desc: 'Arraste o arquivo oficial (.xlsx ou .csv)' },
    { num: '2', title: 'Preview & Validação', desc: 'Mapeamento automático de ativos e detecção de duplicidades' },
    { num: '3', title: 'Confirmação', desc: 'Você valida e autoriza a inserção no ledger' },
    { num: '4', title: 'Conciliação', desc: 'Posições e preços médios recalculados instantaneamente' },
  ];

  const formats = [
    {
      icon: '📊',
      name: 'Negociação B3 (.xlsx)',
      source: 'Área do Investidor B3',
      desc: 'Extrato de compras e vendas de ações, FIIs, ETFs e BDRs com preços unitários e taxas apuradas.',
      badge: 'Oficial B3',
    },
    {
      icon: '📋',
      name: 'Movimentação B3 (.xlsx)',
      source: 'Área do Investidor B3',
      desc: 'Histórico de eventos de custódia, proventos (dividendos e JCP), bonificações e direitos de subscrição.',
      badge: 'Oficial B3',
    },
    {
      icon: '📑',
      name: 'Relatório Anual B3 (.xlsx)',
      source: 'Informe de Rendimentos B3',
      desc: 'Posições consolidadas em 31/12 para estabelecimento de baseline de abertura de custódia.',
      badge: 'Baseline Anual',
    },
    {
      icon: '📄',
      name: 'Extrato CSV Atlas (.csv)',
      source: 'Planilhas Pessoais',
      desc: 'Arquivo delimitado por vírgula no formato canônico com data, ticker, operação, quantidade e preço.',
      badge: 'CSV Padronizado',
    },
  ];

  return (
    <Card
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.md}px`,
        padding: `${spacing.lg}px`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
          <span style={{ fontSize: '1.25rem' }}>🧭</span>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 600,
                color: colors.textPrimary,
              }}
            >
              Fluxo Seguro de Importação & Arquivos Suportados
            </h3>
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: '0.8125rem',
                color: colors.textSecondary,
              }}
            >
              O Atlas preserva seu ledger imutável: pré-visualize antes de confirmar qualquer integração
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? 'Ocultar Detalhes' : 'Ver Formatos Suportados'}
        </Button>
      </div>

      {/* 4-Step Progress Flow */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: `${spacing.sm}px`,
          marginTop: `${spacing.xs}px`,
        }}
      >
        {steps.map((s) => (
          <div
            key={s.num}
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceHover,
              border: `1px solid ${colors.border}`,
              display: 'flex',
              gap: `${spacing.sm}px`,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: `${colors.accent}20`,
                color: colors.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {s.num}
            </div>
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textPrimary }}>
                {s.title}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '2px', lineHeight: 1.3 }}>
                {s.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Expandable Formats Grid */}
      {isExpanded && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: `${spacing.md}px`,
            paddingTop: `${spacing.sm}px`,
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          {formats.map((f) => (
            <div
              key={f.name}
              style={{
                padding: `${spacing.md}px`,
                borderRadius: `${borderRadius.md}px`,
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.125rem' }}>{f.icon}</span>
                <Badge variant="neutral" style={{ fontSize: '0.6875rem' }}>
                  {f.badge}
                </Badge>
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                {f.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.accent, fontWeight: 500 }}>
                {f.source}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, lineHeight: 1.4 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

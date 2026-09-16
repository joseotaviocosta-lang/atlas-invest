'use client';

import React, { useState, useRef, useEffect } from 'react';
import { colors, borderRadius, spacing, shadows } from '@atlas/ui';

export interface PortfolioOption {
  id: string;
  name: string;
  type: string;
}

export interface PortfolioSwitcherProps {
  portfolios: PortfolioOption[];
  selectedPortfolioId: string | null;
  onSelectPortfolio: (id: string) => void;
  onCreatePortfolio?: () => void;
}

export function PortfolioSwitcher({
  portfolios,
  selectedPortfolioId,
  onSelectPortfolio,
  onCreatePortfolio,
}: PortfolioSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = portfolios.find((p) => p.id === selectedPortfolioId) || portfolios[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!portfolios.length) {
    return null;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.sm}px`,
          padding: '0.5rem 0.875rem',
          borderRadius: `${borderRadius.md}px`,
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          color: colors.textPrimary,
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.name || 'Selecionar Carteira'}
        </span>
        <span style={{ fontSize: '0.6875rem', color: colors.textMuted }}>▼</span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 40,
            minWidth: '220px',
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.md}px`,
            boxShadow: shadows.lg,
            padding: `${spacing.xs}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {portfolios.map((item) => {
            const isItemActive = item.id === selected?.id;
            return (
              <button
                key={item.id}
                role="option"
                aria-selected={isItemActive}
                type="button"
                onClick={() => {
                  onSelectPortfolio(item.id);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: `${borderRadius.sm}px`,
                  border: 'none',
                  backgroundColor: isItemActive ? colors.accentSubtle : 'transparent',
                  color: isItemActive ? colors.accent : colors.textPrimary,
                  fontSize: '0.8125rem',
                  fontWeight: isItemActive ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span>{item.name}</span>
                <span style={{ fontSize: '0.6875rem', color: colors.textMuted }}>{item.type}</span>
              </button>
            );
          })}

          {onCreatePortfolio && (
            <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: '4px', paddingTop: '4px' }}>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onCreatePortfolio();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: `${borderRadius.sm}px`,
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: colors.accent,
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                + Nova Carteira
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

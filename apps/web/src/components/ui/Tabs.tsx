'use client';

import React, { useRef } from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { BaseTabsProps } from '@atlas/ui';

export function Tabs({ tabs, activeTab, onTabChange }: BaseTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
      while (tabs[nextIndex]?.disabled) {
        nextIndex = (nextIndex + 1) % tabs.length;
      }
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      while (tabs[nextIndex]?.disabled) {
        nextIndex = (nextIndex - 1 + tabs.length) % tabs.length;
      }
    } else if (e.key === 'Home') {
      nextIndex = 0;
      while (tabs[nextIndex]?.disabled) {
        nextIndex++;
      }
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
      while (tabs[nextIndex]?.disabled) {
        nextIndex--;
      }
    } else {
      return;
    }

    e.preventDefault();
    const targetTab = tabs[nextIndex];
    if (targetTab && !targetTab.disabled) {
      onTabChange(targetTab.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: `${spacing.xs}px`,
        borderBottom: `1px solid ${colors.border}`,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        paddingBottom: '2px',
        marginBottom: `${spacing.base}px`,
      }}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            disabled={tab.disabled}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: isActive ? 600 : 500,
              color: tab.disabled ? colors.disabledText : isActive ? colors.accent : colors.textSecondary,
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: isActive ? `2px solid ${colors.accent}` : '2px solid transparent',
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              outline: 'none',
            }}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                style={{
                  fontSize: '0.6875rem',
                  padding: '1px 6px',
                  borderRadius: `${borderRadius.pill}px`,
                  backgroundColor: isActive ? colors.accentSubtle : colors.surfaceElevated,
                  color: isActive ? colors.accent : colors.textMuted,
                  fontWeight: 600,
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

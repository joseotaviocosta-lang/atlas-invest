import { describe, it, expect } from 'vitest';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  breakpoints,
  CANONICAL_NAV_ITEMS,
  PROFILE_NAV_ITEM,
  formatCurrency,
  formatPercentage,
  formatDate,
  themeTokens,
  UI_VERSION,
} from '@atlas/ui';

describe('Design System: Central Tokens & Invariants', () => {
  it('should export UI_VERSION >= 0.2.0', () => {
    expect(UI_VERSION).toBe('0.2.0');
  });

  it('should provide full semantic colors without raw generic color names', () => {
    expect(colors.background).toBe('#0B0E14');
    expect(colors.surface).toBe('#151A23');
    expect(colors.surfaceElevated).toBe('#1D2433');
    expect(colors.border).toBe('#232936');
    expect(colors.textPrimary).toBe('#F3F4F6');
    expect(colors.textSecondary).toBe('#9CA3AF');
    expect(colors.textMuted).toBe('#6B7280');
    expect(colors.accent).toBe('#0A84FF');
    expect(colors.positive).toBe('#10B981');
    expect(colors.negative).toBe('#EF4444');
    expect(colors.warning).toBe('#F59E0B');
    expect(colors.info).toBe('#38BDF8');
    expect(colors.disabled).toBe('#374151');
  });

  it('should define a monotonic spacing scale starting at 0', () => {
    const spacingValues = Object.values(spacing);
    expect(spacingValues[0]).toBe(0);
    for (let i = 1; i < spacingValues.length; i++) {
      expect(spacingValues[i]).toBeGreaterThan(spacingValues[i - 1]);
    }
  });

  it('should define standard typography scale with consistent properties', () => {
    const levels = [
      'display',
      'heading1',
      'heading2',
      'heading3',
      'body',
      'bodySmall',
      'label',
      'caption',
    ] as const;
    for (const level of levels) {
      expect(typography[level]).toBeDefined();
      expect(typeof typography[level].fontSize).toBe('number');
      expect(typeof typography[level].lineHeight).toBe('number');
      expect(typeof typography[level].fontWeight).toBe('string');
      expect(typography[level].fontSize).toBeGreaterThan(0);
    }
  });

  it('should define discrete radius and shadow levels', () => {
    expect(borderRadius.sm).toBe(4);
    expect(borderRadius.md).toBe(8);
    expect(borderRadius.lg).toBe(12);
    expect(borderRadius.pill).toBe(9999);

    expect(shadows.sm).toBeDefined();
    expect(shadows.md).toBeDefined();
    expect(shadows.lg).toBeDefined();
  });

  it('should define standard responsive breakpoints', () => {
    expect(breakpoints.mobile).toBe(0);
    expect(breakpoints.tablet).toBe(768);
    expect(breakpoints.desktop).toBe(1280);
  });

  it('should maintain backward compatibility with themeTokens', () => {
    expect(themeTokens.colors.primary).toBe(colors.accent);
    expect(themeTokens.colors.background).toBe(colors.background);
    expect(themeTokens.colors.surface).toBe(colors.surface);
    expect(themeTokens.colors.border).toBe(colors.border);
    expect(themeTokens.colors.text).toBe(colors.textPrimary);
  });
});

describe('Design System: Canonical Navigation Model', () => {
  it('should define the 5 canonical areas in exact logical order', () => {
    expect(CANONICAL_NAV_ITEMS).toHaveLength(5);
    const ids = CANONICAL_NAV_ITEMS.map((item) => item.id);
    expect(ids).toEqual(['today', 'portfolio', 'market', 'tax', 'ai']);

    const labels = CANONICAL_NAV_ITEMS.map((item) => item.label);
    expect(labels).toEqual(['Hoje', 'Carteira', 'Mercado', 'Fiscal', 'IA']);
  });

  it('should define profile navigation separately from bottom/main navigation items', () => {
    expect(PROFILE_NAV_ITEM.id).toBe('profile');
    expect(PROFILE_NAV_ITEM.path).toBe('/profile');
    expect(PROFILE_NAV_ITEM.label).toBe('Perfil');
  });
});

describe('Design System: Safe Financial Formatters', () => {
  describe('formatCurrency', () => {
    it('should format valid positive decimal strings into Brazilian Real format', () => {
      expect(formatCurrency('1250.50')).toBe('R$ 1.250,50');
      expect(formatCurrency('1000000.00')).toBe('R$ 1.000.000,00');
      expect(formatCurrency('0.00')).toBe('R$ 0,00');
      expect(formatCurrency('5.5')).toBe('R$ 5,50');
    });

    it('should format negative values with leading minus sign', () => {
      expect(formatCurrency('-450.25')).toBe('-R$ 450,25');
    });

    it('should return honest placeholder "—" for missing, empty or invalid values', () => {
      expect(formatCurrency(null)).toBe('—');
      expect(formatCurrency(undefined)).toBe('—');
      expect(formatCurrency('')).toBe('—');
      expect(formatCurrency('invalid-number')).toBe('—');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentages with comma as decimal separator', () => {
      expect(formatPercentage('12.34')).toBe('12,34%');
      expect(formatPercentage('-3.50')).toBe('-3,50%');
    });

    it('should support showSign option for positive numbers', () => {
      expect(formatPercentage('5.25', { showSign: true })).toBe('+5,25%');
      expect(formatPercentage('0.00', { showSign: true })).toBe('0,00%');
      expect(formatPercentage('-2.10', { showSign: true })).toBe('-2,10%');
    });

    it('should return honest placeholder "—" for null or empty values', () => {
      expect(formatPercentage(null)).toBe('—');
      expect(formatPercentage(undefined)).toBe('—');
      expect(formatPercentage('')).toBe('—');
    });
  });

  describe('formatDate', () => {
    it('should format valid dates into DD/MM/YYYY', () => {
      expect(formatDate('2026-09-16T12:00:00.000Z')).toBe('16/09/2026');
    });

    it('should return "—" for null or invalid dates', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate('invalid-date')).toBe('—');
    });
  });
});

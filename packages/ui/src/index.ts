export const UI_VERSION = '0.1.0';

/**
 * Shared color design tokens for Atlas dark/light theme.
 */
export const themeTokens = {
  colors: {
    primary: '#0A84FF',
    background: '#0B0E14',
    surface: '#151A23',
    border: '#232936',
    text: '#F3F4F6',
    textMuted: '#9CA3AF',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    full: 9999,
  },
} as const;

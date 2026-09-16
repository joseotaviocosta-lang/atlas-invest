/**
 * Semantic Color Tokens for Project Atlas.
 * Adheres strictly to the financial design principle:
 * Colors convey meaning (positive/negative/warning/info) rather than decoration.
 */
export const colors = {
  // Backgrounds & Surfaces
  background: '#0B0E14',
  surface: '#151A23',
  surfaceElevated: '#1D2433',
  surfaceHover: '#232B3C',

  // Borders
  border: '#232936',
  borderMuted: '#1B212D',
  borderFocus: '#0A84FF',

  // Text Hierarchy
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  textInverse: '#0B0E14',

  // Interactive Accent
  accent: '#0A84FF',
  accentHover: '#0070E0',
  accentSubtle: 'rgba(10, 132, 255, 0.15)',

  // Semantic Financial Feedback
  positive: '#10B981',
  positiveSubtle: 'rgba(16, 185, 129, 0.12)',
  negative: '#EF4444',
  negativeSubtle: 'rgba(239, 68, 68, 0.12)',
  warning: '#F59E0B',
  warningSubtle: 'rgba(245, 158, 11, 0.12)',
  info: '#38BDF8',
  infoSubtle: 'rgba(56, 189, 248, 0.12)',

  // Disabled State
  disabled: '#374151',
  disabledText: '#6B7280',
} as const;

export type ColorToken = keyof typeof colors;

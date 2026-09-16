/**
 * Canonical Spacing Scale for Project Atlas.
 * Strictly 4px base grid with fine-grained 2px micro-adjustment.
 */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
  massive: 64,
} as const;

export type SpacingLevel = keyof typeof spacing;

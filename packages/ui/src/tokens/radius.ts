/**
 * Border Radius Levels for Project Atlas.
 */
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
  full: 9999,
} as const;

export type RadiusLevel = keyof typeof borderRadius;

/**
 * Responsive Breakpoints for Project Atlas Web & Mobile.
 * Desktop: >= 1280px
 * Tablet: 768px - 1279px
 * Mobile / Narrow: < 768px
 */
export const breakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1280,
  wide: 1536,
} as const;

export const mediaQueries = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1279px)',
  desktop: '(min-width: 1280px)',
  tabletAndUp: '(min-width: 768px)',
} as const;

export type Breakpoint = keyof typeof breakpoints;

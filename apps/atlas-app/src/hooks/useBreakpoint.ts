import { useState, useEffect } from 'react';
import { breakpoints, type Breakpoint } from '@atlas/ui';

export interface BreakpointState {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const MOBILE_MAX_WIDTH = breakpoints.tablet - 1; // 767px
const TABLET_MAX_WIDTH = breakpoints.desktop - 1; // 1279px

function getBreakpoint(width: number): Breakpoint {
  if (width >= breakpoints.wide) return 'wide';
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.tablet) return 'tablet';
  return 'mobile';
}

export function useBreakpoint(): BreakpointState {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth;
    }
    return 1024; // Default to desktop/tablet in non-DOM/SSR
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const breakpoint = getBreakpoint(width);
  const isMobile = width <= MOBILE_MAX_WIDTH;
  const isTablet = width > MOBILE_MAX_WIDTH && width <= TABLET_MAX_WIDTH;
  const isDesktop = width >= breakpoints.desktop;

  return {
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
  };
}


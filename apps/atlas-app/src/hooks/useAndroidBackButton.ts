import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type BackHandler = () => boolean; // return true if handled (consumed), false otherwise
const backHandlerStack: BackHandler[] = [];

/**
 * Register a back handler (e.g. to close a modal or sheet).
 * Handlers run LIFO (last registered runs first).
 */
export function registerAndroidBackHandler(handler: BackHandler): () => void {
  backHandlerStack.push(handler);
  return () => {
    const idx = backHandlerStack.indexOf(handler);
    if (idx !== -1) {
      backHandlerStack.splice(idx, 1);
    }
  };
}

/**
 * Hook to manage Android back button integration.
 * Handles:
 * 1. Stack of modal / sheet dismissals
 * 2. Navigation from secondary tabs back to /today
 * 3. Default exit behavior when at /today root
 */
export function useAndroidBackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (e: PopStateEvent) => {
      // 1. If any modal/sheet back handler is registered, execute it first
      if (backHandlerStack.length > 0) {
        const topHandler = backHandlerStack[backHandlerStack.length - 1];
        if (topHandler) {
          const handled = topHandler();
          if (handled) {
            // Push state back so browser history does not navigate away prematurely
            window.history.pushState(null, '', window.location.href);
            e.preventDefault();
            return;
          }
        }
      }

      // 2. If at secondary tab, navigate back to /today
      const currentPath = locationRef.current.pathname;
      const isRoot = currentPath === '/' || currentPath === '/today' || currentPath === '/login';

      if (!isRoot) {
        e.preventDefault();
        navigate('/today', { replace: true });
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigate]);
}

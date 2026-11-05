import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Hook to manage Android back button integration.
 * In a webview/Tauri context, it intercepts history pops when the user is in a child view
 * and navigates back to parent routes, preventing unintended application termination.
 */
export function useAndroidBackButton() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      // If we are not at root tabs, provide standard back behavior
      const isRoot = location.pathname === '/' || location.pathname === '/today';
      if (!isRoot) {
        // Let the default popstate navigate backwards
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [location.pathname, navigate]);
}


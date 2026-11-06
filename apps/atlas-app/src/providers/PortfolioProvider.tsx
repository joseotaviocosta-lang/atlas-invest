import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { usePortfolios } from '../features/portfolio/hooks';
import type { PortfolioDto } from '../features/portfolio/types';
import { getRuntimeConfig } from '../config/runtime';
import { DEFAULT_LOCAL_OWNER_PORTFOLIO } from '../auth/local-owner';
import { useAuth } from './AuthProvider';

interface PortfolioContextValue {
  portfolios: PortfolioDto[];
  selectedPortfolio: PortfolioDto | null;
  selectedPortfolioId: string | null;
  setSelectedPortfolioId: (id: string) => void;
  isLoadingPortfolios: boolean;
  isErrorPortfolios: boolean;
  refetchPortfolios: () => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

const STORAGE_KEY = 'atlas.selected_portfolio_id';

export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  let isLocalOwner = false;
  try {
    const auth = useAuth();
    isLocalOwner = auth.runtimeMode === 'DESKTOP_LOCAL_OWNER';
  } catch {
    const config = getRuntimeConfig();
    isLocalOwner = config.runtimeMode === 'DESKTOP_LOCAL_OWNER';
  }

  const { data: rawPortfolios = [], isLoading, isError, refetch } = usePortfolios();

  const portfolios = useMemo(() => {
    if (Array.isArray(rawPortfolios) && rawPortfolios.length > 0) {
      return rawPortfolios;
    }
    // In local owner mode, provide deterministic local owner portfolio fallback
    if (isLocalOwner) {
      return [DEFAULT_LOCAL_OWNER_PORTFOLIO];
    }
    return [];
  }, [rawPortfolios, isLocalOwner]);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    }
    return null;
  });

  // Automatic selection logic
  useEffect(() => {
    if (portfolios.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }

    // If currently selected ID is valid, keep it
    const exists = portfolios.some((p) => p.id === selectedId);
    if (exists) return;

    // Default to the first available portfolio
    const firstId = portfolios[0]?.id;
    if (firstId) {
      setSelectedId(firstId);
      try {
        window.localStorage.setItem(STORAGE_KEY, firstId);
      } catch {
        // Safe preference failure
      }
    }
  }, [portfolios, selectedId]);

  const handleSelectPortfolio = (id: string) => {
    setSelectedId(id);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // Safe preference failure
      }
    }
  };

  const selectedPortfolio = useMemo(() => {
    return portfolios.find((p) => p.id === selectedId) ?? (portfolios[0] || null);
  }, [portfolios, selectedId]);

  const value: PortfolioContextValue = {
    portfolios,
    selectedPortfolio,
    selectedPortfolioId: selectedPortfolio?.id ?? null,
    setSelectedPortfolioId: handleSelectPortfolio,
    isLoadingPortfolios: isLoading,
    isErrorPortfolios: isError,
    refetchPortfolios: refetch,
  };

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
};

export function usePortfolio(): PortfolioContextValue {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
}

import React, { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/react-query';
import { AuthProvider } from './AuthProvider';
import { PortfolioProvider } from './PortfolioProvider';
import { NotificationProvider } from '../features/notifications';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export interface AppProvidersProps {
  children: ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PortfolioProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </PortfolioProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

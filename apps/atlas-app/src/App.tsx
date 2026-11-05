import React from 'react';
import { HashRouter, MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProviders } from './providers/AppProviders';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { LoginRoute } from './routes/LoginRoute';
import { AppLayout } from './layouts/AppLayout';
import { TodayRoute } from './routes/TodayRoute';
import { PortfolioRoute } from './routes/PortfolioRoute';
import { MarketRoute } from './routes/MarketRoute';
import { ImportRoute } from './routes/ImportRoute';
import { TaxRoute } from './routes/TaxRoute';
import { SettingsRoute } from './routes/SettingsRoute';
import { PlaceholderRoute } from './routes/PlaceholderRoute';

const RouterComponent = typeof window !== 'undefined' ? HashRouter : MemoryRouter;

export const App: React.FC = () => {
  return (
    <AppProviders>
      <RouterComponent>
        <Routes>
          {/* Public login route */}
          <Route path="/login" element={<LoginRoute />} />

          {/* Protected routes wrapped in ProtectedRoute and AppLayout */}
          <Route path="/" element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/today" replace />} />
              <Route path="today" element={<TodayRoute />} />
              <Route path="portfolio" element={<PortfolioRoute />} />
              <Route path="import" element={<ImportRoute />} />
              <Route path="market" element={<MarketRoute />} />
              <Route path="tax" element={<TaxRoute />} />
              <Route path="settings" element={<SettingsRoute />} />
              <Route
                path="ai"
                element={
                  <PlaceholderRoute
                    title="Assistente Atlas AI"
                    description="Análise contextualizada de investimentos e insights patrimoniais."
                  />
                }
              />
            </Route>
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </RouterComponent>
    </AppProviders>
  );
};

export default App;

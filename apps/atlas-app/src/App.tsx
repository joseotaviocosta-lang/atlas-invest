import React from 'react';
import { HashRouter, MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProviders } from './providers/AppProviders';
import { RootRoute } from './routes/RootRoute';

const RouterComponent = typeof window !== 'undefined' ? HashRouter : MemoryRouter;

export const App: React.FC = () => {
  return (
    <AppProviders>
      <RouterComponent>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RouterComponent>
    </AppProviders>
  );
};

export default App;

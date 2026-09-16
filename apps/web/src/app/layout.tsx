import type { Metadata } from 'next';
import React from 'react';
import { QueryProvider } from '@/providers/query-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'Project Atlas',
  description: 'Plataforma de gestão de investimentos para investidores brasileiros',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #0B0E14;
            color: #F3F4F6;
            min-height: 100vh;
          }
          a {
            color: inherit;
            text-decoration: none;
          }
        `}</style>
      </head>
      <body>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

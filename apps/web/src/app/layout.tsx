import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Project Atlas',
  description: 'Plataforma de gestão de investimentos para investidores brasileiros',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          backgroundColor: '#0B0E14',
          color: '#F3F4F6',
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}

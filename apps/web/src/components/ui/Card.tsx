'use client';

import React from 'react';
import { themeTokens } from '@atlas/ui';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, style, ...props }: CardProps) {
  return (
    <div
      style={{
        backgroundColor: themeTokens.colors.surface,
        border: `1px solid ${themeTokens.colors.border}`,
        borderRadius: `${themeTokens.borderRadius.lg}px`,
        padding: '1.5rem',
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

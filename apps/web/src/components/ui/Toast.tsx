'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { colors, borderRadius, spacing, shadows } from '@atlas/ui';
import { StatusVariant } from '@atlas/ui';

export interface ToastMessage {
  id: string;
  title?: string;
  message: string;
  variant: StatusVariant;
}

interface ToastContextType {
  showToast: (message: string, variant?: StatusVariant, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (message: string, variant: StatusVariant = 'info', title?: string) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, variant, title }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  const getBorderColor = (variant: StatusVariant) => {
    switch (variant) {
      case 'positive':
        return colors.positive;
      case 'negative':
        return colors.negative;
      case 'warning':
        return colors.warning;
      case 'info':
      default:
        return colors.info;
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: `${spacing.base}px`,
          right: `${spacing.base}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: `${spacing.xs}px`,
          zIndex: 100,
          maxWidth: '360px',
          width: 'calc(100% - 32px)',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            style={{
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${getBorderColor(toast.variant)}`,
              borderRadius: `${borderRadius.md}px`,
              padding: `${spacing.sm}px ${spacing.base}px`,
              boxShadow: shadows.lg,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              animation: 'fadeIn 0.2s ease-in-out',
            }}
          >
            {toast.title && (
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textPrimary }}>
                {toast.title}
              </span>
            )}
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {toast.message}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Return safe fallback if not wrapped
    return {
      showToast: (msg: string) => {
        if (typeof window !== 'undefined') console.debug('[Toast]:', msg);
      },
    };
  }
  return context;
}

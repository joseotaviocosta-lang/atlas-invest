'use client';

import React, { useEffect } from 'react';
import { themeTokens } from '@atlas/ui';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const modalRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);

      // Focus first element or modal itself
      requestAnimationFrame(() => {
        if (modalRef.current) {
          const first = modalRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          if (first) first.focus();
          else modalRef.current.focus();
        }
      });
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: themeTokens.colors.surface,
          border: `1px solid ${themeTokens.colors.border}`,
          borderRadius: `${themeTokens.borderRadius.lg}px`,
          width: '100%',
          maxWidth: '480px',
          padding: '1.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            borderBottom: `1px solid ${themeTokens.colors.border}`,
            paddingBottom: '0.75rem',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 600,
              color: themeTokens.colors.text,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: themeTokens.colors.textMuted,
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0.25rem',
            }}
          >
            &times;
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

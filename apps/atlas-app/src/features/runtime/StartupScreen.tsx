import React from 'react';
import { colors } from '@atlas/ui';
import { RuntimeStatus } from './types';

interface StartupScreenProps {
  status: RuntimeStatus;
}

export const StartupScreen: React.FC<StartupScreenProps> = ({ status }) => {
  const isPostgresDone = status.postgres === 'running';
  const isApiDone = status.api === 'ready';

  return (
    <div
      data-testid="desktop-startup-screen"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: colors.background,
        color: colors.textPrimary,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '2rem',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: colors.surface,
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          padding: '2.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: colors.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.25rem',
              color: '#000',
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
              Project Atlas
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
              Desktop Pessoal • Runtime Local
            </div>
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: '1.125rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
            textAlign: 'center',
          }}
        >
          Iniciando Atlas...
        </div>

        <div
          style={{
            fontSize: '0.875rem',
            color: colors.textSecondary,
            marginBottom: '2rem',
            textAlign: 'center',
          }}
        >
          {status.message || 'Preparando ambiente de trabalho local'}
        </div>

        {/* Step Progression Indicators */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          <StepItem
            label="Banco de dados local (PostgreSQL 18)"
            isDone={isPostgresDone}
            isActive={status.postgres === 'starting' || status.postgres === 'checking'}
          />
          <StepItem
            label="Serviço de dados local (Atlas API)"
            isDone={isApiDone}
            isActive={status.api === 'starting' || status.api === 'checking'}
          />
          <StepItem
            label="Estrutura e integridade patrimonial"
            isDone={status.overall === 'ready'}
            isActive={status.overall === 'starting' && isPostgresDone && status.api === 'starting'}
          />
        </div>

        {/* Spinner */}
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: `3px solid ${colors.surfaceElevated}`,
            borderTopColor: colors.accent,
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

const StepItem: React.FC<{ label: string; isDone: boolean; isActive: boolean }> = ({
  label,
  isDone,
  isActive,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 0.75rem',
        borderRadius: '6px',
        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
      }}
    >
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 700,
          backgroundColor: isDone
            ? colors.positive
            : isActive
            ? colors.accent
            : colors.surfaceElevated,
          color: isDone || isActive ? '#000' : colors.textSecondary,
          transition: 'all 0.3s ease',
        }}
      >
        {isDone ? '✓' : isActive ? '●' : '○'}
      </div>
      <div
        style={{
          fontSize: '0.875rem',
          color: isDone ? colors.textPrimary : isActive ? colors.textPrimary : colors.textSecondary,
          fontWeight: isActive ? 500 : 400,
        }}
      >
        {label}
      </div>
    </div>
  );
};


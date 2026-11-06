import React, { useState } from 'react';
import { colors } from '@atlas/ui';
import { RuntimeStatus, RuntimeDiagnostics } from './types';

interface DiagnosticScreenProps {
  error: string;
  status: RuntimeStatus;
  diagnostics: RuntimeDiagnostics | null;
  onRetry: () => void;
}

export const DiagnosticScreen: React.FC<DiagnosticScreenProps> = ({
  error,
  status,
  diagnostics,
  onRetry,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullReport = JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      error,
      status,
      diagnostics,
    },
    null,
    2
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard write failure
    }
  };

  const handleDownload = () => {
    const blob = new Blob([fullReport], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atlas-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      data-testid="desktop-diagnostic-screen"
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
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: colors.surface,
          borderRadius: '12px',
          border: `1px solid ${colors.negative}`,
          padding: '2rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: colors.negative,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 700,
            }}
          >
            !
          </div>
          <div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>
              Não foi possível iniciar o serviço local do Atlas
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Falha de inicialização no ambiente autônomo local
            </div>
          </div>
        </div>

        {/* Diagnostic Error Box */}
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            padding: '1rem',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            color: '#f87171',
            marginBottom: '1.5rem',
            wordBreak: 'break-word',
          }}
        >
          {error}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button
            onClick={onRetry}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              backgroundColor: colors.accent,
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Tentar Novamente
          </button>
          <button
            onClick={handleCopy}
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            {copied ? 'Copiado!' : 'Copiar Diagnóstico'}
          </button>
          <button
            onClick={handleDownload}
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Salvar Relatório
          </button>
        </div>

        {/* Toggle technical details */}
        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: 'none',
              border: 'none',
              color: colors.textSecondary,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            {showDetails ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos e logs'}
          </button>

          {showDetails && (
            <pre
              style={{
                marginTop: '1rem',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                padding: '1rem',
                fontSize: '0.75rem',
                maxHeight: '200px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: colors.textSecondary,
              }}
            >
              {fullReport}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};


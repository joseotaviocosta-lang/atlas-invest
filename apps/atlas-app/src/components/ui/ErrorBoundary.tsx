import { Component, type ErrorInfo, type ReactNode } from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { recordDiagnosticError, exportDiagnostics } from '../../lib/diagnostics';
import { Button } from './Button';
import { Card } from './Card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  exportStatus: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    exportStatus: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, exportStatus: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    recordDiagnosticError(error, errorInfo.componentStack || undefined);
    // Log sanitized error in console
    console.error('[Atlas ErrorBoundary Caught Crash]:', error.message);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, exportStatus: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleExport = async () => {
    try {
      this.setState({ exportStatus: 'Exportando...' });
      const res = await exportDiagnostics();
      if (res.mode === 'download') {
        this.setState({ exportStatus: 'Arquivo de diagnóstico gerado!' });
      } else {
        this.setState({ exportStatus: 'Copiado para a área de transferência!' });
      }
    } catch {
      this.setState({ exportStatus: 'Falha ao exportar diagnóstico.' });
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.background,
            color: colors.textPrimary,
            padding: spacing.xl,
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          <Card
            style={{
              maxWidth: 520,
              width: '100%',
              padding: spacing.xl,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              borderRadius: borderRadius.md,
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <span style={{ fontSize: '1.75rem' }}>⚠️</span>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: colors.textPrimary }}>
                  O Atlas encontrou um erro inesperado
                </h1>
              </div>

              <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0, lineHeight: 1.5 }}>
                Ocorreu uma falha inesperada durante a execução da aplicação. Seus dados e transações
                armazenados no dispositivo permanecem preservados com segurança.
              </p>

              {this.state.error && (
                <div
                  style={{
                    padding: spacing.sm,
                    backgroundColor: colors.surfaceHover,
                    border: `1px solid ${colors.border}`,
                    borderRadius: borderRadius.sm,
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    color: colors.negative,
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {this.state.error.message}
                </div>
              )}

              {this.state.exportStatus && (
                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: colors.accent,
                    fontWeight: 500,
                  }}
                >
                  {this.state.exportStatus}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: spacing.sm,
                  marginTop: spacing.sm,
                  flexWrap: 'wrap',
                }}
              >
                <Button variant="primary" onClick={this.handleRetry} style={{ flex: 1 }}>
                  Tentar novamente
                </Button>
                <Button variant="secondary" onClick={this.handleExport} style={{ flex: 1 }}>
                  Exportar diagnóstico
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

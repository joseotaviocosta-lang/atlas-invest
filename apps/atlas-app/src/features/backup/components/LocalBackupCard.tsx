import React, { useState } from 'react';
import { Card, Button, Badge } from '../../../components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { useBackupStatus, useCreateBackup } from '../hooks';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export const LocalBackupCard: React.FC = () => {
  const { data: status, isLoading, isError, refetch } = useBackupStatus();
  const createBackupMutation = useCreateBackup();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCreateBackup = async () => {
    setSuccessMessage(null);
    try {
      const res = await createBackupMutation.mutateAsync();
      setSuccessMessage(
        `Backup criado com sucesso: ${res.result.sizeBytes ? formatBytes(res.result.sizeBytes) : 'OK'} (SHA-256 verificado)`,
      );
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch {
      // Error handled by react-query / mutation state
    }
  };

  const last = status?.lastBackup;

  return (
    <Card
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.md}px`,
        padding: `${spacing.lg}px`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
          <span style={{ fontSize: '1.25rem' }}>💾</span>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 600,
                color: colors.textPrimary,
              }}
            >
              Backup Local do Banco de Dados
            </h3>
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: '0.8125rem',
                color: colors.textSecondary,
              }}
            >
              Dump lógico verificado com integridade criptográfica SHA-256
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={handleCreateBackup}
          disabled={createBackupMutation.isPending}
        >
          {createBackupMutation.isPending ? 'Criando Backup...' : 'Criar Backup Agora'}
        </Button>
      </div>

      {successMessage && (
        <div
          style={{
            padding: `${spacing.sm}px ${spacing.md}px`,
            borderRadius: `${borderRadius.sm}px`,
            backgroundColor: `${colors.positive}15`,
            border: `1px solid ${colors.positive}40`,
            color: colors.positive,
            fontSize: '0.8125rem',
            fontWeight: 500,
          }}
        >
          ✓ {successMessage}
        </div>
      )}

      {createBackupMutation.isError && (
        <div
          style={{
            padding: `${spacing.sm}px ${spacing.md}px`,
            borderRadius: `${borderRadius.sm}px`,
            backgroundColor: `${colors.negative}15`,
            border: `1px solid ${colors.negative}40`,
            color: colors.negative,
            fontSize: '0.8125rem',
          }}
        >
          Falha ao gerar backup: {(createBackupMutation.error as Error)?.message || 'Erro desconhecido'}
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: `${spacing.md}px 0`, color: colors.textSecondary, fontSize: '0.875rem' }}>
          Consultando backups locais...
        </div>
      ) : isError ? (
        <div style={{ padding: `${spacing.md}px 0`, color: colors.textSecondary, fontSize: '0.875rem' }}>
          Não foi possível carregar o status dos backups.{' '}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: `${spacing.md}px`,
            marginTop: `${spacing.xs}px`,
          }}
        >
          <div
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceHover,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginBottom: '4px' }}>
              Último Backup
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary }}>
              {last ? formatDate(last.createdAt) : 'Nenhum backup registrado'}
            </div>
            {last && (
              <div style={{ marginTop: '6px' }}>
                <Badge variant={last.checksumValid !== false ? 'positive' : 'warning'}>
                  {last.checksumValid !== false ? 'SHA-256 Verificado' : 'Checksum Pendente'}
                </Badge>
              </div>
            )}
          </div>

          <div
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceHover,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginBottom: '4px' }}>
              Tamanho do Último Dump
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary }}>
              {last ? formatBytes(last.sizeBytes) : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '6px' }}>
              Total de backups guardados: {status?.totalBackups ?? 0}
            </div>
          </div>

          <div
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceHover,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginBottom: '4px' }}>
              Diretório de Armazenamento
            </div>
            <div
              style={{
                fontSize: '0.8125rem',
                fontFamily: 'monospace',
                color: colors.textPrimary,
                wordBreak: 'break-all',
              }}
            >
              {status?.backupDir || 'backups/'}
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '6px' }}>
              Retenção: 7 diários • 4 semanais • 3 mensais
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

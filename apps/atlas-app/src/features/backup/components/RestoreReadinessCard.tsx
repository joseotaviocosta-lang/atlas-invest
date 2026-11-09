import React from 'react';
import { Card, Badge } from '../../../components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { useBackupStatus } from '../hooks';

export const RestoreReadinessCard: React.FC = () => {
  const { data: status } = useBackupStatus();
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
      <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
        <span style={{ fontSize: '1.25rem' }}>🛡️</span>
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '1rem',
              fontWeight: 600,
              color: colors.textPrimary,
            }}
          >
            Prontidão de Recuperação (Restore Readiness)
          </h3>
          <p
            style={{
              margin: '2px 0 0 0',
              fontSize: '0.8125rem',
              color: colors.textSecondary,
            }}
          >
            Procedimento seguro de restauração do banco de dados local
          </p>
        </div>
      </div>

      <div
        style={{
          padding: `${spacing.md}px`,
          borderRadius: `${borderRadius.md}px`,
          backgroundColor: colors.surfaceHover,
          border: `1px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: `${spacing.sm}px`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
            Último Snapshot Válido Disponível
          </span>
          <Badge variant={last ? 'positive' : 'neutral'}>
            {last ? 'Pronto para Contingência' : 'Nenhum Dump Encontrado'}
          </Badge>
        </div>
        {last ? (
          <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, fontFamily: 'monospace' }}>
            {last.filename}
          </div>
        ) : (
          <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
            Gere um backup manual ou aguarde a primeira sincronização para habilitar a restauração rápida.
          </div>
        )}
      </div>

      <div
        style={{
          padding: `${spacing.md}px`,
          borderRadius: `${borderRadius.md}px`,
          backgroundColor: `${colors.info}10`,
          border: `1px solid ${colors.info}30`,
          fontSize: '0.8125rem',
          color: colors.textSecondary,
          lineHeight: '1.5',
        }}
      >
        <strong style={{ color: colors.textPrimary, display: 'block', marginBottom: '4px' }}>
          Procedimento de Recuperação Segura (Fail-Safe Restore):
        </strong>
        1. Em caso de contingência, execute sempre um backup de segurança preliminar antes de restaurar.
        <br />
        2. A restauração não é disparada automaticamente na interface para evitar sobrescrita acidental do ledger.
        <br />
        3. Para restaurar o snapshot via linha de comando local:
        <pre
          style={{
            margin: '8px 0 0 0',
            padding: '8px',
            backgroundColor: colors.surface,
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            overflowX: 'auto',
            color: colors.textPrimary,
          }}
        >
          {`psql -h 127.0.0.1 -p 5434 -U atlas -d atlas_local < "${last?.filePath || 'backups\\<arquivo>.sql'}"`}
        </pre>
      </div>
    </Card>
  );
};

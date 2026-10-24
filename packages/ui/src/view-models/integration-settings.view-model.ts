/**
 * Phase 5P-C — integration settings presentation (pure, shared).
 *
 * Human pt-BR copy for the settings read model. Status is always paired
 * with a text label, never color alone. Timezone labels stay human
 * ("Horário de Brasília") while the IANA value travels with the data.
 * No I/O, no floats, no network, no secrets.
 */

export type IntegrationSettingsTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface IntegrationSettingsStatusPresentation {
  label: string;
  tone: IntegrationSettingsTone;
  description: string;
}

const STATUS_COPY: Record<string, IntegrationSettingsStatusPresentation> = {
  PREPARING: {
    label: 'Em preparação',
    tone: 'neutral',
    description: 'A integração ainda não está disponível. Nada será sincronizado.',
  },
  UNAVAILABLE: {
    label: 'Indisponível',
    tone: 'neutral',
    description: 'Esta integração está desativada no momento.',
  },
  NEEDS_REAUTH: {
    label: 'Nova autorização necessária',
    tone: 'warning',
    description: 'A autorização expirou ou foi revogada. Autorize novamente para continuar.',
  },
  SYNCING: {
    label: 'Sincronizando',
    tone: 'info',
    description: 'Uma sincronização está em andamento agora.',
  },
  SYNC_ERROR: {
    label: 'Erro na sincronização',
    tone: 'danger',
    description: 'A última tentativa não foi concluída. Verifique os detalhes.',
  },
  SYNC_PARTIAL: {
    label: 'Sincronização parcial',
    tone: 'warning',
    description: 'Alguns dados não puderam ser obtidos. Verifique os detalhes.',
  },
  PENDING_REVIEW: {
    label: 'Aguardando revisão',
    tone: 'warning',
    description: 'Há itens aguardando sua revisão antes de importar.',
  },
  SCHEDULED_ACTIVE: {
    label: 'Sincronização automática ativa',
    tone: 'success',
    description: 'Novas coletas acontecem no horário agendado.',
  },
  SCHEDULED_PAUSED: {
    label: 'Sincronização automática pausada',
    tone: 'neutral',
    description: 'Nenhuma coleta automática acontecerá até reativar.',
  },
  READY: {
    label: 'Pronto para sincronizar',
    tone: 'info',
    description: 'Configure uma agenda para começar as coletas automáticas.',
  },
  NOT_CONNECTED: {
    label: 'Não conectado',
    tone: 'neutral',
    description: 'Conecte a fonte antes de agendar sincronizações.',
  },
  AWAITING_AUTHORIZATION: {
    label: 'Aguardando autorização',
    tone: 'info',
    description: 'Conclua a autorização para ativar a sincronização.',
  },
};

export function describeIntegrationStatus(status: string): IntegrationSettingsStatusPresentation {
  return (
    STATUS_COPY[status] ?? {
      label: 'Estado desconhecido',
      tone: 'neutral' as const,
      description: 'Não foi possível determinar o estado da integração.',
    }
  );
}

/**
 * Friendly timezone label. The IANA value travels with the data (server
 * truth); this only changes what the investor reads.
 */
export function describeIntegrationTimezone(timezone: string): string {
  if (timezone === 'America/Sao_Paulo') return 'Horário de Brasília';
  return timezone;
}

export function describeIntegrationAvailability(availability: string): string {
  if (availability === 'AVAILABLE') return 'Disponível';
  if (availability === 'UNAVAILABLE') return 'Indisponível';
  return 'Em preparação';
}

export function describeIntegrationConnection(connection: string): string {
  if (connection === 'AUTHORIZED') return 'Conectada (simulação)';
  if (connection === 'NEEDS_REAUTH') return 'Autorização necessária';
  if (connection === 'AWAITING_AUTHORIZATION') return 'Aguardando autorização';
  return 'Não conectada';
}

/**
 * Phase 5P-D — shared connection contract for product surfaces (STEP 39).
 *
 * Label/tone/description plus the single primary action the surface should
 * offer. Timestamps travel separately (server ISO strings); no tokens or
 * external ids ever enter this contract.
 */
export type IntegrationConnectionAction = 'CONNECT' | 'CONTINUE_AUTHORIZATION' | 'RECONNECT';

export interface IntegrationConnectionPresentation {
  label: string;
  tone: IntegrationSettingsTone;
  description: string;
  primaryAction: IntegrationConnectionAction | null;
}

const CONNECTION_COPY: Record<string, IntegrationConnectionPresentation> = {
  NOT_CONNECTED: {
    label: 'Não conectado',
    tone: 'neutral',
    description: 'Conecte a fonte antes de agendar sincronizações.',
    primaryAction: 'CONNECT',
  },
  AWAITING_AUTHORIZATION: {
    label: 'Aguardando autorização',
    tone: 'info',
    description: 'Um fluxo de autorização está aberto. Conclua para ativar a sincronização.',
    primaryAction: 'CONTINUE_AUTHORIZATION',
  },
  AUTHORIZED: {
    label: 'Conectada (simulação)',
    tone: 'success',
    description: 'A fonte está autorizada. Agendas ativadas podem sincronizar.',
    primaryAction: null,
  },
  NEEDS_REAUTH: {
    label: 'Nova autorização necessária',
    tone: 'warning',
    description: 'A autorização expirou ou foi revogada. Autorize novamente para continuar.',
    primaryAction: 'RECONNECT',
  },
};

export function describeIntegrationConnectionState(
  connection: string,
): IntegrationConnectionPresentation {
  return (
    CONNECTION_COPY[connection] ?? {
      label: 'Conexão desconhecida',
      tone: 'neutral' as const,
      description: 'Não foi possível determinar o estado da conexão.',
      primaryAction: null,
    }
  );
}

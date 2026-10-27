export type OperationalAuditEventType =
  | 'TRANSACTION_RECTIFIED'
  | 'RECONCILIATION_DECISION_RECORDED'
  | 'IMPORT_COMPLETED'
  | 'IMPORT_PARTIAL'
  | 'IMPORT_FAILED';

export type OperationalAuditCategory = 'ALL' | 'RECTIFICATIONS' | 'RECONCILIATIONS' | 'IMPORTS';

export type OperationalAuditSource =
  'TRANSACTION_RECTIFICATION' | 'RECONCILIATION_DECISION' | 'INTEGRATION_RUN';

export interface OperationalAuditActor {
  kind: 'USER' | 'SYSTEM' | 'OPERATOR';
  label: string;
}

export interface OperationalAuditEntityRef {
  type: 'TRANSACTION' | 'INTEGRATION_RUN' | 'REVIEW' | 'PORTFOLIO';
  id: string;
  label?: string;
  routeHref?: string;
}

export interface OperationalAuditItem {
  id: string;
  eventType: OperationalAuditEventType;
  category: 'RECTIFICATIONS' | 'RECONCILIATIONS' | 'IMPORTS';
  occurredAt: string;
  portfolioId: string;
  title: string;
  description: string;
  actor: OperationalAuditActor | null;
  entity: OperationalAuditEntityRef | null;
  reason: string | null;
  source: OperationalAuditSource;
  metadata?: Record<string, unknown>;
}

export interface OperationalAuditPaginationMeta {
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  totalItemsInPage: number;
}

export interface OperationalAuditHistoryResult {
  items: OperationalAuditItem[];
  meta: OperationalAuditPaginationMeta;
}

export interface ComposeAuditHistoryParams {
  portfolioId: string;
  currentUserId: string;
  category?: OperationalAuditCategory;
  limit?: number;
  cursor?: string | null;
}

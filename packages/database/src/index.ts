export const DATABASE_VERSION = '0.1.0';

/**
 * Placeholder interface for Database Client to be implemented in Phase 0C (Prisma + PostgreSQL).
 */
export interface DatabaseConnectionConfig {
  url?: string;
  maxConnections?: number;
}

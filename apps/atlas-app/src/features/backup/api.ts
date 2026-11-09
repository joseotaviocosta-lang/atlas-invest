import { apiClient } from '../../lib/api';
import type { BackupStatus, CreateBackupResponse } from './types';

export const backupApi = {
  async getStatus(): Promise<BackupStatus> {
    const res = await apiClient.get<{ data: BackupStatus }>('/api/v1/backups/status');
    return res.data;
  },

  async createBackup(): Promise<CreateBackupResponse> {
    const res = await apiClient.post<{ data: CreateBackupResponse }>('/api/v1/backups/create', {});
    return res.data;
  },
};

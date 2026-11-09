import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupApi } from './api';

export const backupKeys = {
  all: ['backups'] as const,
  status: () => [...backupKeys.all, 'status'] as const,
};

export function useBackupStatus() {
  return useQuery({
    queryKey: backupKeys.status(),
    queryFn: () => backupApi.getStatus(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => backupApi.createBackup(),
    onSuccess: (data) => {
      queryClient.setQueryData(backupKeys.status(), data.status);
      queryClient.invalidateQueries({ queryKey: backupKeys.status() });
    },
  });
}

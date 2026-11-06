import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RuntimeStatus, RuntimeDiagnostics } from './types';
import { getRuntimeConfig } from '../../config/runtime';

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function useNativeRuntime() {
  const config = getRuntimeConfig();
  const isLocalOwner = config.runtimeMode === 'DESKTOP_LOCAL_OWNER';

  const [status, setStatus] = useState<RuntimeStatus>({
    postgres: 'idle',
    api: 'idle',
    overall: isLocalOwner ? 'starting' : 'ready',
    message: 'Iniciando verificação de runtime...',
    timestamp: new Date().toISOString(),
  });
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(isLocalOwner);

  const startRuntime = useCallback(async () => {
    if (!isLocalOwner) {
      setIsInitializing(false);
      return;
    }

    setIsInitializing(true);
    setError(null);

    // If running in Tauri Desktop
    if (isTauriEnvironment()) {
      try {
        // Initial status update
        setStatus((prev) => ({
          ...prev,
          overall: 'starting',
          message: 'Iniciando orquestração local do Atlas...',
        }));

        // Poll status every 400ms while starting
        const intervalId = window.setInterval(async () => {
          try {
            const currentStatus = await invoke<RuntimeStatus>('runtime_get_status');
            setStatus(currentStatus);
          } catch {
            // Ignore polling errors
          }
        }, 400);

        try {
          const finalStatus = await invoke<RuntimeStatus>('runtime_start');
          clearInterval(intervalId);
          setStatus(finalStatus);
          setIsInitializing(false);
        } catch (err: any) {
          clearInterval(intervalId);
          const errMsg = typeof err === 'string' ? err : err?.message || 'Falha desconhecida no runtime local';
          setError(errMsg);
          setStatus((prev) => ({
            ...prev,
            overall: 'failed',
            message: errMsg,
          }));

          // Fetch diagnostics on error
          try {
            const diag = await invoke<RuntimeDiagnostics>('runtime_get_diagnostics');
            setDiagnostics(diag);
          } catch {
            // Ignore diag load error
          }
          setIsInitializing(false);
        }
      } catch (invokeErr: any) {
        setError(`Falha ao invocar runtime do Tauri: ${invokeErr?.message || invokeErr}`);
        setIsInitializing(false);
      }
    } else {
      // Browser development mode: check http://127.0.0.1:3001/ready directly
      try {
        setStatus((prev) => ({
          ...prev,
          overall: 'starting',
          postgres: 'running',
          api: 'starting',
          message: 'Verificando API local (127.0.0.1:3001)...',
        }));

        const res = await fetch('http://127.0.0.1:3001/ready', {
          headers: { 'x-atlas-client': 'desktop-local' },
        });

        if (res.ok) {
          setStatus({
            postgres: 'running',
            api: 'ready',
            overall: 'ready',
            message: 'API local pronta para uso',
            timestamp: new Date().toISOString(),
          });
          setIsInitializing(false);
        } else {
          throw new Error(`API respondeu com status ${res.status}`);
        }
      } catch (fetchErr: any) {
        setError(`API local não está respondendo em 127.0.0.1:3001: ${fetchErr?.message || fetchErr}`);
        setStatus((prev) => ({
          ...prev,
          overall: 'failed',
          message: 'API local não disponível',
        }));
        setIsInitializing(false);
      }
    }
  }, [isLocalOwner]);

  const restartRuntime = useCallback(async () => {
    if (isTauriEnvironment()) {
      setIsInitializing(true);
      setError(null);
      try {
        const restartedStatus = await invoke<RuntimeStatus>('runtime_restart');
        setStatus(restartedStatus);
        setIsInitializing(false);
      } catch (err: any) {
        const errMsg = typeof err === 'string' ? err : err?.message || 'Falha ao reiniciar o runtime local';
        setError(errMsg);
        setIsInitializing(false);
      }
    } else {
      startRuntime();
    }
  }, [startRuntime]);

  useEffect(() => {
    startRuntime();
  }, [startRuntime]);

  return {
    isInitializing,
    status,
    error,
    diagnostics,
    restartRuntime,
    isReady: status.overall === 'ready',
  };
}

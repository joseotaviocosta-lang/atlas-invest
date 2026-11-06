export interface RuntimeStatus {
  postgres: 'idle' | 'checking' | 'running' | 'starting' | 'failed' | string;
  api: 'idle' | 'checking' | 'running' | 'starting' | 'ready' | 'failed' | string;
  overall: 'idle' | 'starting' | 'ready' | 'failed' | string;
  message: string;
  timestamp: string;
}

export interface RuntimeDiagnostics {
  status: RuntimeStatus;
  ports: {
    postgres_5434: boolean;
    api_3001: boolean;
    api_ready: boolean;
  };
  paths: {
    postgres_bin: string;
    postgres_data: string;
    node_bin: string;
    bundle_cjs: string;
  };
  recent_logs: string[];
}


import { spawn, execSync } from 'child_process';
import * as http from 'http';
import * as path from 'path';

const PG_PORT = 5434;
const API_PORT = 3001;
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
const PG_DATA_DIR = path.join(LOCALAPPDATA, 'Atlas', 'pg_data');
const POSTGRES_BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin';

function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function checkHttp(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensurePostgres(): Promise<void> {
  const isOpen = await isPortOpen(PG_PORT);
  if (isOpen) {
    console.info(`[DesktopRuntime] PostgreSQL is already active on port ${PG_PORT}.`);
    return;
  }

  console.info(`[DesktopRuntime] Starting local PostgreSQL on port ${PG_PORT}...`);
  const pgExe = path.join(POSTGRES_BIN, 'postgres.exe');
  spawn(pgExe, ['-D', PG_DATA_DIR], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isPortOpen(PG_PORT)) {
      console.info(`[DesktopRuntime] PostgreSQL successfully started on port ${PG_PORT}.`);
      return;
    }
  }

  throw new Error(`[DesktopRuntime] Timed out waiting for PostgreSQL to start on port ${PG_PORT}.`);
}

async function main() {
  console.info('=== Project Atlas: Desktop Local Owner Runtime Launcher ===');
  await ensurePostgres();

  const isApiReady = await checkHttp(`http://127.0.0.1:${API_PORT}/health`);
  if (isApiReady) {
    console.info(`[DesktopRuntime] Atlas API is already running on http://127.0.0.1:${API_PORT}.`);
  } else {
    console.info(`[DesktopRuntime] Starting Atlas API on http://127.0.0.1:${API_PORT}...`);
    // Run api in current or detached process
    const rootDir = path.resolve(__dirname, '..');
    const child = spawn('pnpm', ['--filter', '@atlas/api', 'dev'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://atlas:atlas@127.0.0.1:${PG_PORT}/atlas_local?schema=public`,
        ATLAS_LOCAL_OWNER_MODE: 'true',
        API_PORT: String(API_PORT),
      },
    });

    child.on('exit', (code) => {
      console.info(`[DesktopRuntime] Atlas API exited with code ${code}.`);
    });
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[DesktopRuntime] Failed:', err);
    process.exit(1);
  });
}

export { ensurePostgres, isPortOpen };

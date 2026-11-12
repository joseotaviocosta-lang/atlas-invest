import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

const rootDir = path.resolve(__dirname, '..');
const runtimeDir = path.resolve(rootDir, 'apps/atlas-app/runtime');
const apiRuntimeDir = path.resolve(runtimeDir, 'api');
const nodeModulesTarget = path.resolve(apiRuntimeDir, 'node_modules');

const tauriConfPath = path.join(rootDir, 'apps/atlas-app/src-tauri/tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'apps/atlas-app/src-tauri/Cargo.toml');
const tauriVersion = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8')).version as string;
const cargoToml = fs.readFileSync(cargoTomlPath, 'utf-8');
const monitorVersionMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
const monitorVersion = monitorVersionMatch?.[1] ?? '0.1.0';
const gitSha = execSync('git rev-parse --short=12 HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim() || 'unknown';
const atlasBuildId = process.env.ATLAS_BUILD_ID?.trim() || `${tauriVersion}+${gitSha}`;
const buildEnv = { ...process.env, ATLAS_BUILD_ID: atlasBuildId };

console.log(`=== Packaging Atlas Desktop Standalone Runtime (buildId=${atlasBuildId}) ===`);

// 1. Build API bundle.cjs & news-monitor.cjs
console.log('[1/4] Building production API bundle...');
execSync('npx tsx scripts/build-api-bundle.ts', { cwd: rootDir, env: buildEnv, stdio: 'inherit' });

// 2. Ensure runtime directories exist
if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
if (!fs.existsSync(apiRuntimeDir)) fs.mkdirSync(apiRuntimeDir, { recursive: true });
if (fs.existsSync(nodeModulesTarget)) fs.rmSync(nodeModulesTarget, { recursive: true, force: true });
fs.mkdirSync(nodeModulesTarget, { recursive: true });

// 3. Copy node.exe from system
const nodeSource = process.execPath;
const nodeTarget = path.join(runtimeDir, 'node.exe');
console.log(`[2/4] Copying private Node runtime: ${nodeSource} -> ${nodeTarget}`);
fs.copyFileSync(nodeSource, nodeTarget);

// 4. Copy API bundle & background news monitor bundle + binary
const bundleSource = path.join(rootDir, 'apps/api/dist/bundle.cjs');
const bundleTarget = path.join(apiRuntimeDir, 'bundle.cjs');
console.log(`[3/4] Copying bundle: ${bundleSource} -> ${bundleTarget}`);
fs.copyFileSync(bundleSource, bundleTarget);

const monitorBundleSource = path.join(rootDir, 'apps/api/dist/news-monitor.cjs');
const monitorBundleTarget = path.join(apiRuntimeDir, 'news-monitor.cjs');
console.log(`Copying background monitor bundle: ${monitorBundleSource} -> ${monitorBundleTarget}`);
fs.copyFileSync(monitorBundleSource, monitorBundleTarget);

console.log('Building atlas-news-monitor.exe...');
execSync('cargo build --release --bin atlas-news-monitor --manifest-path apps/atlas-app/src-tauri/Cargo.toml', {
  cwd: rootDir,
  env: buildEnv,
  stdio: 'inherit',
});
const monitorExeSource = path.join(rootDir, 'apps/atlas-app/src-tauri/target/release/atlas-news-monitor.exe');
const monitorExeTarget = path.join(runtimeDir, 'atlas-news-monitor.exe');
console.log(`Copying background monitor binary: ${monitorExeSource} -> ${monitorExeTarget}`);
fs.copyFileSync(monitorExeSource, monitorExeTarget);

// 5. Write runtime-manifest.json with deterministic buildId and SHA-256 digests
const manifest = {
  atlasVersion: tauriVersion,
  monitorVersion,
  apiBundleVersion: tauriVersion,
  schemaExpectedMigrations: 50,
  buildId: atlasBuildId,
  files: {
    monitorExeSha256: sha256File(monitorExeTarget),
    newsMonitorBundleSha256: sha256File(monitorBundleTarget),
    nodeExeSha256: sha256File(nodeTarget),
  },
};
const manifestPath = path.join(runtimeDir, 'runtime-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`Generated runtime manifest: ${manifestPath}`);

// 6. Copy required native runtime packages (@prisma/client, .prisma, argon2)
console.log('[4/4] Copying native runtime node_modules...');

const prismaResolved = require.resolve('@prisma/client', { paths: [path.join(rootDir, 'packages/database'), rootDir] });
const prismaClientSrc = path.dirname(prismaResolved);
const prismaClientDest = path.join(nodeModulesTarget, '@prisma/client');
console.log(`Copying @prisma/client: ${prismaClientSrc} -> ${prismaClientDest}`);
fs.cpSync(prismaClientSrc, prismaClientDest, { recursive: true, dereference: true });

const dotPrismaSrc = path.resolve(prismaClientSrc, '../../.prisma');
const dotPrismaDest = path.join(nodeModulesTarget, '.prisma');
console.log(`Copying .prisma: ${dotPrismaSrc} -> ${dotPrismaDest}`);
fs.cpSync(dotPrismaSrc, dotPrismaDest, { recursive: true, dereference: true });

const argon2Resolved = require.resolve('argon2', { paths: [path.join(rootDir, 'apps/api'), rootDir] });
const argon2Src = path.dirname(argon2Resolved);
const argon2Parent = path.resolve(argon2Src, '..');
const argon2Dest = path.join(nodeModulesTarget, 'argon2');
console.log(`Copying argon2: ${argon2Src} -> ${argon2Dest}`);
fs.cpSync(argon2Src, argon2Dest, { recursive: true, dereference: true });

const phcSrc = path.join(argon2Parent, '@phc');
const phcDest = path.join(nodeModulesTarget, '@phc');
if (fs.existsSync(phcSrc)) {
  console.log(`Copying @phc: ${phcSrc} -> ${phcDest}`);
  fs.cpSync(phcSrc, phcDest, { recursive: true, dereference: true });
}

const gypSrc = path.join(argon2Parent, 'node-gyp-build');
const gypDest = path.join(nodeModulesTarget, 'node-gyp-build');
if (fs.existsSync(gypSrc)) {
  console.log(`Copying node-gyp-build: ${gypSrc} -> ${gypDest}`);
  fs.cpSync(gypSrc, gypDest, { recursive: true, dereference: true });
}

console.log('=== Desktop Standalone Runtime Packaged Successfully! ===');
console.log(`Runtime Directory: ${runtimeDir}`);

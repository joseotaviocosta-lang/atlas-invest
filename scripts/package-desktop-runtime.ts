import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const rootDir = path.resolve(__dirname, '..');
const runtimeDir = path.resolve(rootDir, 'apps/atlas-app/runtime');
const apiRuntimeDir = path.resolve(runtimeDir, 'api');
const nodeModulesTarget = path.resolve(apiRuntimeDir, 'node_modules');

console.log('=== Packaging Atlas Desktop Standalone Runtime ===');

// 1. Build API bundle.cjs
console.log('[1/4] Building production API bundle...');
execSync('npx tsx scripts/build-api-bundle.ts', { cwd: rootDir, stdio: 'inherit' });

// 2. Ensure runtime directories exist
if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
if (!fs.existsSync(apiRuntimeDir)) fs.mkdirSync(apiRuntimeDir, { recursive: true });
if (fs.existsSync(nodeModulesTarget)) fs.rmSync(nodeModulesTarget, { recursive: true, force: true });
fs.mkdirSync(nodeModulesTarget, { recursive: true });

// 3. Copy node.exe from system
const nodeSource = process.execPath; // C:\Program Files\nodejs\node.exe
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
  stdio: 'inherit',
});
const monitorExeSource = path.join(rootDir, 'apps/atlas-app/src-tauri/target/release/atlas-news-monitor.exe');
const monitorExeTarget = path.join(runtimeDir, 'atlas-news-monitor.exe');
console.log(`Copying background monitor binary: ${monitorExeSource} -> ${monitorExeTarget}`);
fs.copyFileSync(monitorExeSource, monitorExeTarget);

// 5. Copy required native runtime packages (@prisma/client, .prisma, argon2)
console.log('[4/4] Copying native runtime node_modules...');

// Resolve @prisma/client
const prismaResolved = require.resolve('@prisma/client', { paths: [path.join(rootDir, 'packages/database'), rootDir] });
const prismaClientSrc = path.dirname(prismaResolved);
const prismaClientDest = path.join(nodeModulesTarget, '@prisma/client');
console.log(`Copying @prisma/client: ${prismaClientSrc} -> ${prismaClientDest}`);
fs.cpSync(prismaClientSrc, prismaClientDest, { recursive: true, dereference: true });

// Resolve .prisma
const dotPrismaSrc = path.resolve(prismaClientSrc, '../../.prisma');
const dotPrismaDest = path.join(nodeModulesTarget, '.prisma');
console.log(`Copying .prisma: ${dotPrismaSrc} -> ${dotPrismaDest}`);
fs.cpSync(dotPrismaSrc, dotPrismaDest, { recursive: true, dereference: true });

// Resolve argon2 and its peer/child dependencies (@phc, node-gyp-build)
const argon2Resolved = require.resolve('argon2', { paths: [path.join(rootDir, 'apps/api'), rootDir] });
const argon2Src = path.dirname(argon2Resolved);
const argon2Parent = path.resolve(argon2Src, '..');
const argon2Dest = path.join(nodeModulesTarget, 'argon2');
console.log(`Copying argon2: ${argon2Src} -> ${argon2Dest}`);
fs.cpSync(argon2Src, argon2Dest, { recursive: true, dereference: true });

// Copy @phc
const phcSrc = path.join(argon2Parent, '@phc');
const phcDest = path.join(nodeModulesTarget, '@phc');
if (fs.existsSync(phcSrc)) {
  console.log(`Copying @phc: ${phcSrc} -> ${phcDest}`);
  fs.cpSync(phcSrc, phcDest, { recursive: true, dereference: true });
}

// Copy node-gyp-build
const gypSrc = path.join(argon2Parent, 'node-gyp-build');
const gypDest = path.join(nodeModulesTarget, 'node-gyp-build');
if (fs.existsSync(gypSrc)) {
  console.log(`Copying node-gyp-build: ${gypSrc} -> ${gypDest}`);
  fs.cpSync(gypSrc, gypDest, { recursive: true, dereference: true });
}

console.log('=== Desktop Standalone Runtime Packaged Successfully! ===');
console.log(`Runtime Directory: ${runtimeDir}`);

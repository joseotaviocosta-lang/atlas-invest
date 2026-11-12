import * as path from 'path';
import { execSync } from 'child_process';

const esbuildExe = path.resolve(
  __dirname,
  '../node_modules/.pnpm/@esbuild+win32-x64@0.25.12/node_modules/@esbuild/win32-x64/esbuild.exe'
);

const entryPoint = path.resolve(__dirname, '../apps/api/src/main.ts');
const monitorEntryPoint = path.resolve(__dirname, '../apps/api/src/background-news-monitor.ts');
const outDir = path.resolve(__dirname, '../apps/api/dist');
const outFile = path.join(outDir, 'bundle.cjs');
const monitorOutFile = path.join(outDir, 'news-monitor.cjs');

console.log('Building Project Atlas API production bundle...');

const externals = [
  '@prisma/client',
  'argon2',
  '@nestjs/microservices',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  'class-transformer',
  'class-validator',
  'fastify',
  'point-of-view',
  'fsevents',
];

const externalArgs = externals.map((ext) => `--external:${ext}`).join(' ');

const cmd = `"${esbuildExe}" "${entryPoint}" --bundle --platform=node --target=node20 --format=cjs "--outfile=${outFile}" ${externalArgs} --banner:js="const import_meta_url = require('url').pathToFileURL(__filename).href;" --define:import.meta.url=import_meta_url --sourcemap`;
const monitorCmd = `"${esbuildExe}" "${monitorEntryPoint}" --bundle --platform=node --target=node20 --format=cjs "--outfile=${monitorOutFile}" ${externalArgs} --banner:js="const import_meta_url = require('url').pathToFileURL(__filename).href;" --define:import.meta.url=import_meta_url --sourcemap`;

try {
  const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
  console.log(output);
  console.log(`Success! API production bundle generated at: ${outFile}`);
  const monitorOutput = execSync(monitorCmd, { encoding: 'utf-8', stdio: 'pipe' });
  console.log(monitorOutput);
  console.log(`Success! Background news monitor bundle generated at: ${monitorOutFile}`);
} catch (err: any) {
  console.error('Build error:', err.stdout || err.message);
  process.exit(1);
}

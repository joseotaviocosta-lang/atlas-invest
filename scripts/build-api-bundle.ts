import * as path from 'path';
import { execSync } from 'child_process';

const esbuildExe = path.resolve(
  __dirname,
  '../node_modules/.pnpm/@esbuild+win32-x64@0.25.12/node_modules/@esbuild/win32-x64/esbuild.exe'
);

const entryPoint = path.resolve(__dirname, '../apps/api/src/main.ts');
const outDir = path.resolve(__dirname, '../apps/api/dist');
const outFile = path.join(outDir, 'bundle.cjs');

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

try {
  const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
  console.log(output);
  console.log(`Success! API production bundle generated at: ${outFile}`);
} catch (err: any) {
  console.error('Build error:', err.stdout || err.message);
  process.exit(1);
}

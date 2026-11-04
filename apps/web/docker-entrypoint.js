/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Docker Entrypoint for Project Atlas Web Application (Next.js Standalone)
 *
 * When DISABLE_HSTS_FOR_HTTP_STAGING === 'true', sanitizes the generated
 * routes-manifest.json to strip Strict-Transport-Security for plain HTTP staging.
 *
 * In all other cases (production HTTPS / default), preserves Strict-Transport-Security.
 */
const fs = require('fs');
const path = require('path');

function sanitizeManifestHeaders(manifest) {
  if (!manifest || !Array.isArray(manifest.headers)) {
    return false;
  }
  let modified = false;
  for (const headerGroup of manifest.headers) {
    if (Array.isArray(headerGroup.headers)) {
      const originalLength = headerGroup.headers.length;
      headerGroup.headers = headerGroup.headers.filter(
        (h) => (h.key || '').toLowerCase() !== 'strict-transport-security',
      );
      if (headerGroup.headers.length !== originalLength) {
        modified = true;
      }
    }
  }
  return modified;
}

function applyStagingHstsPolicy() {
  const disableHsts = process.env.DISABLE_HSTS_FOR_HTTP_STAGING === 'true';
  if (!disableHsts) {
    return false;
  }

  const candidateDirs = [
    __dirname,
    process.cwd(),
    path.join(__dirname, 'apps', 'web'),
    path.join(process.cwd(), 'apps', 'web'),
  ];

  let anyModified = false;
  for (const baseDir of candidateDirs) {
    const manifestPath = path.join(baseDir, '.next', 'routes-manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(raw);
        if (sanitizeManifestHeaders(manifest)) {
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
          console.info(`[staging-hsts] Omitted Strict-Transport-Security in ${manifestPath}`);
          anyModified = true;
        }
      } catch (err) {
        console.error(`[staging-hsts] Error sanitizing ${manifestPath}:`, err.message);
      }
    }
  }
  return anyModified;
}

if (require.main === module) {
  applyStagingHstsPolicy();
  require('./apps/web/server.js');
}

module.exports = {
  sanitizeManifestHeaders,
  applyStagingHstsPolicy,
};

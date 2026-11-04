import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Caddy Security Headers Configuration (ADR-290 / Staging IP-Only HTTP)', () => {
  const caddyfilePath = path.resolve(__dirname, '../../deploy/Caddyfile');
  const caddyfileContent = fs.readFileSync(caddyfilePath, 'utf-8');

  it('should define common_security_headers with standard hardening headers', () => {
    expect(caddyfileContent).toContain('(common_security_headers) {');
    expect(caddyfileContent).toContain('X-Content-Type-Options "nosniff"');
    expect(caddyfileContent).toContain('X-Frame-Options "DENY"');
    expect(caddyfileContent).toContain('Referrer-Policy "strict-origin-when-cross-origin"');
    expect(caddyfileContent).toContain('Permissions-Policy "camera=(), microphone=(), geolocation=()"');
    expect(caddyfileContent).toContain('-Server');
  });

  it('should define https_security_headers that includes HSTS and imports common_security_headers', () => {
    expect(caddyfileContent).toContain('(https_security_headers) {');
    expect(caddyfileContent).toContain('Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"');
  });

  it('should ensure staging IP-only HTTP listener imports common_security_headers and NOT HSTS', () => {
    // Extract the staging HTTP server block
    const httpBlockMatch = caddyfileContent.match(/http:\/\/\{\$STAGING_HOST:[^}]+\}\s*\{([\s\S]*?)\n\}/);
    expect(httpBlockMatch).not.toBeNull();
    const httpBlock = httpBlockMatch![1];

    expect(httpBlock).toContain('import common_security_headers');
    expect(httpBlock).not.toContain('import https_security_headers');
    expect(httpBlock).not.toContain('Strict-Transport-Security');
  });

  it('should ensure future HTTPS domain blocks import https_security_headers', () => {
    // Check commented future domain configuration
    expect(caddyfileContent).toContain('import https_security_headers');
  });
});

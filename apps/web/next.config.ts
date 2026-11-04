import type { NextConfig } from 'next';
import { getSecurityHeaders } from './src/lib/security-headers';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@atlas/domain', '@atlas/ui'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: getSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;

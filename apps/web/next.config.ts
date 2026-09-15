import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@atlas/domain', '@atlas/ui'],
};

export default nextConfig;

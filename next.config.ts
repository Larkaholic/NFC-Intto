import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['electron'],
};

if (process.env.NODE_ENV === 'development') delete nextConfig.output;

export default nextConfig;

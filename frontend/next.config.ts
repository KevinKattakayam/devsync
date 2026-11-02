import type { NextConfig } from 'next';

if (process.env.DEPLOYMENT_MODE === 'production') {
  for (const name of [
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_SOCKET_URL',
    'NEXT_PUBLIC_YJS_URL',
    'BACKEND_URL',
  ]) {
    if (!process.env[name]) throw new Error(`Missing deployment setting: ${name}`);
  }
  for (const name of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SOCKET_URL', 'BACKEND_URL']) {
    if (new URL(process.env[name]!).protocol !== 'https:')
      throw new Error(`HTTPS required: ${name}`);
  }
  if (new URL(process.env.NEXT_PUBLIC_YJS_URL!).protocol !== 'wss:')
    throw new Error('WSS required: NEXT_PUBLIC_YJS_URL');
}
const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

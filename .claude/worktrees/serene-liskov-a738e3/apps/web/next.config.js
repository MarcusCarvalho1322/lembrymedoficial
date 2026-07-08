/** @type {import('next').NextConfig} */
const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://lembrymed-api-production.up.railway.app';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/:path*` },
    ];
  },
};

module.exports = nextConfig;

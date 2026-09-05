/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const apiProxyTarget = process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8080';
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget.replace(/\/$/, '')}/api/:path*`
      }
    ];
  }
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxies /api/* server-side to the backend so the browser only ever talks
  // to this one origin -- no visible cross-origin calls, no CORS preflight.
  // BACKEND_URL is server-only (not NEXT_PUBLIC_*): it's read at request time
  // by the Next.js server doing the proxying, never shipped to the browser.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

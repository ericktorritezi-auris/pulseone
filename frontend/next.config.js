/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Backend rodando no mesmo container, porta interna fixa (não exposta publicamente)
        destination: `http://localhost:${process.env.INTERNAL_API_PORT ?? 3333}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core'],
  },
  webpack: (
    config, 
    { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }
  ) => {
    config.resolve.alias['puppeteer-core'] = false;
    return config;
  }
}

module.exports = nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['papaparse'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig

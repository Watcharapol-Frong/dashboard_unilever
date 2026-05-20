/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['papaparse'],
    bodySizeLimit: '10mb',
  },
}

module.exports = nextConfig

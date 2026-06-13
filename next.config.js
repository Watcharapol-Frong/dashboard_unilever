/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explicitly expose DEV_MODE to Edge Middleware (env vars in Edge need to be declared here)
  env: {
    DEV_MODE: process.env.DEV_MODE ?? '',
  },
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['papaparse'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig

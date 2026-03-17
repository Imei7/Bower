/**
 * Production Server for Railway Deployment
 * 
 * This file is used when running the standalone Next.js server in production.
 * It properly binds to 0.0.0.0 and uses PORT from environment.
 */

const path = require('path')

// Set production environment
process.env.NODE_ENV = 'production'

// Change directory to where server.js is located
process.chdir(__dirname)

// Configuration
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT, 10) || 8080

// Next.js configuration
const nextConfig = { output: 'standalone' }

// Set private config for standalone mode
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)

// Import Next.js
require('next')

// Import and start server
const { startServer } = require('next/dist/server/lib/start-server')

// Start the server
startServer({
  dir: __dirname,
  isDev: false,
  config: nextConfig,
  hostname,
  port,
}).then(() => {
  console.log(`✅ Server running on http://${hostname}:${port}`)
  console.log(`📊 Health check: http://${hostname}:${port}/api/health`)
}).catch((err) => {
  console.error('❌ Failed to start server:', err)
  process.exit(1)
})

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

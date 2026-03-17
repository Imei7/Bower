/**
 * OTP Sniper Bot Service
 * 
 * This is a standalone service that runs the Telegram bot and queue workers.
 * It connects to Redis for queuing and SQLite/PostgreSQL for persistence.
 */

import { createBot, startBot, getBot } from '../../backend/bot'
import { createBuyNumberWorker, setBotInstance } from '../../backend/queue/workers/buy-number'
import { createSniperOtpWorker } from '../../backend/queue/workers/sniper-otp'
import { initRedis, redisHealthCheck } from '../../backend/core/redis'
import { config } from '../../backend/core/config'
import { logger } from '../../backend/utils/logger'
import prisma from '../../backend/db'

// Workers
let buyNumberWorker: ReturnType<typeof createBuyNumberWorker> | null = null
let sniperOtpWorker: ReturnType<typeof createSniperOtpWorker> | null = null

/**
 * Health check endpoint for the service
 */
async function healthCheck(): Promise<{
  status: 'ok' | 'degraded' | 'error'
  components: Record<string, { status: boolean; latency?: number; error?: string }>
}> {
  const components: Record<string, { status: boolean; latency?: number; error?: string }> = {}

  // Check database
  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    components.database = { status: true, latency: Date.now() - start }
  } catch (error) {
    components.database = {
      status: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // Check Redis
  const redisHealth = await redisHealthCheck()
  components.redis = redisHealth

  // Determine overall status
  const allHealthy = Object.values(components).every(c => c.status)
  const someHealthy = Object.values(components).some(c => c.status)

  const status = allHealthy ? 'ok' : someHealthy ? 'degraded' : 'error'

  return { status, components }
}

/**
 * Start all services
 */
async function start() {
  logger.info('Starting OTP Sniper Bot Service...')
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
  logger.info(`Redis: ${config.redis.host}:${config.redis.port}`)

  try {
    // Initialize Redis
    logger.info('Initializing Redis connection...')
    await initRedis()

    // Create and start bot
    logger.info('Creating Telegram bot...')
    const bot = createBot()

    // Set bot instance for workers
    setBotInstance(bot)

    // Start queue workers
    logger.info('Starting queue workers...')
    buyNumberWorker = createBuyNumberWorker()
    sniperOtpWorker = createSniperOtpWorker()

    // Start bot polling
    logger.info('Starting bot polling...')
    await bot.launch()

    logger.info('='.repeat(50))
    logger.info('OTP Sniper Bot Service started successfully!')
    logger.info('='.repeat(50))

    // Log health status
    const health = await healthCheck()
    logger.info('Health check:', health)

  } catch (error) {
    logger.error('Failed to start service', error)
    process.exit(1)
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`)

  try {
    // Stop bot
    const bot = getBot()
    bot.stop()
    logger.info('Bot stopped')

    // Close workers
    if (buyNumberWorker) {
      await buyNumberWorker.close()
      logger.info('Buy number worker closed')
    }
    if (sniperOtpWorker) {
      await sniperOtpWorker.close()
      logger.info('Sniper OTP worker closed')
    }

    // Close database
    await prisma.$disconnect()
    logger.info('Database disconnected')

    logger.info('Shutdown complete')
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown', error)
    process.exit(1)
  }
}

// Register signal handlers
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error)
  shutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', new Error(String(reason)), { promise })
})

// Start the service
start()

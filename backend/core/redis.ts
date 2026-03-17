import Redis from 'ioredis'
import { config } from './config'
import { logger } from '../utils/logger'

let redisClient: Redis | null = null
let redisSubscriber: Redis | null = null

/**
 * Create Redis client with retry strategy
 */
function createRedisClient(name: string): Redis {
  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: config.redis.maxRetries,
    retryStrategy: (times: number) => {
      if (times > config.redis.maxRetries) {
        logger.error(`Redis ${name}: Max retries reached`, { times })
        return null // Stop retrying
      }
      const delay = Math.min(times * 100, 3000)
      logger.warn(`Redis ${name}: Retrying connection`, { attempt: times, delay })
      return delay
    },
    reconnectOnError: (err: Error) => {
      const targetError = 'READONLY'
      if (err.message.includes(targetError)) {
        return true // Reconnect on READONLY error
      }
      return false
    },
    lazyConnect: true,
    keepAlive: 10000,
    connectTimeout: 10000,
    commandTimeout: 5000,
  })

  client.on('connect', () => {
    logger.info(`Redis ${name}: Connected`, {
      host: config.redis.host,
      port: config.redis.port,
    })
  })

  client.on('ready', () => {
    logger.info(`Redis ${name}: Ready`)
  })

  client.on('error', (err) => {
    logger.error(`Redis ${name}: Connection error`, err)
  })

  client.on('close', () => {
    logger.warn(`Redis ${name}: Connection closed`)
  })

  client.on('reconnecting', () => {
    logger.info(`Redis ${name}: Reconnecting...`)
  })

  return client
}

/**
 * Get Redis client (singleton)
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient('main')
  }
  return redisClient
}

/**
 * Get Redis subscriber client (singleton)
 */
export function getRedisSubscriber(): Redis {
  if (!redisSubscriber) {
    redisSubscriber = createRedisClient('subscriber')
  }
  return redisSubscriber
}

/**
 * Initialize Redis connection
 */
export async function initRedis(): Promise<void> {
  const client = getRedisClient()
  try {
    await client.ping()
    logger.info('Redis: Initialization successful')
  } catch (error) {
    logger.error('Redis: Initialization failed', error)
    throw error
  }
}

/**
 * Close Redis connections
 */
export async function closeRedis(): Promise<void> {
  const promises: Promise<void>[] = []

  if (redisClient) {
    promises.push(redisClient.quit().then(() => {
      logger.info('Redis main: Connection closed')
    }))
    redisClient = null
  }

  if (redisSubscriber) {
    promises.push(redisSubscriber.quit().then(() => {
      logger.info('Redis subscriber: Connection closed')
    }))
    redisSubscriber = null
  }

  await Promise.all(promises)
}

/**
 * Health check for Redis
 */
export async function redisHealthCheck(): Promise<{ status: boolean; latency?: number; error?: string }> {
  const client = getRedisClient()
  try {
    const start = Date.now()
    await client.ping()
    const latency = Date.now() - start
    return { status: true, latency }
  } catch (error) {
    return {
      status: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export default getRedisClient

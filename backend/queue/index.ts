import { Queue, Worker, Job } from 'bullmq'
import { getRedisClient } from '../core/redis'
import { config } from '../core/config'
import { logger } from '../utils/logger'

// Queue names
export const QUEUE_NAMES = {
  BUY_NUMBER: config.queue.buyNumber,
  SNIPER_OTP: config.queue.sniperOtp,
} as const

// Job data types
export interface BuyNumberJobData {
  userId: string
  apiKey: string
  countryCode: string
  serviceCode: string
  telegramId: number
  chatId: number
  messageId?: number
}

export interface SniperOtpJobData {
  userId: string
  apiKey: string
  activationId: string
  phoneNumber: string
  countryCode: string
  serviceCode: string
  telegramId: number
  chatId: number
  messageId?: number
  retryCount?: number
}

// Queue instances
let buyNumberQueue: Queue<BuyNumberJobData> | null = null
let sniperOtpQueue: Queue<SniperOtpJobData> | null = null

/**
 * Get connection options for BullMQ
 */
function getConnection() {
  return {
    connection: {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null, // BullMQ requires this
    },
  }
}

/**
 * Get buy number queue
 */
export function getBuyNumberQueue(): Queue<BuyNumberJobData> {
  if (!buyNumberQueue) {
    buyNumberQueue = new Queue<BuyNumberJobData>(QUEUE_NAMES.BUY_NUMBER, {
      ...getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
        timeout: 30000,
      },
    })

    logger.info('Buy number queue created')
  }

  return buyNumberQueue
}

/**
 * Get sniper OTP queue
 */
export function getSniperOtpQueue(): Queue<SniperOtpJobData> {
  if (!sniperOtpQueue) {
    sniperOtpQueue = new Queue<SniperOtpJobData>(QUEUE_NAMES.SNIPER_OTP, {
      ...getConnection(),
      defaultJobOptions: {
        attempts: 1, // We handle retries manually in the job
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
        timeout: config.sniper.timeout + 10000, // Sniper timeout + buffer
      },
    })

    logger.info('Sniper OTP queue created')
  }

  return sniperOtpQueue
}

/**
 * Add job to buy number queue
 */
export async function addBuyNumberJob(data: BuyNumberJobData): Promise<Job<BuyNumberJobData>> {
  const queue = getBuyNumberQueue()
  const job = await queue.add('buy-number', data, {
    jobId: `buy-${data.userId}-${Date.now()}`,
  })

  logger.info('Buy number job added', {
    jobId: job.id,
    userId: data.userId,
  })

  return job
}

/**
 * Add job to sniper OTP queue
 */
export async function addSniperOtpJob(data: SniperOtpJobData): Promise<Job<SniperOtpJobData>> {
  const queue = getSniperOtpQueue()
  const job = await queue.add('sniper-otp', data, {
    jobId: `sniper-${data.activationId}`,
  })

  logger.info('Sniper OTP job added', {
    jobId: job.id,
    activationId: data.activationId,
  })

  return job
}

/**
 * Get job counts for queue
 */
export async function getQueueStats(): Promise<{
  buyNumber: { waiting: number; active: number; completed: number; failed: number }
  sniperOtp: { waiting: number; active: number; completed: number; failed: number }
}> {
  const buyNumberQ = getBuyNumberQueue()
  const sniperOtpQ = getSniperOtpQueue()

  const [buyNumberCounts, sniperOtpCounts] = await Promise.all([
    buyNumberQ.getJobCounts('waiting', 'active', 'completed', 'failed'),
    sniperOtpQ.getJobCounts('waiting', 'active', 'completed', 'failed'),
  ])

  return {
    buyNumber: {
      waiting: buyNumberCounts.waiting || 0,
      active: buyNumberCounts.active || 0,
      completed: buyNumberCounts.completed || 0,
      failed: buyNumberCounts.failed || 0,
    },
    sniperOtp: {
      waiting: sniperOtpCounts.waiting || 0,
      active: sniperOtpCounts.active || 0,
      completed: sniperOtpCounts.completed || 0,
      failed: sniperOtpCounts.failed || 0,
    },
  }
}

/**
 * Close all queues
 */
export async function closeQueues(): Promise<void> {
  const promises: Promise<void>[] = []

  if (buyNumberQueue) {
    promises.push(buyNumberQueue.close().then(() => {
      logger.info('Buy number queue closed')
    }))
    buyNumberQueue = null
  }

  if (sniperOtpQueue) {
    promises.push(sniperOtpQueue.close().then(() => {
      logger.info('Sniper OTP queue closed')
    }))
    sniperOtpQueue = null
  }

  await Promise.all(promises)
}

const queueExports = {
  getBuyNumberQueue,
  getSniperOtpQueue,
  addBuyNumberJob,
  addSniperOtpJob,
  getQueueStats,
  closeQueues,
  QUEUE_NAMES,
}
export default queueExports

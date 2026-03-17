import { getRedisClient } from '../core/redis'
import { config } from '../core/config'
import { logger } from '../utils/logger'

class LockService {
  private prefix: string
  private ttl: number

  constructor() {
    this.prefix = config.lock.prefix
    this.ttl = config.lock.ttl
  }

  /**
   * Generate lock key for user
   */
  private getLockKey(userId: string): string {
    return `${this.prefix}${userId}`
  }

  /**
   * Acquire lock for user
   * Returns true if lock acquired, false if already locked
   */
  async acquire(userId: string, metadata?: Record<string, unknown>): Promise<boolean> {
    const redis = getRedisClient()
    const key = this.getLockKey(userId)
    const value = JSON.stringify({
      timestamp: Date.now(),
      metadata,
    })

    try {
      const result = await redis.set(key, value, 'PX', this.ttl, 'NX')

      if (result === 'OK') {
        logger.debug('Lock acquired', { userId })
        return true
      }

      logger.warn('Lock already held', { userId })
      return false
    } catch (error) {
      logger.error('Failed to acquire lock', error, { userId })
      return false
    }
  }

  /**
   * Release lock for user
   */
  async release(userId: string): Promise<boolean> {
    const redis = getRedisClient()
    const key = this.getLockKey(userId)

    try {
      const result = await redis.del(key)

      if (result === 1) {
        logger.debug('Lock released', { userId })
        return true
      }

      logger.warn('Lock not found or already released', { userId })
      return false
    } catch (error) {
      logger.error('Failed to release lock', error, { userId })
      return false
    }
  }

  /**
   * Check if user is locked
   */
  async isLocked(userId: string): Promise<boolean> {
    const redis = getRedisClient()
    const key = this.getLockKey(userId)

    try {
      const exists = await redis.exists(key)
      return exists === 1
    } catch (error) {
      logger.error('Failed to check lock', error, { userId })
      return false
    }
  }

  /**
   * Get lock info
   */
  async getLockInfo(userId: string): Promise<{ locked: boolean; data?: Record<string, unknown>; ttl?: number }> {
    const redis = getRedisClient()
    const key = this.getLockKey(userId)

    try {
      const [value, ttl] = await Promise.all([
        redis.get(key),
        redis.pttl(key),
      ])

      if (!value) {
        return { locked: false }
      }

      return {
        locked: true,
        data: JSON.parse(value),
        ttl: ttl > 0 ? ttl : undefined,
      }
    } catch (error) {
      logger.error('Failed to get lock info', error, { userId })
      return { locked: false }
    }
  }

  /**
   * Extend lock TTL
   */
  async extend(userId: string, additionalMs?: number): Promise<boolean> {
    const redis = getRedisClient()
    const key = this.getLockKey(userId)
    const ttl = additionalMs || this.ttl

    try {
      const result = await redis.pexpire(key, ttl)

      if (result === 1) {
        logger.debug('Lock extended', { userId, ttl })
        return true
      }

      return false
    } catch (error) {
      logger.error('Failed to extend lock', error, { userId })
      return false
    }
  }

  /**
   * Execute function with lock
   * Automatically acquires and releases lock
   */
  async withLock<T>(
    userId: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const acquired = await this.acquire(userId, metadata)

    if (!acquired) {
      return {
        success: false,
        error: 'Already locked',
      }
    }

    try {
      const result = await fn()
      return {
        success: true,
        result,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    } finally {
      await this.release(userId)
    }
  }
}

export const lockService = new LockService()
export default lockService

import { getRedisClient } from '../core/redis'
import { config } from '../core/config'
import { logger } from '../utils/logger'

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number
}

class RateLimiterService {
  private globalPrefix = 'ratelimit:global:'
  private userPrefix = 'ratelimit:user:'

  /**
   * Check rate limit for global scope
   */
  async checkGlobal(): Promise<RateLimitResult> {
    const redis = getRedisClient()
    const key = `${this.globalPrefix}requests`
    const { max, window } = config.rateLimit.global

    return this.checkLimit(redis, key, max, window)
  }

  /**
   * Check rate limit for user
   */
  async checkUser(userId: string): Promise<RateLimitResult> {
    const redis = getRedisClient()
    const key = `${this.userPrefix}${userId}`
    const { max, window } = config.rateLimit.perUser

    return this.checkLimit(redis, key, max, window)
  }

  /**
   * Combined check (global + user)
   */
  async check(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const globalResult = await this.checkGlobal()
    if (!globalResult.allowed) {
      logger.warn('Global rate limit exceeded')
      return { allowed: false, reason: 'global' }
    }

    const userResult = await this.checkUser(userId)
    if (!userResult.allowed) {
      logger.warn('User rate limit exceeded', { userId })
      return { allowed: false, reason: 'user' }
    }

    return { allowed: true }
  }

  /**
   * Internal rate limit check
   */
  private async checkLimit(
    redis: ReturnType<typeof getRedisClient>,
    key: string,
    max: number,
    window: number
  ): Promise<RateLimitResult> {
    try {
      const now = Date.now()
      const windowStart = now - window

      // Use Redis transaction for atomic operation
      const result = await redis
        .multi()
        .zremrangebyscore(key, '-inf', windowStart)
        .zcard(key)
        .zadd(key, now, `${now}-${Math.random()}`)
        .pexpire(key, window)
        .exec()

      if (!result) {
        return { allowed: true, remaining: max, resetIn: window }
      }

      const count = result[1]?.[1] as number ?? 0
      const remaining = Math.max(0, max - count - 1)
      const allowed = count < max

      return {
        allowed,
        remaining,
        resetIn: window,
      }
    } catch (error) {
      logger.error('Rate limit check failed', error, { key })
      // Allow on error (fail open)
      return { allowed: true, remaining: 0, resetIn: 0 }
    }
  }

  /**
   * Reset rate limit for user
   */
  async resetUser(userId: string): Promise<void> {
    const redis = getRedisClient()
    const key = `${this.userPrefix}${userId}`

    try {
      await redis.del(key)
      logger.debug('Rate limit reset for user', { userId })
    } catch (error) {
      logger.error('Failed to reset rate limit', error, { userId })
    }
  }
}

export const rateLimiter = new RateLimiterService()
export default rateLimiter

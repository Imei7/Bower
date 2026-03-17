import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface HealthComponent {
  status: boolean
  latency?: number
  error?: string
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string
  uptime: number
  version: string
  components: {
    database: HealthComponent
    redis?: HealthComponent
  }
}

// Redis health check (optional)
async function checkRedis(): Promise<HealthComponent> {
  try {
    // Dynamic import to avoid errors if Redis is not available
    const { getRedisClient } = await import('@/backend/core/redis')
    const redis = getRedisClient()
    const start = Date.now()
    await redis.ping()
    return { status: true, latency: Date.now() - start }
  } catch {
    return {
      status: false,
      error: 'Redis not available',
    }
  }
}

// Database health check
async function checkDatabase(): Promise<HealthComponent> {
  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    return { status: true, latency: Date.now() - start }
  } catch (error) {
    return {
      status: false,
      error: error instanceof Error ? error.message : 'Database connection failed',
    }
  }
}

export async function GET() {
  try {
    // Run health checks in parallel
    const [dbHealth, redisHealth] = await Promise.all([
      checkDatabase(),
      checkRedis().catch(() => ({ status: false, error: 'Redis check failed' })),
    ])

    // Determine overall status
    const allHealthy = dbHealth.status
    const status: 'ok' | 'degraded' | 'error' = allHealthy ? 'ok' : 'error'

    const response: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      components: {
        database: dbHealth,
        redis: redisHealth,
      },
    }

    const statusCode = status === 'ok' ? 200 : status === 'degraded' ? 200 : 503

    return NextResponse.json(response, { status: statusCode })
  } catch (error) {
    const response: HealthResponse = {
      status: 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      components: {
        database: {
          status: false,
          error: error instanceof Error ? error.message : 'Health check failed',
        },
      },
    }

    return NextResponse.json(response, { status: 503 })
  }
}

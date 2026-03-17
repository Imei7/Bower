import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    // Get queue stats
    let queueStats = {
      buyNumber: { waiting: 0, active: 0, completed: 0, failed: 0 },
      sniperOtp: { waiting: 0, active: 0, completed: 0, failed: 0 },
    }

    try {
      const { getQueueStats } = await import('@/backend/queue')
      queueStats = await getQueueStats()
    } catch {
      // Queue may not be available in web-only mode
    }

    // Get Redis health
    let redisStatus = { status: false, latency: 0 }
    try {
      const { redisHealthCheck } = await import('@/backend/core/redis')
      const redisHealth = await redisHealthCheck()
      redisStatus = {
        status: redisHealth.status,
        latency: redisHealth.latency || 0,
      }
    } catch {
      // Redis may not be available
    }

    // Get user count
    const userCount = await prisma.user.count()

    // Get transaction counts
    const [
      totalTransactions,
      successfulTransactions,
      pendingTransactions,
      failedTransactions,
    ] = await Promise.all([
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: 'success' } }),
      prisma.transaction.count({ where: { status: 'waiting_otp' } }),
      prisma.transaction.count({ where: { status: 'failed' } }),
    ])

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      queue: queueStats,
      redis: redisStatus,
      users: {
        total: userCount,
      },
      transactions: {
        total: totalTransactions,
        successful: successfulTransactions,
        pending: pendingTransactions,
        failed: failedTransactions,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to get status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

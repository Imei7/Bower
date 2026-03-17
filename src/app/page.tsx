'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Activity,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Server,
  Database,
  Cpu,
} from 'lucide-react'

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string
  uptime: number
  version: string
  components: {
    database: { status: boolean; latency?: number; error?: string }
    redis?: { status: boolean; latency?: number; error?: string }
  }
}

interface StatusResponse {
  timestamp: string
  uptime: number
  queue: {
    buyNumber: { waiting: number; active: number; completed: number; failed: number }
    sniperOtp: { waiting: number; active: number; completed: number; failed: number }
  }
  redis: { status: boolean; latency: number }
  users: { total: number }
  transactions: {
    total: number
    successful: number
    pending: number
    failed: number
  }
}

function formatUptime(uptime: number): string {
  const days = Math.floor(uptime / 86400)
  const hours = Math.floor((uptime % 86400) / 3600)
  const minutes = Math.floor((uptime % 3600) / 60)
  const seconds = Math.floor(uptime % 60)

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)

  return parts.join(' ')
}

export default function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [healthRes, statusRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/status'),
      ])

      if (!healthRes.ok || !statusRes.ok) {
        throw new Error('Failed to fetch data')
      }

      const healthData = await healthRes.json()
      const statusData = await statusRes.json()

      setHealth(healthData)
      setStatus(statusData)
      setLastUpdate(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)

    return () => clearInterval(interval)
  }, [])

  const successRate = status
    ? status.transactions.total > 0
      ? ((status.transactions.successful / status.transactions.total) * 100).toFixed(1)
      : '0'
    : '0'

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">OTP Sniper Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Real-time monitoring untuk sistem OTP Sniper
            </p>
          </div>
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <Badge
              variant={health?.status === 'ok' ? 'default' : health?.status === 'degraded' ? 'secondary' : 'destructive'}
              className="text-sm px-3 py-1"
            >
              {health?.status === 'ok' ? (
                <CheckCircle className="w-4 h-4 mr-1 inline" />
              ) : (
                <XCircle className="w-4 h-4 mr-1 inline" />
              )}
              {health?.status?.toUpperCase() || 'LOADING'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
            <p className="text-destructive font-medium">Error: {error}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status?.users.total ?? 0}</div>
              <p className="text-xs text-muted-foreground">Terdaftar di sistem</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Transaksi Sukses</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status?.transactions.successful ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                Success rate: {successRate}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sedang Diproses</CardTitle>
              <Clock className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status?.transactions.pending ?? 0}</div>
              <p className="text-xs text-muted-foreground">Menunggu OTP</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Transaksi Gagal</CardTitle>
              <XCircle className="w-4 h-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status?.transactions.failed ?? 0}</div>
              <p className="text-xs text-muted-foreground">Total transaksi gagal</p>
            </CardContent>
          </Card>
        </div>

        {/* System Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Components Health */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5" />
                Komponen Sistem
              </CardTitle>
              <CardDescription>Status kesehatan komponen</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Database */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-muted-foreground" />
                    <span>Database</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {health?.components.database?.status ? (
                      <>
                        <Badge variant="default" className="bg-green-500">
                          Online
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {health?.components.database.latency}ms
                        </span>
                      </>
                    ) : (
                      <Badge variant="destructive">Offline</Badge>
                    )}
                  </div>
                </div>

                {/* Redis */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-muted-foreground" />
                    <span>Redis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {health?.components.redis?.status ? (
                      <>
                        <Badge variant="default" className="bg-green-500">
                          Online
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {health?.components.redis.latency}ms
                        </span>
                      </>
                    ) : (
                      <Badge variant="secondary">Offline</Badge>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Uptime */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-mono text-sm">
                    {formatUptime(health?.uptime ?? 0)}
                  </span>
                </div>

                {/* Version */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono text-sm">{health?.version ?? '-'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Queue Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Queue Status
              </CardTitle>
              <CardDescription>Status antrian BullMQ</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Buy Number Queue */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Buy Number Queue</h4>
                  <div className="grid grid-cols-4 gap-2 text-center text-sm">
                    <div className="bg-yellow-100 dark:bg-yellow-900/20 rounded p-2">
                      <div className="font-bold">{status?.queue.buyNumber.waiting ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Waiting</div>
                    </div>
                    <div className="bg-blue-100 dark:bg-blue-900/20 rounded p-2">
                      <div className="font-bold">{status?.queue.buyNumber.active ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Active</div>
                    </div>
                    <div className="bg-green-100 dark:bg-green-900/20 rounded p-2">
                      <div className="font-bold">{status?.queue.buyNumber.completed ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Done</div>
                    </div>
                    <div className="bg-red-100 dark:bg-red-900/20 rounded p-2">
                      <div className="font-bold">{status?.queue.buyNumber.failed ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Failed</div>
                    </div>
                  </div>
                </div>

                {/* Sniper OTP Queue */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Sniper OTP Queue</h4>
                  <div className="grid grid-cols-4 gap-2 text-center text-sm">
                    <div className="bg-yellow-100 dark:bg-yellow-900/20 rounded p-2">
                      <div className="font-bold">{status?.queue.sniperOtp.waiting ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Waiting</div>
                    </div>
                    <div className="bg-blue-100 dark:bg-blue-900/20 rounded p-2">
                      <div className="font-bold">{status?.queue.sniperOtp.active ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Active</div>
                    </div>
                    <div className="bg-green-100 dark:bg-green-900/20 rounded p-2">
                      <div className="font-bold">{status?.queue.sniperOtp.completed ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Done</div>
                    </div>
                    <div className="bg-red-100 dark:bg-red-900/20 rounded p-2">
                      <div className="font-bold">{status?.queue.sniperOtp.failed ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Failed</div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Success Rate Progress */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Success Rate</span>
                    <span className="font-medium">{successRate}%</span>
                  </div>
                  <Progress value={parseFloat(successRate)} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Last Update */}
        <div className="text-center text-sm text-muted-foreground">
          Terakhir diperbarui: {lastUpdate.toLocaleString('id-ID')}
        </div>
      </div>
    </main>
  )
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  data?: Record<string, unknown>
  duration?: number
  error?: string
}

class Logger {
  private formatTimestamp(): string {
    return new Date().toISOString()
  }

  private formatEntry(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.message,
    ]

    if (entry.data) {
      parts.push(JSON.stringify(entry.data))
    }

    if (entry.duration) {
      parts.push(`(${entry.duration}ms)`)
    }

    if (entry.error) {
      parts.push(`\nError: ${entry.error}`)
    }

    return parts.join(' ')
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      data,
      error: error?.stack || error?.message,
    }

    const output = this.formatEntry(entry)

    switch (level) {
      case 'debug':
        console.debug(output)
        break
      case 'info':
        console.info(output)
        break
      case 'warn':
        console.warn(output)
        break
      case 'error':
        console.error(output)
        break
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data)
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : new Error(String(error))
    this.log('error', message, data, err)
  }

  api(method: string, url: string, duration: number, response?: string, error?: string): void {
    this.log(error ? 'error' : 'info', `API ${method} ${url}`, {
      method,
      url,
      duration,
      response: response?.substring(0, 500),
      error,
    })
  }
}

export const logger = new Logger()
export default logger

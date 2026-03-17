/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate a random delay between min and max
 */
export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Exponential backoff delay
 */
export function exponentialBackoff(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
  const delay = baseDelay * Math.pow(2, attempt)
  return Math.min(delay, maxDelay)
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '-'
  // Format: +62 xxx xxxx xxxx
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 10) return phone

  const countryCode = cleaned.slice(0, 2)
  const part1 = cleaned.slice(2, 5)
  const part2 = cleaned.slice(5, 9)
  const part3 = cleaned.slice(9)

  return `+${countryCode} ${part1} ${part2} ${part3}`.trim()
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format duration in seconds to human readable
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} detik`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) {
    return `${minutes} menit`
  }
  return `${minutes} menit ${remainingSeconds} detik`
}

/**
 * Truncate string
 */
export function truncate(str: string, maxLength: number): string {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}

/**
 * Escape HTML for Telegram
 */
export function escapeHtml(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Generate progress bar
 */
export function progressBar(current: number, total: number, length = 10): string {
  const percentage = Math.min(Math.max(current / total, 0), 1)
  const filled = Math.round(percentage * length)
  const empty = length - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries - 1) {
        const delay = exponentialBackoff(attempt, baseDelay)
        await sleep(delay)
      }
    }
  }

  throw lastError
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  const retryablePatterns = [
    'timeout',
    'econnrefused',
    'econnreset',
    'enotfound',
    'network',
    'rate limit',
    'too many',
  ]

  return retryablePatterns.some(pattern => message.includes(pattern))
}

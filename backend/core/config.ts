export const config = {
  // SMS API Configuration
  smsApi: {
    baseUrl: 'https://smsbower.page/stubs/handler_api.php',
    timeout: 10000,
    maxRetries: 3,
    retryDelay: 1000,
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetries: 10,
    retryDelay: 1000,
  },

  // Queue Configuration
  queue: {
    buyNumber: 'buy-number',
    sniperOtp: 'sniper-otp',
    concurrency: 5,
  },

  // Lock Configuration
  lock: {
    ttl: 120000, // 2 minutes
    prefix: 'lock:user:',
  },

  // Rate Limiting
  rateLimit: {
    global: {
      max: 100,
      window: 60000, // 1 minute
    },
    perUser: {
      max: 10,
      window: 60000, // 1 minute
    },
  },

  // OTP Sniper Configuration
  sniper: {
    pollInterval: 2000, // 2 seconds
    minPollInterval: 1500,
    maxPollInterval: 3000,
    timeout: 120000, // 2 minutes
    maxRetries: 3,
  },

  // Telegram Configuration
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    maxEditsPerMinute: 20,
    editCooldown: 3000, // 3 seconds
  },

  // Default Countries & Services
  defaultCountries: [
    { code: 'id', name: 'Indonesia' },
    { code: 'my', name: 'Malaysia' },
    { code: 'sg', name: 'Singapore' },
    { code: 'th', name: 'Thailand' },
    { code: 'vn', name: 'Vietnam' },
    { code: 'ph', name: 'Philippines' },
    { code: 'us', name: 'United States' },
  ],

  defaultServices: [
    { code: 'wa', name: 'WhatsApp' },
    { code: 'tg', name: 'Telegram' },
    { code: 'fb', name: 'Facebook' },
    { code: 'ig', name: 'Instagram' },
    { code: 'tw', name: 'Twitter' },
    { code: 'go', name: 'Google' },
    { code: 'tt', name: 'TikTok' },
  ],
}

export default config

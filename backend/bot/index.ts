import { Telegraf, Context } from 'telegraf'
import { config } from '../core/config'
import { logger } from '../utils/logger'
import { initRedis, closeRedis } from '../core/redis'
import { closeQueues, getQueueStats } from '../queue'
import {
  handleStart,
  handleBuyOtp,
  handleCountrySelect,
  handleServiceSelect,
  handleConfirm,
  handleStatus,
  handleSettings,
  handleApiKeyInput,
  handleCancel,
  handleCountryPage,
  handleServicePage,
  handleBackToCountry,
  handleCheckBalance,
  handleChangeApiKey,
  handleClose,
} from './handlers'
import { getMainKeyboard } from './keyboards'

// Bot instance
let bot: Telegraf | null = null

/**
 * Create and configure bot
 */
export function createBot(): Telegraf {
  if (!config.telegram.token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required')
  }

  bot = new Telegraf(config.telegram.token)

  // Middleware for logging
  bot.use(async (ctx, next) => {
    const start = Date.now()
    logger.debug('Update received', {
      updateType: ctx.updateType,
      userId: ctx.from?.id,
    })
    await next()
    const duration = Date.now() - start
    logger.debug('Update processed', { duration })
  })

  // Start command
  bot.command('start', handleStart)

  // Text handler for main menu
  bot.hears('🛒 Beli OTP', handleBuyOtp)
  bot.hears('📊 Status', handleStatus)
  bot.hears('⚙️ Pengaturan', handleSettings)

  // API key input handler (must be after specific handlers)
  bot.on('text', async (ctx, next) => {
    const text = ctx.message?.text
    const telegramId = ctx.from?.id

    if (!text || !telegramId) return next()

    // Check if this is an API key (long alphanumeric string)
    if (text.length > 20 && /^[a-zA-Z0-9]+$/.test(text)) {
      await handleApiKeyInput(ctx, text)
      return
    }

    // Unknown text - show main menu
    await ctx.reply(
      '🤖 Perintah tidak dikenali. Gunakan menu di bawah ini:',
      getMainKeyboard()
    )
  })

  // Callback query handlers
  bot.action(/country:(.+)/, (ctx) => {
    const countryCode = ctx.match[1]
    handleCountrySelect(ctx, countryCode)
  })

  bot.action(/service:(.+)/, (ctx) => {
    const serviceCode = ctx.match[1]
    handleServiceSelect(ctx, serviceCode)
  })

  bot.action(/confirm:(.+):(.+)/, (ctx) => {
    const countryCode = ctx.match[1]
    const serviceCode = ctx.match[2]
    handleConfirm(ctx, countryCode, serviceCode)
  })

  bot.action(/country_page:(\d+)/, (ctx) => {
    const page = parseInt(ctx.match[1])
    handleCountryPage(ctx, page)
  })

  bot.action(/service_page:(\d+)/, (ctx) => {
    const page = parseInt(ctx.match[1])
    handleServicePage(ctx, page)
  })

  bot.action('back_to_country', handleBackToCountry)
  bot.action('cancel', handleCancel)
  bot.action('change_apikey', handleChangeApiKey)
  bot.action('check_balance', handleCheckBalance)
  bot.action('close', handleClose)
  bot.action('refresh_status', handleStatus)
  bot.action('noop', (ctx) => ctx.answerCbQuery())

  // Error handler
  bot.catch((err, ctx) => {
    logger.error('Bot error', err, {
      updateType: ctx.updateType,
      userId: ctx.from?.id,
    })
  })

  logger.info('Bot configured')
  return bot
}

/**
 * Get bot instance
 */
export function getBot(): Telegraf {
  if (!bot) {
    bot = createBot()
  }
  return bot
}

/**
 * Start bot
 */
export async function startBot(): Promise<void> {
  const botInstance = getBot()

  // Initialize Redis
  await initRedis()

  // Start polling
  await botInstance.launch()
  logger.info('Bot started with polling')

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`)
    await stopBot()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

/**
 * Stop bot
 */
export async function stopBot(): Promise<void> {
  if (bot) {
    bot.stop()
    logger.info('Bot stopped')
  }
  await closeQueues()
  await closeRedis()
}

const botExports = { createBot, getBot, startBot, stopBot }
export default botExports

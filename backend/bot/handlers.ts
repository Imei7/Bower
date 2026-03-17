import { Context } from 'telegraf'
import { logger } from '../utils/logger'
import { smsApi } from '../services/sms-api'
import { lockService } from '../services/lock'
import { rateLimiter } from '../services/rate-limiter'
import { addBuyNumberJob } from '../queue'
import prisma from '../db'
import {
  getMainKeyboard,
  getCountryKeyboard,
  getServiceKeyboard,
  getConfirmKeyboard,
  getSettingsKeyboard,
  getStatusKeyboard,
  getDefaultCountries,
  getDefaultServices,
} from './keyboards'
import { EMOJI, ERROR_MESSAGES, SUCCESS_MESSAGES, TRANSACTION_STATUS } from '../core/constants'

// Session data cache (in production, use Redis)
const sessions = new Map<number, {
  countryCode?: string
  serviceCode?: string
  messageId?: number
}>()

/**
 * Handle /start command
 */
export async function handleStart(ctx: Context) {
  const telegramId = ctx.from?.id
  if (!telegramId) return

  try {
    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
    })

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          telegramId: String(telegramId),
        },
      })
    }

    // Check if user has API key
    if (!user.apiKey) {
      await ctx.reply(
        `👋 <b>Selamat Datang di OTP Sniper Bot!</b>\n\n` +
        `🔑 Untuk mulai menggunakan bot, silakan masukkan API Key Anda.\n\n` +
        `📝 Ketik API Key Anda:`,
        { parse_mode: 'HTML' }
      )
      return
    }

    // Show main menu
    await ctx.reply(
      `👋 <b>Selamat Datang Kembali!</b>\n\n` +
      `📱 Silakan pilih menu di bawah ini:`,
      {
        parse_mode: 'HTML',
        ...getMainKeyboard(),
      }
    )
  } catch (error) {
    logger.error('Error in handleStart', error, { telegramId })
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.')
  }
}

/**
 * Handle "🛒 Beli OTP" button
 */
export async function handleBuyOtp(ctx: Context) {
  const telegramId = ctx.from?.id
  if (!telegramId) return

  try {
    // Rate limit check
    const rateCheck = await rateLimiter.check(String(telegramId))
    if (!rateCheck.allowed) {
      await ctx.reply(ERROR_MESSAGES.RATE_LIMIT)
      return
    }

    // Check if locked
    const isLocked = await lockService.isLocked(String(telegramId))
    if (isLocked) {
      await ctx.reply(ERROR_MESSAGES.LOCKED)
      return
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
    })

    if (!user?.apiKey) {
      await ctx.reply(ERROR_MESSAGES.NO_API_KEY)
      return
    }

    // Validate API key
    const validation = await smsApi.validateApiKey(user.apiKey)
    if (!validation.valid) {
      await ctx.reply(ERROR_MESSAGES.INVALID_API_KEY)
      return
    }

    // Check balance
    if (validation.balance !== undefined && validation.balance < 1) {
      await ctx.reply(ERROR_MESSAGES.NO_BALANCE)
      return
    }

    // Show country selection
    const countries = getDefaultCountries()
    await ctx.reply(
      `🌍 <b>Pilih Country</b>\n\n` +
      `Silakan pilih country untuk nomor OTP:`,
      {
        parse_mode: 'HTML',
        ...getCountryKeyboard(countries),
      }
    )
  } catch (error) {
    logger.error('Error in handleBuyOtp', error, { telegramId })
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.')
  }
}

/**
 * Handle country selection
 */
export async function handleCountrySelect(ctx: Context, countryCode: string) {
  const telegramId = ctx.from?.id
  if (!telegramId) return

  try {
    // Store country in session
    sessions.set(telegramId, {
      ...sessions.get(telegramId),
      countryCode,
    })

    // Show service selection
    const services = getDefaultServices()
    await ctx.editMessageText(
      `📱 <b>Pilih Service</b>\n\n` +
      `📍 Country: <b>${countryCode.toUpperCase()}</b>\n\n` +
      `Silakan pilih service untuk OTP:`,
      {
        parse_mode: 'HTML',
        ...getServiceKeyboard(services),
      }
    )
  } catch (error) {
    logger.error('Error in handleCountrySelect', error, { telegramId })
  }
}

/**
 * Handle service selection
 */
export async function handleServiceSelect(ctx: Context, serviceCode: string) {
  const telegramId = ctx.from?.id
  if (!telegramId) return

  try {
    const session = sessions.get(telegramId)
    if (!session?.countryCode) {
      await ctx.editMessageText('❌ Sesi tidak valid. Silakan mulai ulang.')
      return
    }

    // Store service in session
    sessions.set(telegramId, {
      ...session,
      serviceCode,
    })

    // Show confirmation
    const country = getDefaultCountries().find(c => c.code === session.countryCode)
    const service = getDefaultServices().find(s => s.code === serviceCode)

    await ctx.editMessageText(
      `✅ <b>Konfirmasi Pembelian</b>\n\n` +
      `🌍 Country: <b>${country?.name || session.countryCode.toUpperCase()}</b>\n` +
      `📱 Service: <b>${service?.name || serviceCode.toUpperCase()}</b>\n\n` +
      `Lanjutkan pembelian nomor OTP?`,
      {
        parse_mode: 'HTML',
        ...getConfirmKeyboard(session.countryCode, serviceCode),
      }
    )
  } catch (error) {
    logger.error('Error in handleServiceSelect', error, { telegramId })
  }
}

/**
 * Handle purchase confirmation
 */
export async function handleConfirm(ctx: Context, countryCode: string, serviceCode: string) {
  const telegramId = ctx.from?.id
  const chatId = ctx.chat?.id
  if (!telegramId || !chatId) return

  try {
    // Get user
    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
    })

    if (!user?.apiKey) {
      await ctx.editMessageText(ERROR_MESSAGES.NO_API_KEY)
      return
    }

    // Acquire lock
    const locked = await lockService.acquire(String(telegramId), {
      countryCode,
      serviceCode,
    })

    if (!locked) {
      await ctx.editMessageText(ERROR_MESSAGES.LOCKED)
      return
    }

    // Show loading message
    const message = await ctx.editMessageText(
      `🔄 <b>Memproses...</b>\n\n` +
      `⏳ Melakukan checklist sistem...`,
      { parse_mode: 'HTML' }
    )

    // Checklist
    const checks = []

    // Check API key validity
    const validation = await smsApi.validateApiKey(user.apiKey)
    if (validation.valid) {
      checks.push(`${EMOJI.CHECK} API key valid`)
    } else {
      checks.push(`${EMOJI.CROSS} API key tidak valid`)
      await lockService.release(String(telegramId))
      await ctx.editMessageText(
        `❌ <b>Checklist Gagal</b>\n\n${checks.join('\n')}`,
        { parse_mode: 'HTML' }
      )
      return
    }

    // Check balance
    if (validation.balance !== undefined && validation.balance > 0) {
      checks.push(`${EMOJI.CHECK} Saldo cukup (${validation.balance})`)
    } else {
      checks.push(`${EMOJI.CROSS} Saldo tidak cukup`)
      await lockService.release(String(telegramId))
      await ctx.editMessageText(
        `❌ <b>Checklist Gagal</b>\n\n${checks.join('\n')}`,
        { parse_mode: 'HTML' }
      )
      return
    }

    // All checks passed
    checks.push(`${EMOJI.CHECK} Country tersedia`)
    checks.push(`${EMOJI.CHECK} Service tersedia`)
    checks.push(`${EMOJI.CHECK} Limit user cukup`)

    await ctx.editMessageText(
      `✅ <b>Checklist Berhasil</b>\n\n${checks.join('\n')}\n\n` +
      `🔒 Auto lock aktif\n` +
      `⏳ Memulai pembelian...`,
      { parse_mode: 'HTML' }
    )

    // Add job to queue
    const job = await addBuyNumberJob({
      userId: user.id,
      apiKey: user.apiKey,
      countryCode,
      serviceCode,
      telegramId,
      chatId,
      messageId: message.message_id,
    })

    logger.info('Buy number job added', {
      jobId: job.id,
      userId: user.id,
      countryCode,
      serviceCode,
    })

    // Clear session
    sessions.delete(telegramId)
  } catch (error) {
    logger.error('Error in handleConfirm', error, { telegramId })
    await lockService.release(String(telegramId))
    await ctx.editMessageText('❌ Terjadi kesalahan. Silakan coba lagi.')
  }
}

/**
 * Handle "📊 Status" button
 */
export async function handleStatus(ctx: Context) {
  const telegramId = ctx.from?.id
  if (!telegramId) return

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })

    if (!user) {
      await ctx.reply('❌ User tidak ditemukan.')
      return
    }

    let message = `📊 <b>Status Akun</b>\n\n`
    message += `🔑 API Key: ${user.apiKey ? '✅ Terdaftar' : '❌ Belum diatur'}\n`

    if (user.apiKey) {
      const balance = await smsApi.getBalance(user.apiKey)
      message += `💰 Saldo: ${balance.balance || 0}\n`
    }

    message += `\n📱 <b>Transaksi Terakhir (${user.transactions.length})</b>\n`

    if (user.transactions.length === 0) {
      message += `Tidak ada transaksi.\n`
    } else {
      for (const tx of user.transactions) {
        const statusEmoji = tx.status === TRANSACTION_STATUS.SUCCESS ? '✅' :
          tx.status === TRANSACTION_STATUS.WAITING_OTP ? '⏳' :
            tx.status === TRANSACTION_STATUS.FAILED ? '❌' : '⏸'
        message += `\n${statusEmoji} <b>${tx.phoneNumber || '-'}</b>\n`
        message += `   Service: ${tx.serviceCode?.toUpperCase() || '-'}\n`
        message += `   OTP: ${tx.otp || '-'}\n`
        message += `   Status: ${tx.status}\n`
      }
    }

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...getStatusKeyboard(),
    })
  } catch (error) {
    logger.error('Error in handleStatus', error, { telegramId })
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.')
  }
}

/**
 * Handle "⚙️ Pengaturan" button
 */
export async function handleSettings(ctx: Context) {
  await ctx.reply(
    `⚙️ <b>Pengaturan</b>\n\n` +
    `Silakan pilih opsi di bawah ini:`,
    {
      parse_mode: 'HTML',
      ...getSettingsKeyboard(),
    }
  )
}

/**
 * Handle API key input
 */
export async function handleApiKeyInput(ctx: Context, apiKey: string) {
  const telegramId = ctx.from?.id
  if (!telegramId) return

  try {
    // Validate API key
    const validation = await smsApi.validateApiKey(apiKey)

    if (!validation.valid) {
      await ctx.reply(ERROR_MESSAGES.INVALID_API_KEY)
      return
    }

    // Save API key
    await prisma.user.upsert({
      where: { telegramId: String(telegramId) },
      update: { apiKey },
      create: {
        telegramId: String(telegramId),
        apiKey,
      },
    })

    await ctx.reply(
      `✅ ${SUCCESS_MESSAGES.API_KEY_SET}\n\n` +
      `💰 Saldo Anda: ${validation.balance || 0}\n\n` +
      `Silakan pilih menu di bawah ini:`,
      {
        parse_mode: 'HTML',
        ...getMainKeyboard(),
      }
    )
  } catch (error) {
    logger.error('Error in handleApiKeyInput', error, { telegramId })
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.')
  }
}

/**
 * Handle cancel action
 */
export async function handleCancel(ctx: Context) {
  const telegramId = ctx.from?.id
  if (!telegramId) return

  sessions.delete(telegramId)
  await lockService.release(String(telegramId))

  await ctx.editMessageText(
    `🚫 <b>Dibatalkan</b>\n\n` +
    `Operasi telah dibatalkan.`,
    { parse_mode: 'HTML' }
  )
}

/**
 * Handle page navigation
 */
export async function handleCountryPage(ctx: Context, page: number) {
  const countries = getDefaultCountries()
  try {
    await ctx.editMessageText(
      `🌍 <b>Pilih Country</b>\n\n` +
      `Silakan pilih country untuk nomor OTP:`,
      {
        parse_mode: 'HTML',
        ...getCountryKeyboard(countries, page),
      }
    )
  } catch (error) {
    logger.error('Error in handleCountryPage', error)
  }
}

/**
 * Handle service page navigation
 */
export async function handleServicePage(ctx: Context, page: number) {
  const services = getDefaultServices()
  const session = sessions.get(ctx.from?.id || 0)

  try {
    await ctx.editMessageText(
      `📱 <b>Pilih Service</b>\n\n` +
      `📍 Country: <b>${session?.countryCode?.toUpperCase() || '-'}</b>\n\n` +
      `Silakan pilih service untuk OTP:`,
      {
        parse_mode: 'HTML',
        ...getServiceKeyboard(services, page),
      }
    )
  } catch (error) {
    logger.error('Error in handleServicePage', error)
  }
}

/**
 * Handle back to country
 */
export async function handleBackToCountry(ctx: Context) {
  const countries = getDefaultCountries()
  try {
    await ctx.editMessageText(
      `🌍 <b>Pilih Country</b>\n\n` +
      `Silakan pilih country untuk nomor OTP:`,
      {
        parse_mode: 'HTML',
        ...getCountryKeyboard(countries),
      }
    )
  } catch (error) {
    logger.error('Error in handleBackToCountry', error)
  }
}

/**
 * Handle check balance
 */
export async function handleCheckBalance(ctx: Context) {
  const telegramId = ctx.from?.id
  if (!telegramId) return

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
    })

    if (!user?.apiKey) {
      await ctx.answerCbQuery('API Key belum diatur')
      return
    }

    const balance = await smsApi.getBalance(user.apiKey)
    await ctx.answerCbQuery(`Saldo: ${balance.balance || 0}`)
  } catch (error) {
    logger.error('Error in handleCheckBalance', error)
    await ctx.answerCbQuery('Gagal mengambil saldo')
  }
}

/**
 * Handle change API key
 */
export async function handleChangeApiKey(ctx: Context) {
  await ctx.editMessageText(
    `🔑 <b>Ubah API Key</b>\n\n` +
    `Silakan ketik API Key baru Anda:`,
    { parse_mode: 'HTML' }
  )
}

/**
 * Handle close
 */
export async function handleClose(ctx: Context) {
  try {
    await ctx.deleteMessage()
  } catch {
    // Message may already be deleted
  }
}

export { sessions }

import { Worker, Job } from 'bullmq'
import { QUEUE_NAMES, BuyNumberJobData, addSniperOtpJob } from '../index'
import { config } from '../../core/config'
import { SMS_STATUS, TRANSACTION_STATUS } from '../../core/constants'
import { logger } from '../../utils/logger'
import { smsApi } from '../../services/sms-api'
import { lockService } from '../../services/lock'
import prisma from '../../db'
import { Bot } from 'telegraf'

// Store bot instance
let botInstance: Bot | null = null

/**
 * Set bot instance for worker
 */
export function setBotInstance(bot: Bot): void {
  botInstance = bot
}

/**
 * Update telegram message
 */
async function updateMessage(chatId: number, messageId: number, text: string, parseMode?: 'HTML' | 'Markdown'): Promise<void> {
  if (!botInstance) return

  try {
    await botInstance.telegram.editMessageText(chatId, messageId, undefined, text, {
      parse_mode: parseMode,
    })
  } catch (error) {
    logger.error('Failed to update message', error, { chatId, messageId })
  }
}

/**
 * Create buy number worker
 */
export function createBuyNumberWorker(): Worker<BuyNumberJobData> {
  const worker = new Worker<BuyNumberJobData>(
    QUEUE_NAMES.BUY_NUMBER,
    async (job: Job<BuyNumberJobData>) => {
      const { userId, apiKey, countryCode, serviceCode, telegramId, chatId, messageId } = job.data

      logger.info('Processing buy number job', {
        jobId: job.id,
        userId,
        countryCode,
        serviceCode,
      })

      try {
        // Update message if exists
        if (messageId) {
          await updateMessage(
            chatId,
            messageId,
            `🔄 <b>Memproses Pembelian Nomor</b>\n\n` +
            `📍 Country: <b>${countryCode.toUpperCase()}</b>\n` +
            `📱 Service: <b>${serviceCode.toUpperCase()}</b>\n` +
            `⏳ Status: <i>Membeli nomor...</i>`,
            'HTML'
          )
        }

        // Buy number from SMS API
        const response = await smsApi.buyNumber(apiKey, serviceCode, countryCode)

        if (response.status === SMS_STATUS.ACCESS_NUMBER) {
          // Success - got number
          const { activationId, phoneNumber } = response

          // Create transaction record
          const transaction = await prisma.transaction.create({
            data: {
              userId,
              activationId,
              phoneNumber,
              countryCode,
              serviceCode,
              status: TRANSACTION_STATUS.WAITING_OTP,
            },
          })

          // Update message
          if (messageId) {
            await updateMessage(
              chatId,
              messageId,
              `✅ <b>Nomor Berhasil Dibeli!</b>\n\n` +
              `📱 Nomor: <code>${phoneNumber}</code>\n` +
              `📍 Country: <b>${countryCode.toUpperCase()}</b>\n` +
              `📱 Service: <b>${serviceCode.toUpperCase()}</b>\n` +
              `🆔 Activation ID: <code>${activationId}</code>\n\n` +
              `⏳ <i>Menunggu OTP...</i>\n` +
              `⏰ Timeout: <b>2 menit</b>`,
              'HTML'
            )
          }

          // Add sniper OTP job
          await addSniperOtpJob({
            userId,
            apiKey,
            activationId: activationId!,
            phoneNumber: phoneNumber!,
            countryCode,
            serviceCode,
            telegramId,
            chatId,
            messageId,
          })

          return {
            success: true,
            activationId,
            phoneNumber,
            transactionId: transaction.id,
          }
        }

        // Handle errors
        let errorMessage = 'Terjadi kesalahan'

        switch (response.status) {
          case SMS_STATUS.NO_BALANCE:
            errorMessage = '💰 Saldo tidak mencukupi'
            break
          case SMS_STATUS.NO_NUMBERS:
            errorMessage = '📱 Nomor tidak tersedia untuk country/service ini'
            break
          case SMS_STATUS.BAD_SERVICE:
            errorMessage = '❌ Service tidak valid'
            break
          case SMS_STATUS.BAD_KEY:
            errorMessage = '🔑 API Key tidak valid'
            break
          default:
            errorMessage = `❌ Error: ${response.error || response.status}`
        }

        // Update failed transaction
        if (messageId) {
          await updateMessage(
            chatId,
            messageId,
            `❌ <b>Gagal Membeli Nomor</b>\n\n` +
            `${errorMessage}\n\n` +
            `Silakan coba lagi atau pilih country/service lain.`,
            'HTML'
          )
        }

        // Release lock
        await lockService.release(userId)

        return {
          success: false,
          error: errorMessage,
        }
      } catch (error) {
        logger.error('Buy number job failed', error, { jobId: job.id })

        if (messageId) {
          await updateMessage(
            chatId,
            messageId,
            `❌ <b>Error</b>\n\n` +
            `Terjadi kesalahan saat memproses permintaan.\n` +
            `Silakan coba lagi.`,
            'HTML'
          )
        }

        // Release lock
        await lockService.release(userId)

        throw error
      }
    },
    {
      concurrency: config.queue.concurrency,
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        maxRetriesPerRequest: null,
      },
    }
  )

  worker.on('completed', (job) => {
    logger.info('Buy number job completed', { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    logger.error('Buy number job failed', err, { jobId: job?.id })
  })

  logger.info('Buy number worker started')

  return worker
}

export default createBuyNumberWorker

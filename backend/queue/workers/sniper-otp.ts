import { Worker, Job } from 'bullmq'
import { QUEUE_NAMES, SniperOtpJobData } from '../index'
import { config } from '../../core/config'
import { SMS_STATUS, TRANSACTION_STATUS } from '../../core/constants'
import { logger } from '../../utils/logger'
import { smsApi } from '../../services/sms-api'
import { lockService } from '../../services/lock'
import prisma from '../../db'
import { Bot } from 'telegraf'
import { sleep, randomDelay } from '../../utils/helpers'

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
async function updateMessage(chatId: number, messageId: number, text: string): Promise<void> {
  if (!botInstance) return

  try {
    await botInstance.telegram.editMessageText(chatId, messageId, undefined, text, {
      parse_mode: 'HTML',
    })
  } catch (error) {
    logger.error('Failed to update message', error, { chatId, messageId })
  }
}

/**
 * Create sniper OTP worker
 */
export function createSniperOtpWorker(): Worker<SniperOtpJobData> {
  const worker = new Worker<SniperOtpJobData>(
    QUEUE_NAMES.SNIPER_OTP,
    async (job: Job<SniperOtpJobData>) => {
      const {
        userId,
        apiKey,
        activationId,
        phoneNumber,
        countryCode,
        serviceCode,
        telegramId,
        chatId,
        messageId,
        retryCount = 0,
      } = job.data

      logger.info('Starting OTP sniper', {
        jobId: job.id,
        activationId,
        retryCount,
      })

      const startTime = Date.now()
      const timeout = config.sniper.timeout
      let lastUpdateTime = 0
      const editCooldown = config.telegram.editCooldown

      try {
        while (true) {
          // Check timeout
          const elapsed = Date.now() - startTime
          if (elapsed >= timeout) {
            // Timeout reached
            logger.warn('OTP sniper timeout', { activationId, elapsed })

            // Cancel activation
            await smsApi.cancelActivation(apiKey, activationId)

            // Update transaction
            await prisma.transaction.updateMany({
              where: { activationId },
              data: {
                status: TRANSACTION_STATUS.TIMEOUT,
                endTime: new Date(),
                error: 'Timeout waiting for OTP',
              },
            })

            // Update message
            if (messageId) {
              await updateMessage(
                chatId,
                messageId,
                `⏰ <b>Timeout!</b>\n\n` +
                `📱 Nomor: <code>${phoneNumber}</code>\n` +
                `⏱ Waktu: <b>${Math.round(elapsed / 1000)} detik</b>\n\n` +
                `❌ OTP tidak diterima dalam waktu yang ditentukan.\n` +
                `Transaksi dibatalkan secara otomatis.`,
                'HTML'
              )
            }

            // Release lock
            await lockService.release(userId)

            return {
              success: false,
              error: 'Timeout',
            }
          }

          // Get SMS code
          const response = await smsApi.getSmsCode(apiKey, activationId)

          // Check if OTP received
          if (response.status === SMS_STATUS.STATUS_OK && response.otp) {
            // Success! OTP received
            logger.info('OTP received', {
              activationId,
              otp: response.otp,
              elapsed,
            })

            // Finish activation
            await smsApi.finishActivation(apiKey, activationId)

            // Update transaction
            await prisma.transaction.updateMany({
              where: { activationId },
              data: {
                status: TRANSACTION_STATUS.SUCCESS,
                otp: response.otp,
                endTime: new Date(),
              },
            })

            // Update message
            if (messageId) {
              await updateMessage(
                chatId,
                messageId,
                `🎉 <b>OTP DITERIMA!</b>\n\n` +
                `📱 Nomor: <code>${phoneNumber}</code>\n` +
                `🔑 OTP: <code>${response.otp}</code>\n` +
                `📍 Country: <b>${countryCode.toUpperCase()}</b>\n` +
                `📱 Service: <b>${serviceCode.toUpperCase()}</b>\n` +
                `⏱ Waktu: <b>${Math.round(elapsed / 1000)} detik</b>\n\n` +
                `✅ Transaksi selesai!`,
                'HTML'
              )
            }

            // Release lock
            await lockService.release(userId)

            return {
              success: true,
              otp: response.otp,
              activationId,
            }
          }

          // Still waiting for OTP
          if (response.status === SMS_STATUS.STATUS_WAIT_CODE) {
            // Update progress message (with rate limiting)
            const now = Date.now()
            if (messageId && now - lastUpdateTime >= editCooldown) {
              const remaining = Math.round((timeout - elapsed) / 1000)
              const progress = Math.round((elapsed / timeout) * 100)

              await updateMessage(
                chatId,
                messageId,
                `⏳ <b>Menunggu OTP...</b>\n\n` +
                `📱 Nomor: <code>${phoneNumber}</code>\n` +
                `📍 Country: <b>${countryCode.toUpperCase()}</b>\n` +
                `📱 Service: <b>${serviceCode.toUpperCase()}</b>\n` +
                `🆔 Activation ID: <code>${activationId}</code>\n\n` +
                `⏱ Waktu tersisa: <b>${remaining} detik</b>\n` +
                `📊 Progress: <b>${progress}%</b>`,
                'HTML'
              )
              lastUpdateTime = now
            }

            // Wait before next poll
            const pollInterval = randomDelay(
              config.sniper.minPollInterval,
              config.sniper.maxPollInterval
            )
            await sleep(pollInterval)
            continue
          }

          // Handle other statuses
          if (response.status === SMS_STATUS.STATUS_CANCEL) {
            logger.warn('Activation cancelled', { activationId })

            // Update transaction
            await prisma.transaction.updateMany({
              where: { activationId },
              data: {
                status: TRANSACTION_STATUS.CANCELLED,
                endTime: new Date(),
                error: 'Activation cancelled',
              },
            })

            // Update message
            if (messageId) {
              await updateMessage(
                chatId,
                messageId,
                `🚫 <b>Dibatalkan</b>\n\n` +
                `Aktivasi telah dibatalkan.`,
                'HTML'
              )
            }

            // Release lock
            await lockService.release(userId)

            return {
              success: false,
              error: 'Cancelled',
            }
          }

          // Unknown status - continue polling
          logger.warn('Unknown SMS status', {
            activationId,
            status: response.status,
          })

          await sleep(config.sniper.pollInterval)
        }
      } catch (error) {
        logger.error('OTP sniper error', error, { jobId: job.id, activationId })

        // Update transaction
        await prisma.transaction.updateMany({
          where: { activationId },
          data: {
            status: TRANSACTION_STATUS.FAILED,
            endTime: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        })

        // Update message
        if (messageId) {
          await updateMessage(
            chatId,
            messageId,
            `❌ <b>Error</b>\n\n` +
            `Terjadi kesalahan saat menunggu OTP.\n` +
            `${error instanceof Error ? error.message : 'Unknown error'}`,
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
    logger.info('Sniper OTP job completed', { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    logger.error('Sniper OTP job failed', err, { jobId: job?.id })
  })

  logger.info('Sniper OTP worker started')

  return worker
}

export default createSniperOtpWorker

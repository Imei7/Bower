import axios, { AxiosInstance } from 'axios'
import { config } from '../core/config'
import { SMS_STATUS } from '../core/constants'
import { logger } from '../utils/logger'
import { retryWithBackoff } from '../utils/helpers'

interface SmsApiResponse {
  status: string
  data?: string
  activationId?: string
  phoneNumber?: string
  otp?: string
  balance?: number
  error?: string
}

interface CountryInfo {
  code: string
  name: string
}

interface ServiceInfo {
  code: string
  name: string
  cost: number
  count: number
}

class SmsApiService {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: config.smsApi.baseUrl,
      timeout: config.smsApi.timeout,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        const duration = response.config?.metadata?.startTime
          ? Date.now() - response.config.metadata.startTime
          : 0
        logger.api(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          duration,
          typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        )
        return response
      },
      (error) => {
        logger.api(
          error.config?.method?.toUpperCase() || 'GET',
          error.config?.url || '',
          0,
          undefined,
          error.message
        )
        return Promise.reject(error)
      }
    )
  }

  /**
   * Make API request with retry
   */
  private async request(params: Record<string, string>): Promise<string> {
    const startTime = Date.now()

    try {
      const response = await retryWithBackoff(
        async () => {
          const res = await this.client.get('', {
            params,
            metadata: { startTime },
          } as any)
          return res.data
        },
        config.smsApi.maxRetries,
        config.smsApi.retryDelay
      )

      return response.trim()
    } catch (error) {
      logger.error('SMS API request failed', error, { params })
      throw error
    }
  }

  /**
   * Parse raw API response to structured object
   */
  private parseResponse(raw: string): SmsApiResponse {
    const clean = raw.trim()

    // ACCESS_NUMBER:$id:$phone
    if (clean.startsWith(SMS_STATUS.ACCESS_NUMBER)) {
      const parts = clean.split(':')
      if (parts.length >= 3) {
        return {
          status: SMS_STATUS.ACCESS_NUMBER,
          activationId: parts[1],
          phoneNumber: parts[2],
          data: clean,
        }
      }
    }

    // STATUS_OK:$code
    if (clean.startsWith(SMS_STATUS.STATUS_OK)) {
      const parts = clean.split(':')
      if (parts.length >= 2) {
        return {
          status: SMS_STATUS.STATUS_OK,
          otp: parts[1],
          data: clean,
        }
      }
    }

    // STATUS_WAIT_CODE
    if (clean === SMS_STATUS.STATUS_WAIT_CODE) {
      return {
        status: SMS_STATUS.STATUS_WAIT_CODE,
        data: clean,
      }
    }

    // STATUS_WAIT_RETRY
    if (clean === SMS_STATUS.STATUS_WAIT_RETRY) {
      return {
        status: SMS_STATUS.STATUS_WAIT_RETRY,
        data: clean,
      }
    }

    // STATUS_CANCEL
    if (clean === SMS_STATUS.STATUS_CANCEL) {
      return {
        status: SMS_STATUS.STATUS_CANCEL,
        data: clean,
      }
    }

    // NO_BALANCE
    if (clean === SMS_STATUS.NO_BALANCE) {
      return {
        status: SMS_STATUS.NO_BALANCE,
        error: 'Insufficient balance',
        data: clean,
      }
    }

    // NO_NUMBERS
    if (clean === SMS_STATUS.NO_NUMBERS) {
      return {
        status: SMS_STATUS.NO_NUMBERS,
        error: 'No numbers available',
        data: clean,
      }
    }

    // BAD_SERVICE
    if (clean === SMS_STATUS.BAD_SERVICE) {
      return {
        status: SMS_STATUS.BAD_SERVICE,
        error: 'Invalid service',
        data: clean,
      }
    }

    // BAD_KEY
    if (clean === SMS_STATUS.BAD_KEY) {
      return {
        status: SMS_STATUS.BAD_KEY,
        error: 'Invalid API key',
        data: clean,
      }
    }

    // ERROR_SQL
    if (clean === SMS_STATUS.ERROR_SQL) {
      return {
        status: SMS_STATUS.ERROR_SQL,
        error: 'SQL error',
        data: clean,
      }
    }

    // Balance response (number)
    if (!isNaN(Number(clean))) {
      return {
        status: 'BALANCE',
        balance: parseFloat(clean),
        data: clean,
      }
    }

    // Unknown response
    return {
      status: SMS_STATUS.UNKNOWN,
      data: clean,
    }
  }

  /**
   * Get user balance
   */
  async getBalance(apiKey: string): Promise<{ balance: number; error?: string }> {
    try {
      const raw = await this.request({
        api_key: apiKey,
        action: 'getBalance',
      })

      const parsed = this.parseResponse(raw)

      if (parsed.balance !== undefined) {
        return { balance: parsed.balance }
      }

      if (parsed.error) {
        return { balance: 0, error: parsed.error }
      }

      return { balance: 0, error: 'Unknown response' }
    } catch (error) {
      return {
        balance: 0,
        error: error instanceof Error ? error.message : 'Request failed',
      }
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(apiKey: string): Promise<{ valid: boolean; balance?: number; error?: string }> {
    const result = await this.getBalance(apiKey)

    if (result.error) {
      return { valid: false, error: result.error }
    }

    return { valid: true, balance: result.balance }
  }

  /**
   * Get available countries
   */
  async getCountries(apiKey: string): Promise<CountryInfo[]> {
    try {
      const raw = await this.request({
        api_key: apiKey,
        action: 'getCountries',
      })

      // Parse countries from response
      // Format may vary, handle accordingly
      const countries: CountryInfo[] = []

      // Use default countries if parsing fails
      if (!raw || raw === SMS_STATUS.BAD_KEY) {
        return config.defaultCountries
      }

      return countries.length > 0 ? countries : config.defaultCountries
    } catch (error) {
      logger.error('Failed to get countries', error)
      return config.defaultCountries
    }
  }

  /**
   * Get available services
   */
  async getServices(apiKey: string, country?: string): Promise<ServiceInfo[]> {
    try {
      const raw = await this.request({
        api_key: apiKey,
        action: 'getServices',
        country: country || '',
      })

      // Parse services from response
      // Format may vary, handle accordingly
      const services: ServiceInfo[] = []

      // Use default services if parsing fails
      if (!raw || raw === SMS_STATUS.BAD_KEY) {
        return config.defaultServices.map(s => ({
          code: s.code,
          name: s.name,
          cost: 0,
          count: 0,
        }))
      }

      return services.length > 0 ? services : config.defaultServices.map(s => ({
        code: s.code,
        name: s.name,
        cost: 0,
        count: 0,
      }))
    } catch (error) {
      logger.error('Failed to get services', error)
      return config.defaultServices.map(s => ({
        code: s.code,
        name: s.name,
        cost: 0,
        count: 0,
      }))
    }
  }

  /**
   * Buy a phone number
   */
  async buyNumber(
    apiKey: string,
    service: string,
    country: string
  ): Promise<SmsApiResponse> {
    try {
      const raw = await this.request({
        api_key: apiKey,
        action: 'getNumber',
        service,
        country,
      })

      const parsed = this.parseResponse(raw)

      logger.info('Buy number response', {
        service,
        country,
        status: parsed.status,
        activationId: parsed.activationId,
        phoneNumber: parsed.phoneNumber,
      })

      return parsed
    } catch (error) {
      logger.error('Failed to buy number', error, { service, country })
      return {
        status: SMS_STATUS.ERROR_SQL,
        error: error instanceof Error ? error.message : 'Request failed',
      }
    }
  }

  /**
   * Get SMS code (OTP)
   */
  async getSmsCode(apiKey: string, activationId: string): Promise<SmsApiResponse> {
    try {
      const raw = await this.request({
        api_key: apiKey,
        action: 'getStatus',
        id: activationId,
      })

      const parsed = this.parseResponse(raw)

      logger.debug('Get SMS code response', {
        activationId,
        status: parsed.status,
      })

      return parsed
    } catch (error) {
      logger.error('Failed to get SMS code', error, { activationId })
      return {
        status: SMS_STATUS.UNKNOWN,
        error: error instanceof Error ? error.message : 'Request failed',
      }
    }
  }

  /**
   * Cancel activation
   */
  async cancelActivation(apiKey: string, activationId: string): Promise<SmsApiResponse> {
    try {
      const raw = await this.request({
        api_key: apiKey,
        action: 'setStatus',
        id: activationId,
        status: '8', // Cancel status
      })

      const parsed = this.parseResponse(raw)

      logger.info('Cancel activation response', {
        activationId,
        status: parsed.status,
      })

      return parsed
    } catch (error) {
      logger.error('Failed to cancel activation', error, { activationId })
      return {
        status: SMS_STATUS.UNKNOWN,
        error: error instanceof Error ? error.message : 'Request failed',
      }
    }
  }

  /**
   * Finish activation (mark as success)
   */
  async finishActivation(apiKey: string, activationId: string): Promise<SmsApiResponse> {
    try {
      const raw = await this.request({
        api_key: apiKey,
        action: 'setStatus',
        id: activationId,
        status: '6', // Finish status
      })

      const parsed = this.parseResponse(raw)

      logger.info('Finish activation response', {
        activationId,
        status: parsed.status,
      })

      return parsed
    } catch (error) {
      logger.error('Failed to finish activation', error, { activationId })
      return {
        status: SMS_STATUS.UNKNOWN,
        error: error instanceof Error ? error.message : 'Request failed',
      }
    }
  }
}

export const smsApi = new SmsApiService()
export default smsApi

import { Markup } from 'telegraf'
import { config } from '../core/config'

/**
 * Main reply keyboard (shown always)
 */
export function getMainKeyboard() {
  return Markup.keyboard([
    ['🛒 Beli OTP'],
    ['📊 Status', '⚙️ Pengaturan'],
  ]).resize()
}

/**
 * Inline keyboard for country selection
 */
export function getCountryKeyboard(countries: { code: string; name: string }[], page = 0, perPage = 6) {
  const start = page * perPage
  const end = start + perPage
  const pageCountries = countries.slice(start, end)
  const totalPages = Math.ceil(countries.length / perPage)

  const buttons = pageCountries.map(c => [
    Markup.button.callback(`${c.name} (${c.code.toUpperCase()})`, `country:${c.code}`),
  ])

  // Navigation buttons
  const navButtons = []
  if (page > 0) {
    navButtons.push(Markup.button.callback('⬅️ Prev', `country_page:${page - 1}`))
  }
  navButtons.push(Markup.button.callback(`📄 ${page + 1}/${totalPages}`, 'noop'))
  if (page < totalPages - 1) {
    navButtons.push(Markup.button.callback('➡️ Next', `country_page:${page + 1}`))
  }

  if (navButtons.length > 1) {
    buttons.push(navButtons)
  }

  buttons.push([
    Markup.button.callback('❌ Batal', 'cancel'),
  ])

  return Markup.inlineKeyboard(buttons)
}

/**
 * Inline keyboard for service selection
 */
export function getServiceKeyboard(services: { code: string; name: string }[], page = 0, perPage = 6) {
  const start = page * perPage
  const end = start + perPage
  const pageServices = services.slice(start, end)
  const totalPages = Math.ceil(services.length / perPage)

  const buttons = pageServices.map(s => [
    Markup.button.callback(`${s.name} (${s.code.toUpperCase()})`, `service:${s.code}`),
  ])

  // Navigation buttons
  const navButtons = []
  if (page > 0) {
    navButtons.push(Markup.button.callback('⬅️ Prev', `service_page:${page - 1}`))
  }
  navButtons.push(Markup.button.callback(`📄 ${page + 1}/${totalPages}`, 'noop'))
  if (page < totalPages - 1) {
    navButtons.push(Markup.button.callback('➡️ Next', `service_page:${page + 1}`))
  }

  if (navButtons.length > 1) {
    buttons.push(navButtons)
  }

  buttons.push([
    Markup.button.callback('🔙 Kembali', 'back_to_country'),
  ])

  buttons.push([
    Markup.button.callback('❌ Batal', 'cancel'),
  ])

  return Markup.inlineKeyboard(buttons)
}

/**
 * Inline keyboard for confirmation
 */
export function getConfirmKeyboard(countryCode: string, serviceCode: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Ya, Beli!', `confirm:${countryCode}:${serviceCode}`),
    ],
    [
      Markup.button.callback('❌ Batal', 'cancel'),
    ],
  ])
}

/**
 * Inline keyboard for settings
 */
export function getSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔑 Ubah API Key', 'change_apikey'),
    ],
    [
      Markup.button.callback('📊 Lihat Saldo', 'check_balance'),
    ],
    [
      Markup.button.callback('❌ Tutup', 'close'),
    ],
  ])
}

/**
 * Inline keyboard for status
 */
export function getStatusKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 Refresh', 'refresh_status'),
    ],
    [
      Markup.button.callback('❌ Tutup', 'close'),
    ],
  ])
}

/**
 * Get default countries
 */
export function getDefaultCountries() {
  return config.defaultCountries
}

/**
 * Get default services
 */
export function getDefaultServices() {
  return config.defaultServices
}

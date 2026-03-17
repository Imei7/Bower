// SMS API Response Status
export const SMS_STATUS = {
  ACCESS_NUMBER: 'ACCESS_NUMBER',
  STATUS_OK: 'STATUS_OK',
  STATUS_WAIT_CODE: 'STATUS_WAIT_CODE',
  STATUS_WAIT_RETRY: 'STATUS_WAIT_RETRY',
  STATUS_CANCEL: 'STATUS_CANCEL',
  NO_BALANCE: 'NO_BALANCE',
  NO_NUMBERS: 'NO_NUMBERS',
  BAD_SERVICE: 'BAD_SERVICE',
  BAD_KEY: 'BAD_KEY',
  ERROR_SQL: 'ERROR_SQL',
  UNKNOWN: 'UNKNOWN',
} as const

// Transaction Status
export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  WAITING_OTP: 'waiting_otp',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
} as const

// Job Status
export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

// Lock Status
export const LOCK_STATUS = {
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
} as const

// Error Messages
export const ERROR_MESSAGES = {
  NO_API_KEY: '🔑 API Key belum diatur. Silakan masukkan API Key terlebih dahulu.',
  INVALID_API_KEY: '❌ API Key tidak valid. Silakan periksa kembali.',
  NO_BALANCE: '💰 Saldo tidak mencukupi. Silakan top up terlebih dahulu.',
  NO_NUMBERS: '📱 Nomor tidak tersedia untuk country/service ini.',
  SERVICE_UNAVAILABLE: '🔧 Service tidak tersedia saat ini.',
  LOCKED: '🔒 Anda memiliki transaksi yang sedang diproses. Mohon tunggu.',
  TIMEOUT: '⏰ Waktu habis. OTP tidak diterima dalam waktu yang ditentukan.',
  UNKNOWN_ERROR: '❓ Terjadi kesalahan yang tidak diketahui.',
  RATE_LIMIT: '🚫 Terlalu banyak permintaan. Mohon tunggu sebentar.',
} as const

// Success Messages
export const SUCCESS_MESSAGES = {
  API_KEY_SET: '✅ API Key berhasil disimpan!',
  NUMBER_BOUGHT: '📱 Nomor berhasil dibeli!',
  OTP_RECEIVED: '🎉 OTP berhasil diterima!',
  TRANSACTION_CANCELLED: '🚫 Transaksi dibatalkan.',
} as const

// Emoji
export const EMOJI = {
  CHECK: '✔',
  CROSS: '✖',
  LOADING: '⏳',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  MONEY: '💰',
  PHONE: '📱',
  KEY: '🔑',
  LOCK: '🔒',
  UNLOCK: '🔓',
  CLOCK: '⏰',
  ROCKET: '🚀',
  CHART: '📊',
  GEAR: '⚙️',
  SHOPPING: '🛒',
} as const

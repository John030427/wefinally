const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g
const OPENID_ASSIGNMENT_PATTERN = /\bOPENID\s*[:=]\s*[A-Za-z0-9_-]{20,}/gi
const OPENID_VALUE_PATTERN = /\bo[A-Za-z0-9_-]{27,}/g
const API_KEY_ASSIGNMENT_PATTERN = /\b(?:DEEPSEEK_API_KEY|LLM_API_KEY|MINIMAX_API_KEY|WXPAY_API_V3_KEY)\s*[:=]\s*["']?[A-Za-z0-9_+\-/=]{16,}["']?/gi
const GENERIC_SK_PATTERN = /\bsk-[A-Za-z0-9_-]{20,}/g
const EXACT_ADDRESS_PATTERN = /[\u4e00-\u9fff]{2,12}(?:区|县|市)[\u4e00-\u9fffA-Za-z0-9]{1,24}(?:路|街|道|巷)\d{1,6}号/g
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

export function sanitizeGraphText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 0
  return value
    .replace(CONTROL_PATTERN, '')
    .replace(API_KEY_ASSIGNMENT_PATTERN, '[密钥已隐藏]')
    .replace(GENERIC_SK_PATTERN, '[密钥已隐藏]')
    .replace(OPENID_ASSIGNMENT_PATTERN, '[用户标识已隐藏]')
    .replace(OPENID_VALUE_PATTERN, '[用户标识已隐藏]')
    .replace(PHONE_PATTERN, '[手机号已隐藏]')
    .replace(EXACT_ADDRESS_PATTERN, '[地址已模糊]')
    .slice(0, limit)
}

'use strict'

function maskPhone(phone) {
  const raw = String(phone || '').trim()
  if (!raw) return ''
  if (raw.includes('*')) return raw
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 7) return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  if (raw.length <= 4) return '****'
  return `${raw.slice(0, 2)}****${raw.slice(-2)}`
}

function sanitizePartnerUser(user) {
  if (!user) return null
  return {
    id: user.id,
    support_code: user.support_code || null,
    gender: user.gender,
    birth_year: user.birth_year,
    education: user.education,
    city: user.city,
    occupation_description: user.occupation_description || '',
    member_status: user.member_status,
    is_vip: Number(user.is_vip || 0),
    vip_expire_time: user.vip_expire_time || null,
    vip_source: user.vip_source || '',
    phone_masked: maskPhone(user.phone || '')
  }
}

function sanitizePartnerApplication(application) {
  if (!application) return null
  return {
    id: application.id,
    user_id: application.user_id,
    status: application.status,
    revision: application.revision,
    review_note: application.review_note || '',
    submitted_at: application.submitted_at || application.create_time || application.created_at,
    reviewed_at: application.reviewed_at || null,
    profile_summary: {
      city: application.city || null,
      education: application.education || null,
      occupation: application.occupation || application.occupation_description || null,
      birth_year: application.birth_year || null
    }
  }
}

module.exports = {
  maskPhone,
  sanitizePartnerUser,
  sanitizePartnerApplication
}

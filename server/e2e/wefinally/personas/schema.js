'use strict'

function validatePersona(record) {
  const required = ['label', 'openid', 'gender', 'birth_year', 'city', 'education']
  for (const key of required) {
    if (record.user && record.user[key] == null && record.user[key] !== 0) {
      throw new Error(`persona ${record.label} missing user.${key}`)
    }
  }
  if (!record.setting || !record.setting.user_id) {
    throw new Error(`persona ${record.label} missing setting.user_id`)
  }
  return true
}

module.exports = { validatePersona }

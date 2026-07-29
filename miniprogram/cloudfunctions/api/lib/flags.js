const { first } = require('./db')

function isTruthy(value) {
  if (value === true || value === 1) return true
  const text = String(value || '').trim().toLowerCase()
  return text === 'true' || text === '1' || text === 'yes' || text === 'on'
}

function envFlag(key) {
  const upper = String(key || '').toUpperCase()
  if (process.env[key] !== undefined) return process.env[key]
  if (process.env[upper] !== undefined) return process.env[upper]
  return undefined
}

async function flagEnabled(key) {
  const fromEnv = envFlag(key)
  if (fromEnv !== undefined) return isTruthy(fromEnv)
  try {
    let row = await first('system_config', { key })
    if (!row) row = await first('system_config', { config_key: key })
    if (!row) row = await first('system_config', { name: key })
    if (!row) return false
    return isTruthy(row.value) || isTruthy(row.config_value) || isTruthy(row.enabled)
  } catch (err) {
    return false
  }
}

async function demoFlags() {
  return {
    matchStartEnabled: await flagEnabled('cloud_demo_match_enabled'),
    vipGrantEnabled: await flagEnabled('cloud_demo_vip_grant_enabled')
  }
}

module.exports = {
  flagEnabled,
  demoFlags
}

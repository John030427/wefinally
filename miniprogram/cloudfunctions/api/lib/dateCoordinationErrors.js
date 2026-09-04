'use strict'

const { businessError } = require('./businessError')

const RECOVERY = Object.freeze({
  REFRESH: 'refresh',
  COMPLETE_FORM: 'complete_form',
  WAIT_PARTNER: 'wait_partner',
  OPEN_COORDINATOR: 'open_coordinator',
  CONTACT_SUPPORT: 'contact_support'
})

function dateError(code, message, recovery) {
  const error = businessError(code, message)
  error.recovery = String(recovery || RECOVERY.REFRESH)
  return error
}

module.exports = {
  RECOVERY,
  dateError
}

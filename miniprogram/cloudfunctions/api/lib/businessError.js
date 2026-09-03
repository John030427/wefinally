const { isSafePublicErrorCode } = require('./publicErrorCodes')

function businessError(code, message) {
  const publicCode = String(code || '')
  const publicMessage = String(message || '').slice(0, 40)
  const error = new Error(publicMessage)
  error.code = publicCode
  error.publicCode = isSafePublicErrorCode(publicCode) ? publicCode : ''
  error.publicMessage = publicMessage
  return error
}

function attachPublicError(error, code) {
  if (!error || typeof error !== 'object') return error
  const publicCode = String(code || error.code || '')
  if (isSafePublicErrorCode(publicCode)) {
    error.code = publicCode
    error.publicCode = publicCode
    error.publicMessage = String(error.publicMessage || error.message || '').slice(0, 40)
  }
  return error
}

module.exports = {
  businessError,
  attachPublicError
}

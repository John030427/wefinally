function httpMethod(event = {}) {
  const context = event.requestContext || {}
  const http = context.http || {}
  return String(event.httpMethod || context.httpMethod || http.method || event.method || '').toUpperCase()
}

function httpPath(event = {}) {
  const context = event.requestContext || {}
  const http = context.http || {}
  const candidates = [event.rawPath, event.path, http.path, context.path, context.requestPath, event.requestContextPath]
    .map((value) => String(value || '').split('?')[0].replace(/\/+$/, ''))
    .filter(Boolean)
  return candidates.find((value) => /\/(?:api|wxpay)(?:\/|$)/.test(value)) || candidates[0] || '/'
}

function queryParameters(event = {}) {
  if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
    return event.queryStringParameters
  }
  const raw = String(event.rawQueryString || '')
  if (!raw) return {}
  const result = {}
  raw.split('&').forEach((part) => {
    const pair = part.split('=')
    const key = decodeURIComponent(pair.shift() || '')
    if (key) result[key] = decodeURIComponent(pair.join('=') || '')
  })
  return result
}

function isHttpEvent(event = {}) {
  return Boolean(httpMethod(event) || event.requestContext || event.rawPath || event.path)
}

module.exports = { httpMethod, httpPath, queryParameters, isHttpEvent }

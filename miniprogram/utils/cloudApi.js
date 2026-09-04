const CLOUD_API_NAME = 'api'

function normalizeCloudError(err) {
  const message = (err && (err.message || err.errMsg)) || '服务暂时不可用，请稍后重试'
  const normalized = new Error(message)
  if (err && err.code !== undefined) normalized.code = err.code
  if (err && err.errorCode) normalized.errorCode = err.errorCode
  else if (err && typeof err.code === 'string') normalized.errorCode = err.code
  if (err && err.httpCode !== undefined) normalized.httpCode = Number(err.httpCode)
  if (err && err.type) normalized.type = err.type
  return normalized
}

function callApi(action, payload = {}, options = {}) {
  return wx.cloud.callFunction({
    name: CLOUD_API_NAME,
    data: {
      action,
      payload
    }
  }).then((res) => {
    const result = res && res.result
    if (!result || result.success === false) {
      const err = new Error((result && result.error) || '服务暂时不可用，请稍后重试')
      const errorCode = result && (result.errorCode || (typeof result.code === 'string' ? result.code : ''))
      err.code = errorCode || (result && result.code)
      err.errorCode = errorCode || undefined
      err.httpCode = Number(result && result.httpCode || (typeof (result && result.code) === 'number' ? result.code : 500))
      err.type = 'cloud-api'
      throw err
    }
    return result.data
  }).catch((err) => {
    if (options.rawError) throw err
    throw normalizeCloudError(err)
  })
}

function requestByPath(method, path, data = {}) {
  return callApi('request', {
    method,
    path,
    data
  })
}

module.exports = {
  callApi,
  requestByPath
}

const CLOUD_API_NAME = 'api'

function normalizeCloudError(err) {
  const message = (err && (err.message || err.errMsg)) || '服务暂时不可用，请稍后重试'
  const normalized = new Error(message)
  if (err && err.code !== undefined) normalized.code = err.code
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
      const err = new Error((result && (result.message || result.error)) || '服务暂时不可用，请稍后重试')
      err.code = result && (result.code || result.error)
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

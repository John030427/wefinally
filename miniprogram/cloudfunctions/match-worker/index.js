const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event = {}) => {
  const result = await cloud.callFunction({
    name: 'api',
    data: {
      action: 'runFormalMatchBatch',
      payload: {
        request_id: String(event.requestId || event.RequestId || `timer:${Date.now()}`).slice(0, 120),
        trigger_source: 'timer'
      }
    }
  })
  return result.result
}

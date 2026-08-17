const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event = {}) => {
  const workerSecret = String(process.env.MATCH_WORKER_SECRET || '')
  if (workerSecret.length < 24) throw new Error('MATCH_WORKER_SECRET 未配置')
  const result = await cloud.callFunction({
    name: 'api',
    data: {
      action: 'runFormalMatchBatch',
      payload: {
        request_id: String(event.requestId || event.RequestId || `timer:${Date.now()}`).slice(0, 120),
        trigger_source: 'timer',
        worker_secret: workerSecret
      }
    }
  })
  return result.result
}

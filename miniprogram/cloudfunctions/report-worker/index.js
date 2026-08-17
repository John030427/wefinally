const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const workerSecret = String(process.env.MATCH_WORKER_SECRET || '')
  if (workerSecret.length < 24) throw new Error('MATCH_WORKER_SECRET is required')
  const result = await cloud.callFunction({
    name: 'api',
    data: {
      action: 'processWorkerTasks',
      payload: { worker_secret: workerSecret, report_limit: 2, notification_limit: 10, coordination_limit: 50 }
    }
  })
  return result.result
}

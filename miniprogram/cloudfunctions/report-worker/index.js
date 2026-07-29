const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const result = await cloud.callFunction({
    name: 'api',
    data: { action: 'processWorkerTasks', payload: { report_limit: 2, notification_limit: 10, coordination_limit: 50 } }
  })
  return result.result
}

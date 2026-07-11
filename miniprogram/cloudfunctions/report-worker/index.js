const cloud = require('wx-server-sdk')
const STATUS = { QUEUED: 'queued' }

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const result = await cloud.callFunction({
    name: 'api',
    data: { action: 'processReportTasks', payload: { limit: 2, status: STATUS.QUEUED } }
  })
  return result.result
}

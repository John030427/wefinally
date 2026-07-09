const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const { handleRoute } = require('./handlers/route')
const { handleHttp } = require('./handlers/paymentNotify')

const ENV_ID = 'cloud1-d4gy8l52g08bba326'

exports.main = async (event = {}) => {
  if (event.httpMethod || event.requestContext) {
    return handleHttp(event)
  }
  const action = event.action
  const payload = event.payload || {}
  try {
    switch (action) {
      case 'ping':
        return {
          success: true,
          data: {
            message: 'pong',
            env: ENV_ID
          }
        }
      case 'request':
        return {
          success: true,
          data: await handleRoute(payload, cloud.getWXContext())
        }
      default:
        return {
          success: false,
          error: `Unknown action: ${action}`
        }
    }
  } catch (err) {
    return {
      success: false,
      code: err && err.code,
      error: (err && err.message) || 'server error'
    }
  }
}

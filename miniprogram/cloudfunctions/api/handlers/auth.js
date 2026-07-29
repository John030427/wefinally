const { first, authError } = require('../lib/db')
const { isVipActive } = require('../lib/format')

function tokenFor(openid) {
  return `cloud_${openid}`
}

async function wxLogin(data, wxContext) {
  const openid = wxContext.OPENID || data.devOpenid || data.openid
  if (!openid) throw authError('无法获取微信身份')
  const user = await first('user', { openid })
  if (!user) {
    return {
      openid,
      needRegister: true
    }
  }
  user.isVip = isVipActive(user)
  return {
    openid,
    token: tokenFor(openid),
    user,
    userInfo: user,
    needRegister: false
  }
}

module.exports = {
  wxLogin,
  tokenFor
}

'use strict'

function createTestContext(userOrOpenid, options = {}) {
  const user = typeof userOrOpenid === 'object' ? userOrOpenid : null
  const openid = user ? user.openid : String(userOrOpenid)
  const ctx = {
    OPENID: openid,
    LOCAL_E2E: true,
    NODE_ENV: 'test'
  }
  if (user && user.id) {
    ctx.CONTROLLED_USER_ID = Number(user.id)
    ctx.user_id = Number(user.id)
  }
  if (options.userIndex != null) ctx.userIndex = options.userIndex
  return ctx
}

function currentUserFactory(db) {
  return async function currentUser(context) {
    if (context && context.CONTROLLED_USER_ID) {
      const user = await db.byId('user', context.CONTROLLED_USER_ID)
      if (user) return user
    }
    if (context && context.user_id) {
      const user = await db.byId('user', context.user_id)
      if (user) return user
    }
    if (context && context.OPENID) {
      const user = await db.first('user', { openid: context.OPENID })
      if (user) return user
    }
    throw new Error('E2E auth expired')
  }
}

module.exports = {
  createTestContext,
  currentUserFactory
}

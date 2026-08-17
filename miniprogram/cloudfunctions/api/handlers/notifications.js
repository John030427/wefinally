const { listInbox, unreadCount, markSeen, defaultDeps } = require('../lib/coordinationInbox')

async function getList(data, wxContext) {
  const { currentUser } = require('./user')
  const user = await currentUser(wxContext)
  const deps = defaultDeps()
  const [list, unread] = await Promise.all([
    listInbox(deps, user.id, Number(data.limit || 50)),
    unreadCount(deps, user.id)
  ])
  return { list, total: list.length, unread_count: unread }
}

async function read(data, wxContext) {
  const { currentUser } = require('./user')
  const user = await currentUser(wxContext)
  const deps = defaultDeps()
  const result = await markSeen(deps, user.id, {
    coordination_id: Number(data.coordination_id || data.coordinationId || 0),
    coordination_version: Number(data.coordination_version || data.coordinationVersion || 0)
  })
  return Object.assign({ ok: true }, result, { unread_count: await unreadCount(deps, user.id) })
}

async function unread(data, wxContext) {
  const { currentUser } = require('./user')
  const user = await currentUser(wxContext)
  return { unread_count: await unreadCount(defaultDeps(), user.id) }
}

module.exports = {
  getList,
  read,
  unread
}

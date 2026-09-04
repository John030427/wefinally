'use strict'

function stableJson(value) {
  try {
    return JSON.stringify(value || null)
  } catch (err) {
    return ''
  }
}

function historySignature(messages, sessionGeneration, coordinationVersion) {
  const rows = Array.isArray(messages) ? messages : []
  const body = rows.map((item) => [
    item && item.id,
    item && item.status,
    item && item.content,
    item && item.patch_status,
    stableJson(item && item.coordination_update_card),
    item && item.coordination_version
  ].join(':')).join('|')
  return [
    String(sessionGeneration || 0),
    String(coordinationVersion || 0),
    body
  ].join('#')
}

function reconcileHistory(current, incoming) {
  if (!Array.isArray(incoming)) return Array.isArray(current) ? current.slice() : []
  return incoming.slice()
}

module.exports = {
  historySignature,
  reconcileHistory
}

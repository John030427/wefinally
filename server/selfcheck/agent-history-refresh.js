'use strict'

const assert = require('assert')
const {
  historySignature,
  reconcileHistory
} = require('../../miniprogram/utils/agentHistoryState')

const oldMessages = [
  { id: 1, status: 'completed', content: '方案已更新', coordination_update_card: { title: 'V1' } }
]
assert.deepStrictEqual(reconcileHistory(oldMessages, []), [])

const before = [{ id: 2, status: 'completed', content: '方案已更新', coordination_update_card: { title: '旧方案' }, coordination_version: 1 }]
const afterCardChanged = [{ id: 2, status: 'completed', content: '方案已更新', coordination_update_card: { title: '新方案' }, coordination_version: 2 }]
assert.notStrictEqual(historySignature(before, 1, 1), historySignature(afterCardChanged, 1, 2))

const chatSource = require('fs').readFileSync(
  require('path').join(__dirname, '../../miniprogram/pages/chat/chat.js'),
  'utf8'
)
assert.ok(chatSource.includes('reconcileHistory'))
assert.ok(chatSource.includes('historySignature'))
assert.ok(!chatSource.includes('if (!this._pageActive || !messages.length) return'))

console.log('PASS agent history refresh reconciles empty and card updates')

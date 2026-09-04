'use strict'

const assert = require('assert')
const copy = require('../../miniprogram/pages/chat/patchStatusCopy')

assert.match(copy.buildPatchSuccessCopy({ applied: true, partner_notified: true }), /已更新/)
assert.match(copy.buildPatchSuccessCopy({ applied: true, projection_pending: true }), /补偿|待处理|稍后/)
assert.match(copy.buildPatchSuccessCopy({ applied: true, skipped: true }), /未发送|查看最新协调状态/)
assert.doesNotMatch(copy.buildPatchSuccessCopy({ applied: false }), /已通知对方/)
console.log('PASS patch-confirm UI copy is grounded in backend projection status')

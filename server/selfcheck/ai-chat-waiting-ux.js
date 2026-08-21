'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const waiting = require(path.join(root, 'miniprogram/utils/aiChatWaiting.js'))

const {
  AGENT_TYPES,
  MIN_LOADER_MS,
  createPendingAssistantMessage,
  completeAssistantMessage,
  errorAssistantMessage,
  updateMessageById,
  nextRotatedWaitingText,
  elapsedAtLeast,
  waitingCopyFor
} = waiting

assert.strictEqual(MIN_LOADER_MS >= 350 && MIN_LOADER_MS <= 500, true)

const loveCopy = waitingCopyFor(AGENT_TYPES.LOVE_ADVISOR)
assert.strictEqual(loveCopy.primary, '正在思考…')
assert.ok(loveCopy.rotating.length >= 2)

const pending = createPendingAssistantMessage({
  pendingMessageId: 'b_pending_1',
  requestId: 'req_1',
  agentType: AGENT_TYPES.DATE_COORDINATOR,
  originalUserText: '改周日下午',
  timeText: '12:00'
})
assert.strictEqual(pending.status, 'generating')
assert.strictEqual(pending.isBot, true)
assert.ok(pending.waitingText)
assert.strictEqual(pending.content, '')
assert.strictEqual(pending.originalUserText, '改周日下午')

const completed = completeAssistantMessage(pending, {
  content: '我理解为你希望改到周日下午',
  patchPreview: { id: 'p1', status: 'pending_confirmation', changes: [] },
  timeText: '12:01'
})
assert.strictEqual(completed.id, 'b_pending_1')
assert.strictEqual(completed.status, 'completed')
assert.strictEqual(completed.requestId, 'req_1')
assert.ok(completed.patchPreview)
assert.strictEqual(completed.reveal, true)

const failed = errorAssistantMessage(pending, '回复生成失败')
assert.strictEqual(failed.status, 'error')
assert.strictEqual(failed.errorText, '回复生成失败')
assert.strictEqual(failed.id, 'b_pending_1')

const list = [
  { id: 'u_1', content: 'hi' },
  pending,
  { id: 'u_2', content: 'other' }
]
const updated = updateMessageById(list, 'b_pending_1', () => completed)
assert.strictEqual(updated.found, true)
assert.strictEqual(updated.messages[1].status, 'completed')
assert.strictEqual(updated.messages[0].id, 'u_1')
assert.strictEqual(updated.messages[2].id, 'u_2')

const missing = updateMessageById(list, 'nope', { status: 'completed' })
assert.strictEqual(missing.found, false)

const rotated = nextRotatedWaitingText(pending)
assert.ok(rotated.waitingText)
assert.notStrictEqual(rotated.waitingText, pending.waitingText)

assert.strictEqual(elapsedAtLeast(Date.now() - 50, 400, Date.now()) > 300, true)
assert.strictEqual(elapsedAtLeast(Date.now() - 500, 400, Date.now()), 0)

const emptyComplete = completeAssistantMessage(pending, { content: '', patchPreview: null })
assert.strictEqual(emptyComplete.status, 'error')

const chatJs = fs.readFileSync(path.join(root, 'miniprogram/pages/chat/chat.js'), 'utf8')
const chatWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/chat/chat.wxml'), 'utf8')
const chatWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/chat/chat.wxss'), 'utf8')

assert.ok(chatJs.includes('aiChatWaiting'))
assert.ok(chatJs.includes('runAssistantTurn'))
assert.ok(chatJs.includes('retryAiMessage'))
assert.ok(chatJs.includes('fetchCompleteAssistantReply'))
assert.ok(chatJs.includes('replaceMessageById'))
assert.ok(chatJs.includes('clearWaitingTimers'))
assert.ok(chatJs.includes('_pageActive'))
assert.ok(chatJs.includes('MIN_LOADER_MS'))
assert.ok(chatJs.includes('sendLegacyMessage'))
assert.ok(chatJs.includes("status: 'completed'"))
assert.ok(!/loading=\{\{sending\}\}/.test(chatWxml), 'send button must not use competing spinner')
assert.ok(chatWxml.includes('msg-bubble-generating'))
assert.ok(chatWxml.includes('AI生成中'))
assert.ok(chatWxml.includes('retryAiMessage'))
assert.ok(chatWxml.includes("item.status === 'completed' && item.patchPreview"))
assert.ok(chatWxss.includes('gen-spin'))
assert.ok(chatWxss.includes('msg-bubble-reveal'))

console.log('PASS ai-chat-waiting-ux')

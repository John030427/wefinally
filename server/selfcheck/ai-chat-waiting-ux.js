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
  waitingCopyFor,
  evaluateAssistantReply,
  resolveCompleteAssistantReply
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

const patchOnlyComplete = completeAssistantMessage(pending, {
  content: '',
  patchPreview: { id: 'p2', changes: [{ field: 'availability' }] }
})
assert.strictEqual(patchOnlyComplete.status, 'completed')
assert.strictEqual(patchOnlyComplete.content, '')

// --- Completion gate (not only helper) ---
function testNormalizePatchPreview(raw) {
  const patch = raw && (raw.patch_preview || raw.patchPreview || raw)
  const preview = patch && patch.preview
  if (!patch || !preview || !Array.isArray(preview.changed_fields) || !preview.changed_fields.length) {
    return null
  }
  return {
    id: String(patch.id || patch.patch_id || 'patch'),
    status: patch.status || 'pending_confirmation',
    changes: preview.changed_fields.map((field) => ({ field }))
  }
}

// EMPTY_REPLY_NO_PATCH_REJECTED
{
  const ev = evaluateAssistantReply({ reply: '' }, testNormalizePatchPreview)
  assert.strictEqual(ev.ok, false)
  assert.strictEqual(ev.reason, 'EMPTY_REPLY')
  assert.throws(() => resolveCompleteAssistantReply({
    agentType: AGENT_TYPES.LOVE_ADVISOR,
    primaryReply: { reply: '   ' },
    primaryError: null,
    normalizePatchPreview: testNormalizePatchPreview
  }), /回复生成失败/)
}

// MALFORMED_REPLY_NO_PATCH_REJECTED
{
  const ev = evaluateAssistantReply({
    patch_preview: { id: 'bad', preview: { changed_fields: 'not-array' } }
  }, testNormalizePatchPreview)
  assert.strictEqual(ev.ok, false)
  assert.strictEqual(ev.reason, 'MALFORMED_PATCH')
  assert.throws(() => resolveCompleteAssistantReply({
    agentType: AGENT_TYPES.DATE_COORDINATOR,
    primaryReply: { patchPreview: { id: 'x' } },
    primaryError: null,
    normalizePatchPreview: testNormalizePatchPreview
  }), /调整建议尚未就绪/)
}

// VALID_TEXT_ACCEPTED
{
  const ev = evaluateAssistantReply({ reply: '这是完整回复' }, testNormalizePatchPreview)
  assert.strictEqual(ev.ok, true)
  assert.strictEqual(ev.reason, 'VALID_TEXT')
  assert.strictEqual(ev.content, '这是完整回复')
  const resolved = resolveCompleteAssistantReply({
    agentType: AGENT_TYPES.LOVE_ADVISOR,
    primaryReply: { content: '恋爱建议正文' },
    primaryError: null,
    normalizePatchPreview: testNormalizePatchPreview
  })
  assert.strictEqual(resolved.ok, true)
  assert.strictEqual(resolved.content, '恋爱建议正文')
}

// VALID_PATCH_ONLY_ACCEPTED
{
  const payload = {
    patch_preview: {
      id: 'p9',
      status: 'pending_confirmation',
      preview: { changed_fields: ['availability'], before: {}, after: {} }
    }
  }
  const ev = evaluateAssistantReply(payload, testNormalizePatchPreview)
  assert.strictEqual(ev.ok, true)
  assert.strictEqual(ev.reason, 'VALID_PATCH_ONLY')
  assert.ok(ev.patchPreview)
  assert.strictEqual(ev.content, '')
}

// PLATFORM_EMPTY_PRIMARY_VALID_LEGACY_ACCEPTED
{
  const resolved = resolveCompleteAssistantReply({
    agentType: AGENT_TYPES.PLATFORM_SERVICE,
    primaryReply: { reply: '' },
    primaryError: null,
    legacyReply: { answer: '会员规则说明' },
    legacyError: null,
    normalizePatchPreview: testNormalizePatchPreview
  })
  assert.strictEqual(resolved.ok, true)
  assert.strictEqual(resolved.content, '会员规则说明')
}

// PLATFORM_EMPTY_PRIMARY_EMPTY_LEGACY_REJECTED
{
  assert.throws(() => resolveCompleteAssistantReply({
    agentType: AGENT_TYPES.PLATFORM_SERVICE,
    primaryReply: {},
    primaryError: null,
    legacyReply: { message: '' },
    legacyError: null,
    normalizePatchPreview: testNormalizePatchPreview
  }), /回复生成失败/)
}

const chatJs = fs.readFileSync(path.join(root, 'miniprogram/pages/chat/chat.js'), 'utf8')
const chatWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/chat/chat.wxml'), 'utf8')
const chatWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/chat/chat.wxss'), 'utf8')
const waitingJs = fs.readFileSync(path.join(root, 'miniprogram/utils/aiChatWaiting.js'), 'utf8')

assert.ok(chatJs.includes('aiChatWaiting'))
assert.ok(chatJs.includes('runAssistantTurn'))
assert.ok(chatJs.includes('retryAiMessage'))
assert.ok(chatJs.includes('fetchCompleteAssistantReply'))
assert.ok(chatJs.includes('evaluateAssistantReply'))
assert.ok(chatJs.includes('resolveCompleteAssistantReply'))
assert.ok(chatJs.includes('replaceMessageById'))
assert.ok(chatJs.includes('clearWaitingTimers'))
assert.ok(chatJs.includes('_pageActive'))
assert.ok(chatJs.includes('MIN_LOADER_MS'))
assert.ok(chatJs.includes('sendLegacyMessage'))
assert.ok(chatJs.includes("status: 'completed'"))
assert.ok(!chatJs.includes('感谢你的咨询，我会在信息范围内尽力协助。'), 'must not use generic fake success fallback')
assert.ok(waitingJs.includes('evaluateAssistantReply'))
assert.ok(waitingJs.includes('resolveCompleteAssistantReply'))
assert.ok(!/loading=\{\{sending\}\}/.test(chatWxml), 'send button must not use competing spinner')
assert.ok(chatWxml.includes('msg-bubble-generating'))
assert.ok(chatWxml.includes('AI生成中'))
assert.ok(chatWxml.includes('retryAiMessage'))
assert.ok(chatWxml.includes("item.status === 'completed' && item.patchPreview"))
assert.ok(chatWxss.includes('gen-spin'))
assert.ok(chatWxss.includes('msg-bubble-reveal'))

console.log('PASS ai-chat-waiting-ux')
console.log('PASS completion-gate EMPTY_REPLY_NO_PATCH_REJECTED')
console.log('PASS completion-gate MALFORMED_REPLY_NO_PATCH_REJECTED')
console.log('PASS completion-gate VALID_TEXT_ACCEPTED')
console.log('PASS completion-gate VALID_PATCH_ONLY_ACCEPTED')
console.log('PASS completion-gate PLATFORM_EMPTY_PRIMARY_VALID_LEGACY_ACCEPTED')
console.log('PASS completion-gate PLATFORM_EMPTY_PRIMARY_EMPTY_LEGACY_REJECTED')

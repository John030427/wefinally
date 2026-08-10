import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GraphResultSchema,
  GraphRunInputSchema,
  GraphStateSchema
} from '../src/contracts.js'

const validRunInput = {
  operation: 'run',
  threadId: 'wf_thread_1234567890',
  actorRef: 'usr_4f52c3d8a9b071ce',
  mode: 'customer_service',
  userText: '会员页面为什么没有更新？',
  safeSummary: ''
}

test('accepts a bounded opaque graph request', () => {
  const result = GraphRunInputSchema.safeParse(validRunInput)
  assert.equal(result.success, true)
})

test('rejects an OpenID-shaped actor reference', () => {
  const result = GraphRunInputSchema.safeParse({
    ...validRunInput,
    actorRef: 'oAbCdEfGhIjKlMnOpQrStUvWxYz123'
  })
  assert.equal(result.success, false)
})

test('rejects unknown input keys and oversized text', () => {
  const unknownKey = GraphRunInputSchema.safeParse({ ...validRunInput, openid: 'secret' })
  const oversized = GraphRunInputSchema.safeParse({ ...validRunInput, userText: '问'.repeat(2001) })
  assert.equal(unknownKey.success, false)
  assert.equal(oversized.success, false)
})

test('keeps bilateral preference state separated', () => {
  const result = GraphStateSchema.parse({
    ...validRunInput,
    phase: 'collect_b',
    coordinationVersion: 2,
    partyAState: { dateWindows: ['2026-08-16T14:00+08:00'] },
    partyBState: { dateWindows: ['2026-08-17T19:00+08:00'] }
  })
  assert.deepEqual(result.partyAState?.dateWindows, ['2026-08-16T14:00+08:00'])
  assert.deepEqual(result.partyBState?.dateWindows, ['2026-08-17T19:00+08:00'])
})

test('rejects unsupported graph result statuses', () => {
  const result = GraphResultSchema.safeParse({
    status: 'executed_without_confirmation',
    threadId: validRunInput.threadId,
    phase: 'submit'
  })
  assert.equal(result.success, false)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeGraphText } from '../src/sanitize.js'

test('removes phone OpenID API key and exact address before model use', () => {
  const input = '电话13800138000 OPENID=oAbCdEfGhIjKlMnOpQrStUvWxYz123 地址福田区XX路88号 DEEPSEEK_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456'
  const output = sanitizeGraphText(input, 500)
  assert.doesNotMatch(output, /13800138000|oAbCd|XX路88号|sk-abcdefghijklmnopqrstuvwxyz/)
  assert.match(output, /\[手机号已隐藏\]|\[用户标识已隐藏\]|\[地址已模糊\]|\[密钥已隐藏\]/)
})

test('normalizes control characters and enforces the requested limit', () => {
  const output = sanitizeGraphText(`你好\u0000\u0007${'问'.repeat(50)}`, 20)
  assert.equal(output.length, 20)
  assert.doesNotMatch(output, /[\u0000-\u0008]/)
})

test('returns an empty string for non-text values', () => {
  assert.equal(sanitizeGraphText({ secret: 'value' }, 100), '')
})

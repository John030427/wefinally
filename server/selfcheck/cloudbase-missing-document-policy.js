const assert = require('assert')
const {
  isMissingDocumentError,
  documentOrNull
} = require('../../miniprogram/cloudfunctions/api/lib/documentReadPolicy')

async function main() {
  const missing = new Error('document.get:fail document with _id partner_activation_test does not exist')
  assert.strictEqual(isMissingDocumentError(missing), true)
  assert.strictEqual(await documentOrNull(async () => { throw missing }), null)
  assert.deepStrictEqual(await documentOrNull(async () => ({ data: { id: 7 } })), { id: 7 })
  assert.strictEqual(await documentOrNull(async () => ({ data: null })), null)

  const denied = new Error('document.get:fail permission denied')
  assert.strictEqual(isMissingDocumentError(denied), false)
  await assert.rejects(() => documentOrNull(async () => { throw denied }), /permission denied/)

  console.log('PASS CloudBase missing documents are null without hiding real database errors')
}

main().catch((err) => {
  console.error(err.stack || err)
  process.exitCode = 1
})

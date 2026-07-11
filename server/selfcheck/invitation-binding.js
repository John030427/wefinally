const assert = require('assert')

const { resolveInvitation } = require('../../miniprogram/cloudfunctions/api/lib/memberPolicy')

async function main() {
  const activePartner = { id: 9, status: 1, promote_code: 'DESIGN9' }
  const first = async (name, query) => (
    name === 'partner' && query.promote_code === 'DESIGN9' ? activePartner : null
  )
  assert.deepStrictEqual(await resolveInvitation(' design9 ', first), activePartner)
  await assert.rejects(() => resolveInvitation('', first), /邀请码/)
  await assert.rejects(() => resolveInvitation('BAD', first), /无效或已停用/)
  console.log('PASS invitation binding')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

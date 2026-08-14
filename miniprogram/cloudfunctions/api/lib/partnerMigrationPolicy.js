const { partnerCodes } = require('./partnerOnboardingPolicy')

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function planPartnerMigration(rows = []) {
  return rows.reduce((plan, row) => {
    const id = number(row.id)
    if (!id || !row._id) return plan
    const patch = {}
    if (!String(row.partner_code || '').trim()) patch.partner_code = partnerCodes(id).partner_code
    if (number(row.binding_version) <= 0) patch.binding_version = 1
    if (!Object.keys(patch).length) return plan
    plan.push({
      partner_id: id,
      document_id: String(row._id),
      patch,
      preserved: {
        promote_code: String(row.promote_code || ''),
        password: Boolean(row.password),
        balance: number(row.balance),
        total_commission: number(row.total_commission)
      }
    })
    return plan
  }, [])
}

function partnerSequence(row = {}) {
  const codeMatch = /^WF-P-(\d+)$/.exec(String(row.partner_code || '').trim())
  return Math.max(
    Math.floor(number(row.id)),
    codeMatch ? Math.floor(number(codeMatch[1])) : 0
  )
}

function planPartnerSupportCounter(rows = [], currentCounter = null) {
  const requiredSeq = rows.reduce((max, row) => Math.max(max, partnerSequence(row)), 0)
  const currentSeq = Math.floor(number(currentCounter && currentCounter.seq))
  if (requiredSeq <= currentSeq) return null
  return {
    counter_id: 'partner_support_code',
    seq: requiredSeq
  }
}

async function applyPartnerMigration(plan, options = {}) {
  if (options.confirm !== 'CONFIRM_PARTNER_MIGRATION') throw new Error('迁移确认口令无效')
  if (typeof options.update !== 'function') throw new Error('迁移写入依赖缺失')
  if (options.counterPlan && typeof options.upsertCounter !== 'function') throw new Error('计数器迁移写入依赖缺失')
  let updated = 0
  for (const item of plan || []) {
    await options.update(item.document_id, Object.assign({}, item.patch))
    updated += 1
  }
  if (options.counterPlan) {
    await options.upsertCounter(options.counterPlan.counter_id, options.counterPlan.seq)
  }
  return { updated, counter_updated: Boolean(options.counterPlan) }
}

module.exports = { planPartnerMigration, planPartnerSupportCounter, applyPartnerMigration }

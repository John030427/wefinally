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

async function applyPartnerMigration(plan, options = {}) {
  if (options.confirm !== 'CONFIRM_PARTNER_MIGRATION') throw new Error('迁移确认口令无效')
  if (typeof options.update !== 'function') throw new Error('迁移写入依赖缺失')
  let updated = 0
  for (const item of plan || []) {
    await options.update(item.document_id, Object.assign({}, item.patch))
    updated += 1
  }
  return { updated }
}

module.exports = { planPartnerMigration, applyPartnerMigration }

const assert = require('assert')
const { executeFormalMatching } = require('../../miniprogram/cloudfunctions/api/lib/formalMatching')

const psych = JSON.stringify({
  marriage_pace: '稳定推进', conflict_style: '及时沟通', security_space: '亲密也独立',
  family_boundary: '边界清晰', money_view: '共同规划', career_family: '动态平衡'
})

function user(id, gender, birthYear, height) {
  return {
    _id: `user_${id}`,
    id,
    status: 1,
    member_status: 'approved',
    is_vip: 1,
    vip_expire_time: '2099-01-01T00:00:00.000Z',
    profile_origin: 'real_user',
    account_mode: 'production',
    gender,
    birth_year: birthYear,
    height_range: height,
    education: '本科',
    circle_id: 1,
    city: '深圳',
    baby_plan: '3-5年内',
    appearance_description: '干净清爽',
    appearance_want: '干净清爽'
  }
}

function setting(userId) {
  return {
    user_id: userId,
    age_min: 25,
    age_max: 40,
    min_education: '本科',
    like_circle_ids: '1',
    like_baby_plan: '3-5年内',
    self_view_text: '重视真诚责任稳定沟通共同规划生活家庭边界清晰',
    target_view_text: '重视真诚责任稳定沟通共同规划生活家庭边界清晰',
    psych_profile_json: psych
  }
}

async function main() {
  const users = [user(1, 1, 1992, '175-180cm'), user(2, 2, 1995, '160-165cm')]
  const settings = users.map((row) => setting(row.id))
  let semanticCalls = 0
  let deliveryInput = null
  let reportLog = null
  const result = await executeFormalMatching({
    clock: { businessDate: '2026-08-14', matchType: '周五' },
    deps: {
      list: async (name) => {
        if (name === 'user') return users
        if (name === 'match_claim') return []
        if (name === 'user_match_setting') return settings
        return []
      },
      semanticRerank: async (ranked) => {
        semanticCalls += 1
        return { applied: true, ranked }
      },
      deliverPair: async (input) => {
        deliveryInput = input
        return {
          delivered: true,
          logA: { _id: 'match_log_1', id: 1, ...input.deliveryData.logA },
          logB: { _id: 'match_log_2', id: 2, ...input.deliveryData.logB }
        }
      },
      ensureReportTask: async (log) => { reportLog = log },
      addWithId: async () => { throw new Error('正式交付前禁止写入日志或审计') }
    }
  })
  assert.strictEqual(result.matched_count, 1)
  assert.strictEqual(semanticCalls, 1)
  assert(deliveryInput.deliveryData)
  assert.strictEqual(deliveryInput.logA, undefined)
  assert.strictEqual(deliveryInput.deliveryData.audit.action, 'formal_batch')
  assert.strictEqual(reportLog.id, 1)

  let unavailableDelivered = false
  const unavailable = await executeFormalMatching({
    clock: { businessDate: '2026-08-14', matchType: '周五' },
    deps: {
      list: async (name) => {
        if (name === 'user') return users
        if (name === 'match_claim') return []
        if (name === 'user_match_setting') return settings
        return []
      },
      semanticRerank: async (ranked) => ({ applied: false, reason: 'semantic_retrieval_unavailable', ranked }),
      deliverPair: async () => { unavailableDelivered = true; return { delivered: true } }
    }
  })
  assert.strictEqual(unavailable.matched_count, 0)
  assert.strictEqual(unavailableDelivered, false)
  console.log('PASS formal matching reranks then atomically prepares delivery and report task')
}

main().catch((err) => { console.error(err); process.exitCode = 1 })

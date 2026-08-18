const assert = require('assert')

const { createAbMatchFixtureService } = require('../../miniprogram/cloudfunctions/api/handlers/abMatchFixture')
const { rankCandidates } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')

function scenario() {
  const tables = {
    user: [{
      _id: 'user_8',
      id: 8,
      gender: 1,
      birth_year: 2000,
      height_range: '190cm以上',
      education: '博士',
      circle_id: 6,
      city: '深圳',
      marry_status: '未婚',
      baby_plan: '5年后',
      status: 1,
      member_status: 'approved',
      is_vip: 1,
      vip_source: 'internal_test',
      vip_expire_time: new Date('2026-07-31T08:00:00.000Z'),
      appearance_description: '日常穿搭简洁，喜欢运动',
      appearance_want: '希望对方干净简洁'
    }],
    user_match_setting: [{
      _id: 'setting_8',
      id: 18,
      user_id: 8,
      age_min: 20,
      age_max: 25,
      height_min: 160,
      height_max: 170,
      min_education: '大专',
      like_circle_ids: '',
      like_marry_status: '不限',
      like_baby_plan: '3-5年内',
      self_view_text: '我重视真诚责任，愿意稳定沟通并认真规划未来生活',
      target_view_text: '希望对方善解人意，真诚稳定，愿意共同经营长期关系',
      psych_profile_json: null
    }],
    user_match_log: [{
      _id: 'unrelated_log',
      id: 90,
      user_id: 100,
      match_user_id: 101,
      ab_test_run_id: 'other_run'
    }],
    partner_user_audit_log: []
  }
  let sequence = 100
  const matches = (row, query = {}) => Object.entries(query).every(([key, value]) => row[key] === value)
  const deps = {
    byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    first: async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (tables[name] || []).filter((row) => matches(row, query)),
    addWithId: async (name, data, prefix) => {
      const row = { _id: `${prefix || name}_${++sequence}`, id: sequence, ...data }
      tables[name] = tables[name] || []
      tables[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    removeByDoc: async (name, doc) => {
      const rows = tables[name] || []
      const index = rows.findIndex((row) => row._id === doc._id)
      if (index < 0) throw new Error('记录不存在')
      rows.splice(index, 1)
      return { removed: 1 }
    },
    now: () => new Date('2026-07-24T08:00:00.000Z'),
    randomId: () => 'run_20260724_abcd1234'
  }
  return { tables, deps }
}

async function main() {
  const actor = { role: 'admin', id: 1, admin_role: 'super_admin' }
  const input = {
    action: 'prepare',
    ownerUserId: 8,
    reason: '验证成功匹配双向链路',
    requestId: 'ab_prepare_8_1784880000000'
  }

  await assert.rejects(
    () => createAbMatchFixtureService(scenario().deps).change(input, { role: 'partner', id: 3 }),
    /仅超级管理员/
  )

  const state = scenario()
  const service = createAbMatchFixtureService(state.deps)
  const prepared = await service.change(input, actor)
  assert.strictEqual(prepared.run_id, 'run_20260724_abcd1234')
  assert.strictEqual(prepared.owner_user_id, 8)
  assert.strictEqual(prepared.candidate.is_test_fixture, 1)
  assert.strictEqual(prepared.candidate.ab_test_run_id, prepared.run_id)
  assert.strictEqual(prepared.candidate.gender, 2)
  assert.strictEqual(prepared.candidate.member_status, 'approved')
  assert.strictEqual(state.tables.user.length, 2)
  assert.strictEqual(state.tables.user_match_setting.length, 2)

  const owner = state.tables.user[0]
  const candidate = state.tables.user[1]
  const settingsByUserId = Object.fromEntries(
    state.tables.user_match_setting.map((row) => [String(row.user_id), row])
  )
  const ranked = rankCandidates(owner, [candidate], settingsByUserId)
  assert.strictEqual(ranked.length, 1)
  assert.strictEqual(ranked[0].quality.pass, true)
  assert.strictEqual(ranked[0].candidate.id, candidate.id)

  const repeated = await service.change(input, actor)
  assert.strictEqual(repeated.idempotent, 1)
  assert.strictEqual(state.tables.user.length, 2)
  assert.strictEqual(state.tables.partner_user_audit_log.length, 1)

  state.tables.user_match_log.push(
    {
      _id: 'match_a',
      id: 201,
      user_id: owner.id,
      match_user_id: candidate.id,
      ab_test_run_id: prepared.run_id
    },
    {
      _id: 'match_b',
      id: 202,
      user_id: candidate.id,
      match_user_id: owner.id,
      ab_test_run_id: prepared.run_id
    }
  )
  const cleaned = await service.change({
    action: 'cleanup',
    ownerUserId: 8,
    runId: prepared.run_id,
    reason: 'A/B 测试完成',
    requestId: 'ab_cleanup_8_1784881000000'
  }, actor)
  assert.strictEqual(cleaned.removed_candidate, 1)
  assert.strictEqual(cleaned.removed_settings, 1)
  assert.strictEqual(cleaned.removed_match_logs, 2)
  assert.strictEqual(state.tables.user.length, 1)
  assert.strictEqual(state.tables.user_match_setting.length, 1)
  assert.strictEqual(state.tables.user_match_log.length, 1)
  assert.strictEqual(state.tables.user_match_log[0]._id, 'unrelated_log')
  assert.strictEqual(state.tables.partner_user_audit_log.at(-1).action, 'cleanup_ab_match_fixture')

  await assert.rejects(
    () => service.change({
      action: 'cleanup',
      ownerUserId: 8,
      runId: 'other_run_1234567890',
      reason: '越界清理',
      requestId: 'ab_cleanup_8_1784882000000'
    }, actor),
    /测试候选不存在/
  )

  const { normalizeInput } = require('../../miniprogram/cloudfunctions/api/handlers/abMatchFixture')
  const rejectedInput = normalizeInput({
    action: 'prepare',
    ownerUserId: 8,
    reason: '拒绝场景',
    requestId: 'ab_prepare_8_1784883000000',
    fixture_journey: 'reject'
  })
  assert.strictEqual(rejectedInput.fixture_journey, 'reject')
  assert.throws(
    () => normalizeInput({
      action: 'prepare',
      ownerUserId: 8,
      reason: '未知旅程',
      requestId: 'ab_prepare_8_1784884000000',
      fixture_journey: 'mystery'
    }),
    /fixture_journey/
  )

  const dual = scenario()
  let rid = 0
  dual.deps.randomId = () => `run_dual_${++rid}_abcdefgh`
  const dualService = createAbMatchFixtureService(dual.deps)
  const acceptPrep = await dualService.change({
    action: 'prepare',
    ownerUserId: 8,
    reason: '接受场景',
    requestId: 'ab_prepare_8_1784885000000',
    fixture_journey: 'accept'
  }, actor)
  const rejectPrep = await dualService.change({
    action: 'prepare',
    ownerUserId: 8,
    reason: '拒绝场景',
    requestId: 'ab_prepare_8_1784886000000',
    fixture_journey: 'reject'
  }, actor)
  assert.notStrictEqual(acceptPrep.run_id, rejectPrep.run_id)
  assert.strictEqual(acceptPrep.candidate.fixture_journey, 'accept')
  assert.strictEqual(rejectPrep.candidate.fixture_journey, 'reject')
  assert.strictEqual(dual.tables.user.filter((row) => Number(row.is_test_fixture || 0) === 1).length, 2)

  dual.tables.date_coordination = [{
    _id: 'coord_test',
    id: 501,
    user_a_id: 8,
    user_b_id: acceptPrep.candidate.id,
    status: 'inviting_partner',
    is_test_data: 1,
    ab_test_run_id: acceptPrep.run_id
  }]
  dual.tables.agent_session = [{
    _id: 'sess_test',
    id: 701,
    coordination_id: 501,
    user_id: 8,
    status: 'active'
  }]
  const dualClean = await dualService.change({
    action: 'cleanup',
    ownerUserId: 8,
    runId: acceptPrep.run_id,
    reason: '清理接受场景',
    requestId: 'ab_cleanup_8_1784887000000'
  }, actor)
  assert.ok(dualClean.closed_coordinations >= 1)
  assert.strictEqual(dual.tables.date_coordination[0].status, 'closed')
  assert.strictEqual(dual.tables.user.find((row) => row.fixture_journey === 'reject').status, 1)

  console.log('PASS controlled A/B match fixture lifecycle')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

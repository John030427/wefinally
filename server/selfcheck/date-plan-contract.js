const assert = require('assert')
const {
  buildDatePlanV3,
  validateDatePlan,
  interpretNlPlanUtterance,
  applyStructuredPlanIntent,
  NL_CONTRACT_CASES
} = require('../../miniprogram/cloudfunctions/api/lib/datePlanContract')

function main() {
  assert.ok(Array.isArray(NL_CONTRACT_CASES) && NL_CONTRACT_CASES.length >= 8)

  for (const fixture of NL_CONTRACT_CASES) {
    const interpreted = interpretNlPlanUtterance(fixture.text, fixture.base || {})
    assert.strictEqual(interpreted.intent, fixture.expect.intent, fixture.text)
    if (fixture.expect.changed_dimensions) {
      assert.deepStrictEqual(interpreted.changed_dimensions, fixture.expect.changed_dimensions, fixture.text)
    }
    if (fixture.expect.candidate_values) {
      for (const [key, value] of Object.entries(fixture.expect.candidate_values)) {
        assert.strictEqual(interpreted.candidate_values[key], value, `${fixture.text} :: ${key}`)
      }
    }
    if (fixture.expect.needs_clarification != null) {
      assert.strictEqual(interpreted.needs_clarification, fixture.expect.needs_clarification, fixture.text)
    }
    if (fixture.expect.clarification_includes) {
      assert.ok(
        String(interpreted.clarification || '').includes(fixture.expect.clarification_includes),
        fixture.text
      )
    }

    const applied = applyStructuredPlanIntent(interpreted, fixture.base || {})
    const apiPlan = buildDatePlanV3(applied.plan)
    if (fixture.expect.plan) {
      for (const [key, value] of Object.entries(fixture.expect.plan)) {
        assert.strictEqual(apiPlan[key], value, `${fixture.text} plan.${key}`)
      }
    }
    if (fixture.expect.stage) {
      const validation = validateDatePlan(apiPlan, fixture.expect.stage)
      assert.strictEqual(validation.valid, fixture.expect.valid !== false, fixture.text)
      if (fixture.expect.missing) {
        for (const field of fixture.expect.missing) {
          assert.ok(validation.missing.includes(field), `${fixture.text} missing ${field}`)
        }
      }
      if (fixture.expect.conflict_code) {
        assert.ok(
          (validation.conflicts || []).some((item) => item.code === fixture.expect.conflict_code),
          fixture.text
        )
      }
    }
  }

  const nightPlan = buildDatePlanV3({
    date: '2026-09-06',
    period: 'evening',
    start_time: '20:00',
    area: '南山',
    activity: '电影',
    activity_venue: '万象天地百老汇影城',
    meet_point: '影城一楼',
    budget: '50-100',
    payment: 'aa',
    duration: 'about-1h'
  })
  assert.strictEqual(nightPlan.start_time, '20:00')
  assert.strictEqual(nightPlan.period, 'night')
  assert.strictEqual(validateDatePlan(nightPlan, 'final').valid, true)

  const draftArea = buildDatePlanV3({
    date: '2026-09-06',
    period: 'evening',
    area: '大运中心附近',
    activity: '吃饭',
    activity_venue: '椰子鸡'
  })
  assert.strictEqual(validateDatePlan(draftArea, 'draft').valid, true)
  assert.strictEqual(validateDatePlan(draftArea, 'final').valid, false)

  console.log('PASS date plan contract NL table + staged validation')
}

main()

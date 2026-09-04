import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  applyStructuredPlanIntent,
  buildDatePlanV3,
  interpretNlPlanUtterance,
  NL_CONTRACT_CASES,
  validateDatePlan
} from '../../cloudfunctions/agent-graph/src/datePlanContract.js'

const apiContractPath = fileURLToPath(new URL('../../cloudfunctions/api/lib/datePlanContract.js', import.meta.url))
const apiContract = createRequire(apiContractPath)(apiContractPath) as {
  buildDatePlanV3: typeof buildDatePlanV3
  interpretNlPlanUtterance: typeof interpretNlPlanUtterance
  applyStructuredPlanIntent: typeof applyStructuredPlanIntent
}

test('API and LangGraph share the same DatePlanV3 for NL contract cases', () => {
  assert.ok(NL_CONTRACT_CASES.length >= 8)
  for (const fixture of NL_CONTRACT_CASES as Array<{
    text: string
    base?: Record<string, unknown>
    expect: {
      intent: string
      plan?: Record<string, string>
    }
  }>) {
    const graphIntent = interpretNlPlanUtterance(fixture.text, fixture.base || {})
    const apiIntent = apiContract.interpretNlPlanUtterance(fixture.text, fixture.base || {})
    assert.deepEqual(graphIntent, apiIntent)

    const graphApplied = applyStructuredPlanIntent(graphIntent, fixture.base || {})
    const apiApplied = apiContract.applyStructuredPlanIntent(apiIntent, fixture.base || {})
    const graphPlan = buildDatePlanV3(graphApplied.plan)
    const apiPlan = apiContract.buildDatePlanV3(apiApplied.plan)
    assert.deepEqual(graphPlan, apiPlan)

    if (fixture.expect.plan?.start_time) {
      assert.equal(apiPlan.start_time, fixture.expect.plan.start_time)
      assert.equal(apiPlan.period, fixture.expect.plan.period || apiPlan.period)
    }
  }

  const night = buildDatePlanV3({
    date: '2026-09-06',
    period: 'evening',
    start_time: '20:00',
    area: '南山',
    activity: '电影',
    activity_venue: '万象天地百老汇影城'
  })
  assert.equal(night.start_time, '20:00')
  assert.equal(night.period, 'night')
  assert.equal(validateDatePlan(night, 'final').valid, true)
})

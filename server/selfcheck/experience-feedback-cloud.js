const assert = require('assert')
const { createExperienceFeedbackHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/experienceFeedback')

function createDeps(seed) {
  const rows = JSON.parse(JSON.stringify(seed || {}))
  const now = new Date('2026-07-27T08:00:00.000Z')
  const collection = (name) => {
    if (!rows[name]) rows[name] = []
    return rows[name]
  }
  return {
    rows,
    currentUser: async (ctx) => ({ id: Number(ctx.userId) }),
    now: () => now,
    byId: async (name, id) => collection(name).find((row) => Number(row.id) === Number(id)) || null,
    first: async (name, query) => collection(name).find((row) => Object.keys(query).every((key) => row[key] === query[key])) || null,
    setDoc: async (name, id, data) => {
      const list = collection(name)
      const existing = list.find((row) => row._id === id)
      if (existing) Object.assign(existing, data)
      else list.push(Object.assign({ _id: id }, data))
      return list.find((row) => row._id === id)
    },
    addWithId: async (name, data) => {
      const list = collection(name)
      const id = list.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1
      const row = Object.assign({ _id: `${name}_${id}`, id }, data)
      list.push(row)
      return row
    }
  }
}

async function run() {
  const deps = createDeps({
    user_match_log: [
      { id: 10, user_id: 1, match_user_id: 2 },
      { id: 11, user_id: 2, match_user_id: 1 }
    ],
    date_coordination: [
      { id: 20, user_a_id: 1, user_b_id: 2, status: 'arranged', final_proposal_id: 30 },
      { id: 21, user_a_id: 3, user_b_id: 4, status: 'waiting_confirmations' }
    ],
    date_coordination_proposal: [
      { id: 30, coordination_id: 20, status: 'active', date: '2026-07-26' }
    ]
  })
  const handlers = createExperienceFeedbackHandlers(deps)

  const matchSaved = await handlers.saveMatch({
    match_log_id: 10,
    verdict: 'accurate',
    reasons: ['values']
  }, { userId: 1 })
  assert.strictEqual(matchSaved.verdict, 'accurate')
  assert.strictEqual(deps.rows.match_experience_feedback.length, 1)

  await handlers.saveMatch({
    match_log_id: 10,
    verdict: 'partly_accurate',
    reasons: ['location'],
    request_human_review: true
  }, { userId: 1 })
  assert.strictEqual(deps.rows.match_experience_feedback.length, 1)
  assert.strictEqual(deps.rows.match_experience_feedback[0].verdict, 'partly_accurate')
  assert.strictEqual(deps.rows.agent_human_ticket.length, 1)
  assert.strictEqual(deps.rows.agent_human_ticket[0].category, 'match_feedback_review')
  assert.strictEqual(deps.rows.agent_session.length, 1)
  await handlers.saveMatch({
    match_log_id: 10,
    verdict: 'partly_accurate',
    reasons: ['location'],
    request_human_review: true
  }, { userId: 1 })
  assert.strictEqual(deps.rows.agent_human_ticket.length, 1)
  await assert.rejects(
    handlers.saveMatch({ match_log_id: 10, verdict: 'accurate' }, { userId: 2 }),
    /自己的匹配记录/
  )

  const eligibility = await handlers.dateEligibility({ match_log_id: 10 }, { userId: 1 })
  assert.strictEqual(eligibility.can_submit, true)
  assert.strictEqual(eligibility.coordination_id, 20)
  assert.strictEqual(eligibility.proposal_date, '2026-07-26')

  deps.now = () => new Date('2026-07-26T16:20:00.000Z')
  deps.rows.date_coordination_proposal[0].date = '2026-07-27'
  deps.rows.date_coordination_proposal[0].period = 'afternoon'
  deps.rows.date_coordination_proposal[0].duration = '1-2h'
  const sameDayEarly = await handlers.dateEligibility({ match_log_id: 10 }, { userId: 1 })
  assert.strictEqual(sameDayEarly.can_submit, false)
  assert.match(sameDayEarly.reason, /预计结束/)

  deps.now = () => new Date('2026-07-27T12:00:00.000Z')
  const afterAfternoonEnds = await handlers.dateEligibility({ match_log_id: 10 }, { userId: 1 })
  assert.strictEqual(afterAfternoonEnds.can_submit, true)

  deps.now = () => new Date('2026-07-27T08:00:00.000Z')
  deps.rows.date_coordination_proposal[0].date = '2026-07-26'
  const afterMeetingDay = await handlers.dateEligibility({ match_log_id: 10 }, { userId: 1 })
  assert.strictEqual(afterMeetingDay.can_submit, true)

  const dateSaved = await handlers.saveDate({
    match_log_id: 10,
    met_status: 'met',
    continue_intent: 'no',
    authenticity: 'major_gap',
    safety: 'unsafe',
    request_human_review: true
  }, { userId: 1 })
  assert.strictEqual(dateSaved.coordination_id, 20)
  assert.strictEqual(deps.rows.date_experience_feedback.length, 1)
  assert.strictEqual(deps.rows.agent_human_ticket.length, 2)
  assert.strictEqual(deps.rows.agent_human_ticket[1].priority, 'P1')
  assert.strictEqual(deps.rows.agent_human_ticket[1].category, 'date_feedback_review')

  deps.rows.date_coordination_proposal[0].date = '2026-07-28'
  const future = await handlers.dateEligibility({ match_log_id: 10 }, { userId: 1 })
  assert.strictEqual(future.can_submit, false)
  await assert.rejects(
    handlers.saveDate({
      match_log_id: 10,
      met_status: 'met',
      continue_intent: 'yes',
      authenticity: 'consistent',
      safety: 'safe'
    }, { userId: 1 }),
    /约会后可填写/
  )
  deps.rows.date_coordination_proposal[0].date = '2026-07-26'

  await assert.rejects(
    handlers.saveDate({
      match_log_id: 10,
      coordination_id: 21,
      met_status: 'met',
      continue_intent: 'yes',
      authenticity: 'consistent',
      safety: 'safe'
    }, { userId: 1 }),
    /尚未完成安排|无权/
  )

  console.log('experience-feedback-cloud selfcheck passed')
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

'use strict'

const crypto = require('crypto')

const DEFAULT_TABLES = [
  'user',
  'user_match_setting',
  'user_identity_tag',
  'user_match_log',
  'match_claim',
  'date_coordination',
  'date_coordination_application',
  'date_coordination_proposal',
  'date_coordination_confirmation',
  'date_application_patch',
  'date_coordination_event',
  'agent_session',
  'agent_message',
  'agent_run',
  'agent_tool_call',
  'agent_human_ticket',
  'agent_notification_job',
  'coordination_notification',
  'user_notification_cursor',
  'fixture_response_job',
  'match_experience_feedback',
  'date_experience_feedback',
  'knowledge_article'
]

function matches(row, query) {
  return Object.keys(query || {}).every((key) => {
    const expected = query[key]
    if (Array.isArray(expected)) return expected.includes(row[key])
    return row[key] === expected
  })
}

function createMemoryDb(options = {}) {
  const runId = options.runId || `e2e_${Date.now()}`
  const tables = {}
  for (const name of DEFAULT_TABLES) {
    tables[name] = Array.isArray(options.seed && options.seed[name]) ? options.seed[name].slice() : []
  }
  if (options.seed) {
    for (const [name, rows] of Object.entries(options.seed)) {
      if (!DEFAULT_TABLES.includes(name) && Array.isArray(rows)) tables[name] = rows.slice()
    }
  }
  const counters = {}
  let frozenNow = options.now instanceof Date ? options.now : new Date('2026-08-20T08:00:00.000Z')

  const db = {
    runId,
    tables,
    now() {
      return new Date(frozenNow)
    },
    setNow(value) {
      frozenNow = value instanceof Date ? value : new Date(value)
    },
    async first(name, query) {
      return (tables[name] || []).find((row) => matches(row, query)) || null
    },
    async list(name, query, limit) {
      const rows = (tables[name] || []).filter((row) => matches(row, query))
      const max = Number(limit) || 1000
      return rows.slice(0, max)
    },
    async byId(name, id) {
      return (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null
    },
    async addWithId(name, data, prefix) {
      counters[name] = Number(counters[name] || 1000) + 1
      const id = Number(data.id || counters[name])
      const row = Object.assign({
        id,
        _id: data._id || `${prefix || name}_${id}`,
        create_time: db.now(),
        update_time: db.now()
      }, data)
      if (!tables[name]) tables[name] = []
      tables[name].push(row)
      return row
    },
    async updateByDoc(name, doc, data) {
      const updated = Object.assign({}, doc, data, { update_time: db.now() })
      const idx = (tables[name] || []).indexOf(doc)
      if (idx >= 0) tables[name][idx] = updated
      else {
        const byId = (tables[name] || []).findIndex((item) => Number(item.id) === Number(doc.id))
        if (byId >= 0) tables[name][byId] = updated
      }
      return updated
    },
    async claimPendingPatch(patch) {
      const current = (tables.date_application_patch || []).find((row) => Number(row.id) === Number(patch.id))
      if (!current || current.status !== 'pending_confirmation') return false
      current.status = 'applying'
      return true
    },
    purgeRun(runIdToPurge) {
      const rid = runIdToPurge || runId
      for (const name of Object.keys(tables)) {
        tables[name] = (tables[name] || []).filter((row) => {
          if (row.e2e_run_id && row.e2e_run_id === rid) return false
          if (row.fixture_run_id && String(row.fixture_run_id).includes(rid)) return false
          if (row.openid && String(row.openid).includes(`_${rid}`)) return false
          return true
        })
      }
    },
    snapshot() {
      return JSON.parse(JSON.stringify({
        runId,
        counts: Object.fromEntries(Object.keys(tables).map((k) => [k, (tables[k] || []).length]))
      }))
    }
  }

  return db
}

function newRunId() {
  return `e2e_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
}

module.exports = {
  createMemoryDb,
  newRunId,
  DEFAULT_TABLES
}

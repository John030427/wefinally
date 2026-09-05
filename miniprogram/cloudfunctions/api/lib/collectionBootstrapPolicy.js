const BOOTSTRAP_COLLECTIONS = new Set([
  'system_counters',
  'agent_session',
  'agent_message',
  'agent_message_dedupe',
  'agent_run',
  'agent_tool_audit',
  'agent_tool_call',
  'agent_human_ticket',
  'agent_notification_job',
  'knowledge_article',
  'user_agent_memory',
  'date_coordination',
  'date_participant',
  'date_coordination_application',
  'date_coordination_proposal',
  'date_coordination_confirmation',
  'date_application_patch',
  'date_coordination_event',
  'coordination_projection_outbox',
  'match_experience_feedback',
  'date_experience_feedback',
  'match_claim',
  'match_claim_audit',
  'match_batch_run',
  'fixture_response_job',
  'controlled_date_scenario_run',
  'qa_pair_reset_run',
  'qa_pair_reset_audit',
  // QA pair reset enumerates these legacy-compatible child collections so a
  // fresh acceptance environment can safely initialize them before cleanup.
  'date_coordination_event_dedupe',
  'coordination_notification_dedupe',
  'date_submission_outbox',
  'agent_session_dedupe',
  'coordination_notification',
  'user_notification_cursor',
  'partner_commission_ledger',
  'partner_commission_rule',
  'partner_dashboard_daily',
  'partner_referral_attribution',
  'partner_share_event',
  'partner_candidate',
  'partner_binding',
  'partner_audit_log'
])

function canBootstrapCollection(name) {
  return BOOTSTRAP_COLLECTIONS.has(String(name || ''))
}

function errorText(error) {
  return String(error && (error.message || error.errMsg) || error || '')
}

function isMissingCollectionError(error) {
  return /collection[^\n]*(?:not exists|not exist|does not exist)|集合[^\n]*不存在/i.test(errorText(error))
}

function isAlreadyExistsError(error) {
  return /collection[^\n]*(?:already exists|has existed)|集合[^\n]*(?:已存在|已经存在)/i.test(errorText(error))
}

async function withCollectionBootstrap(options) {
  const input = options || {}
  try {
    return await input.operation()
  } catch (error) {
    if (!canBootstrapCollection(input.logicalName) || !isMissingCollectionError(error)) throw error
    try {
      await input.createCollection(input.physicalName)
    } catch (createError) {
      if (!isAlreadyExistsError(createError)) {
        const initError = new Error(`Agent 数据集合初始化失败：${input.physicalName}`)
        initError.code = 'AGENT_COLLECTION_INIT_FAILED'
        throw initError
      }
    }
    return input.operation()
  }
}

module.exports = {
  BOOTSTRAP_COLLECTIONS,
  canBootstrapCollection,
  isMissingCollectionError,
  withCollectionBootstrap
}

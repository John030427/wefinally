/**
 * Synthetic partner journeys that use REAL date_coordination services.
 * Data is fake; UI / state machine / LangGraph / patch / proposal are production.
 *
 * fixture_journey on synthetic user:
 *   accept | reject | full_coordination | legacy_queue
 * Default for matched QA fixtures: accept (real UI path).
 */

const { isInternalQaAccount, isSyntheticFixture, fixtureOwnerId, fixtureNotExpired, resolveTestIdentity } = require('./testIdentityPolicy')

const JOURNEYS = new Set(['accept', 'reject', 'full_coordination', 'legacy_queue'])

function text(value) {
  return String(value || '').trim()
}

function resolveFixtureJourney(partner = {}) {
  const raw = text(partner.fixture_journey || partner.fixture_scenario || partner.journey).toLowerCase()
  if (JOURNEYS.has(raw)) return raw
  // Named helpers for DevTools seeding
  const name = text(partner.fixture_label || partner.display_name || partner.nickname || partner.openid)
  if (/reject|婉拒|拒绝/i.test(name)) return 'reject'
  if (/accept|接受|同意/i.test(name)) return 'accept'
  if (/legacy|queue|排队/i.test(name)) return 'legacy_queue'
  // Prefer real-UI accept path over old polite_decline queue
  if (isSyntheticFixture(partner)) return 'accept'
  return ''
}

function canUseRealCoordinationWithFixture(actor, partner, now = new Date()) {
  if (!isSyntheticFixture(partner)) return false
  if (!fixtureNotExpired(partner, now)) return false
  const journey = resolveFixtureJourney(partner)
  if (!journey || journey === 'legacy_queue') return false
  const actorOk = isInternalQaAccount(actor)
    || resolveTestIdentity(actor).profile_origin === 'real_user'
  if (!actorOk) return false
  const owner = fixtureOwnerId(partner)
  const publicPool = text(partner.fixture_access_mode) === 'public_test_pool'
  if (owner && Number(actor && actor.id) === owner) return true
  if (publicPool && isInternalQaAccount(actor)) return true
  // Matched demo: internal QA may coordinate with owned-or-public synthetic partners only
  return false
}

function assertFixtureOfflineDatingAllowed(partner, options = {}) {
  if (!isSyntheticFixture(partner)) return
  if (options.allowControlledFixtureJourney === true && canUseRealCoordinationWithFixture(options.actor || {}, partner, options.now)) {
    return
  }
  throw new Error('测试画像仅用于匹配效果验证，不能发起约会或线下见面')
}

function futureDate(daysAhead) {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + Number(daysAhead || 0))
  return value.toISOString().slice(0, 10)
}

/** Default prefs that conflict with typical A Friday/Nanshan so NL can resolve */
function syntheticPartnerPreferences(journey = 'accept') {
  const sat = futureDate(6)
  if (journey === 'reject') {
    return null
  }
  return {
    availability: [{ date: sat, periods: ['afternoon'] }],
    areas: ['福田'],
    activities: ['咖啡', '散步'],
    budget: '50-100',
    payment_preference: 'aa',
    duration: '1-2h',
    transport_constraints: '',
    other_requirements: '',
    share_message: ''
  }
}

function initiatorSeedPreferences() {
  const fri = futureDate(5)
  return {
    availability: [{ date: fri, periods: ['evening'] }],
    areas: ['南山'],
    activities: ['咖啡'],
    budget: '100-200',
    payment_preference: 'aa',
    duration: '1-2h',
    transport_constraints: '',
    other_requirements: '',
    share_message: ''
  }
}

/**
 * Drive synthetic B through the same handlers a real B would call.
 * deps must expose respondInvitation / saveApplicationForUser / processWorker as needed.
 */
async function advanceSyntheticPartner(input = {}, deps = {}) {
  const coordination = input.coordination
  const partner = input.partner
  const journey = resolveFixtureJourney(partner)
  if (!coordination || !partner || !journey || journey === 'legacy_queue') {
    return { advanced: false, reason: 'not_applicable' }
  }

  const status = String(coordination.status || '')
  const partnerWx = { OPENID: partner.openid, __synthetic_user_id: Number(partner.id) }

  if (status === 'inviting_partner') {
    if (journey === 'reject') {
      const detail = await deps.respondInvitation(
        { coordination_id: coordination.id, decision: 'decline' },
        partnerWx
      )
      return { advanced: true, step: 'reject_invitation', detail, journey }
    }
    const detail = await deps.respondInvitation(
      { coordination_id: coordination.id, decision: 'accept' },
      partnerWx
    )
    return { advanced: true, step: 'accept_invitation', detail, journey }
  }

  if (status === 'collecting_preferences' && (journey === 'accept' || journey === 'full_coordination')) {
    const prefs = syntheticPartnerPreferences(journey)
    if (!prefs) return { advanced: false, reason: 'no_prefs' }
    const existing = deps.first
      ? await deps.first('date_coordination_application', {
        coordination_id: Number(coordination.id),
        user_id: Number(partner.id),
        coordination_version: Number(coordination.coordination_version || 1)
      })
      : null
    if (existing) return { advanced: false, reason: 'partner_already_submitted' }
    const detail = await deps.saveApplicationForUser(
      Object.assign({ coordination_id: coordination.id }, prefs),
      partner
    )
    return { advanced: true, step: 'submit_partner_application', detail, journey }
  }

  if (status === 'waiting_confirmations' && (journey === 'accept' || journey === 'full_coordination')) {
    if (typeof deps.confirmProposalForUser !== 'function') {
      return { advanced: false, reason: 'confirm_helper_missing' }
    }
    let proposalId = Number(coordination.final_proposal_id || 0)
    if (!proposalId && typeof deps.first === 'function') {
      const proposal = await deps.first('date_coordination_proposal', {
        coordination_id: Number(coordination.id),
        coordination_version: Number(coordination.coordination_version || 1),
        status: 'active'
      })
      proposalId = Number(proposal && proposal.id || 0)
    }
    if (!proposalId && typeof deps.list === 'function') {
      const proposals = await deps.list('date_coordination_proposal', {
        coordination_id: Number(coordination.id),
        coordination_version: Number(coordination.coordination_version || 1)
      }, 10)
      const active = (proposals || []).find((item) => item.status === 'active')
      proposalId = Number(active && active.id || 0)
    }
    if (!proposalId) return { advanced: false, reason: 'proposal_missing' }
    const detail = await deps.confirmProposalForUser(
      {
        coordination_id: coordination.id,
        proposal_id: proposalId,
        coordination_version: Number(coordination.coordination_version || 1),
        decision: 'confirm'
      },
      partner
    )
    return { advanced: true, step: 'confirm_proposal', detail, journey }
  }

  return { advanced: false, reason: `idle_at_${status}`, journey }
}

function publicSafeDeclineMessage() {
  return '对方暂未接受本次约会邀请。'
}

function buildFixtureSeedProfile(overrides = {}) {
  const journey = resolveFixtureJourney(overrides) || 'accept'
  return Object.assign({
    profile_origin: 'synthetic_fixture',
    is_test_fixture: 1,
    formal_match_hidden: 1,
    fixture_journey: journey,
    fixture_access_mode: 'public_test_pool',
    education: overrides.education || '硕士',
    city: overrides.city || '深圳',
    province_code: '440000',
    province_name: '广东省',
    city_code: '440300',
    city_name: '深圳',
    gender: overrides.gender || 2,
    birth_year: overrides.birth_year || 1994,
    marry_status: '未婚',
    baby_plan: '2-3年内',
    member_status: 'approved',
    status: 1,
    is_vip: 1,
    vip_expire_time: '2099-01-01T00:00:00.000Z'
  }, overrides)
}

module.exports = {
  JOURNEYS,
  resolveFixtureJourney,
  canUseRealCoordinationWithFixture,
  assertFixtureOfflineDatingAllowed,
  syntheticPartnerPreferences,
  initiatorSeedPreferences,
  advanceSyntheticPartner,
  publicSafeDeclineMessage,
  buildFixtureSeedProfile,
  futureDate
}

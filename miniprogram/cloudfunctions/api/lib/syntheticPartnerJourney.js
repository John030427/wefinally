/**
 * Synthetic partner journeys that use REAL date_coordination services.
 * Data is fake; UI / state machine / LangGraph / patch / proposal are production.
 *
 * fixture_journey on synthetic user:
 *   accept_direct | accept (alias)
 *   coordinate | full_coordination (alias)
 *   decline | reject (alias)
 *   no_response
 *   accept_no_prefs
 *   legacy_queue
 */

const { isInternalQaAccount, isSyntheticFixture, fixtureOwnerId, fixtureNotExpired, resolveTestIdentity } = require('./testIdentityPolicy')
const { resolveFixtureJourneyName } = require('./invitationCoordination')

const JOURNEYS = new Set([
  'accept_direct',
  'accept',
  'coordinate',
  'full_coordination',
  'decline',
  'reject',
  'no_response',
  'accept_no_prefs',
  'legacy_queue'
])

function text(value) {
  return String(value || '').trim()
}

function resolveFixtureJourney(partner = {}) {
  const raw = text(partner.fixture_journey || partner.fixture_scenario || partner.journey).toLowerCase()
  const canonical = resolveFixtureJourneyName(raw)
  if (canonical) return canonical
  if (JOURNEYS.has(raw)) return resolveFixtureJourneyName(raw) || raw
  const name = text(partner.fixture_label || partner.display_name || partner.nickname || partner.openid)
  if (/no[_-]?response|不回应|无响应/i.test(name)) return 'no_response'
  if (/accept_no_prefs|不填/i.test(name)) return 'accept_no_prefs'
  if (/coordinate|协调/i.test(name)) return 'coordinate'
  if (/reject|decline|婉拒|拒绝|暂不方便/i.test(name)) return 'decline'
  if (/accept_direct|直接接受/i.test(name)) return 'accept_direct'
  if (/accept|接受|同意/i.test(name)) return 'accept_direct'
  if (/legacy|queue|排队/i.test(name)) return 'legacy_queue'
  if (isSyntheticFixture(partner)) return 'accept_direct'
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
  return false
}

function assertFixtureOfflineDatingAllowed(partner, options = {}) {
  if (!isSyntheticFixture(partner)) return
  if (options.allowControlledFixtureJourney === true && canUseRealCoordinationWithFixture(options.actor || {}, partner, options.now)) {
    return
  }
  throw new Error('测试画像仅用于匹配效果验证，不能发起约会或线下见面')
}

function futureDate(daysAhead, now = new Date()) {
  const value = new Date(now)
  value.setUTCDate(value.getUTCDate() + Number(daysAhead || 0))
  return value.toISOString().slice(0, 10)
}

/** Default prefs that conflict with typical A Friday/Nanshan so NL can resolve */
function syntheticPartnerPreferences(journey = 'coordinate', now = new Date()) {
  const canonical = resolveFixtureJourneyName(journey) || journey
  if (canonical === 'decline' || canonical === 'no_response') return null
  const sat = futureDate(6, now)
  return {
    availability: [{ date: sat, periods: ['afternoon'] }],
    areas: ['福田'],
    activities: ['咖啡', '散步'],
    budget: '50-100',
    payment_preference: 'aa',
    duration: '1-2h',
    transport_constraints: '',
    other_requirements: '',
    share_message: '',
    preference_evidence: {
      availability: 'explicit',
      areas: 'explicit',
      activities: 'explicit',
      budget: 'explicit',
      payment_preference: 'explicit',
      duration: 'explicit'
    },
    application_source: 'invitee_full_form'
  }
}

function initiatorSeedPreferences(now = new Date()) {
  const fri = futureDate(5, now)
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
 */
async function advanceSyntheticPartner(input = {}, deps = {}) {
  const coordination = input.coordination
  const partner = input.partner
  const journey = resolveFixtureJourney(partner)
  if (!coordination || !partner || !journey || journey === 'legacy_queue') {
    return { advanced: false, reason: 'not_applicable' }
  }
  if (journey === 'no_response') {
    return { advanced: false, reason: 'no_response', journey }
  }

  const status = String(coordination.status || '')
  const partnerWx = { OPENID: partner.openid, __synthetic_user_id: Number(partner.id) }
  const invitationVersion = Number(coordination.invitation_version || coordination.coordination_version || 1)

  if (status === 'inviting_partner') {
    if (journey === 'decline') {
      const detail = await deps.respondInvitation(
        { coordination_id: coordination.id, decision: 'decline' },
        partnerWx
      )
      return { advanced: true, step: 'decline_invitation', detail, journey }
    }
    if (journey === 'accept_direct') {
      const detail = await deps.respondInvitation(
        {
          coordination_id: coordination.id,
          decision: 'accept',
          invitation_version: invitationVersion
        },
        partnerWx
      )
      return { advanced: true, step: 'accept_direct', detail, journey }
    }
    if (journey === 'coordinate' || journey === 'accept_no_prefs') {
      const detail = await deps.respondInvitation(
        { coordination_id: coordination.id, decision: 'coordinate' },
        partnerWx
      )
      return { advanced: true, step: 'coordinate_invitation', detail, journey }
    }
    return { advanced: false, reason: `unknown_journey_${journey}`, journey }
  }

  if (status === 'collecting_preferences' && journey === 'coordinate') {
    const prefs = syntheticPartnerPreferences(journey, deps.now ? deps.now() : new Date())
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

  if (status === 'collecting_preferences' && journey === 'accept_no_prefs') {
    return { advanced: false, reason: 'waiting_invitee_preference', journey }
  }

  if (status === 'waiting_confirmations' && journey === 'coordinate') {
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

  if ((status === 'no_overlap' || status === 'replanning') && journey === 'coordinate') {
    if (typeof deps.createPreviewForUser !== 'function' || typeof deps.confirmForUser !== 'function') {
      return { advanced: false, reason: 'patch_helpers_missing' }
    }
    const version = Number(coordination.coordination_version || 1)
    const aApp = deps.first
      ? await deps.first('date_coordination_application', {
        coordination_id: Number(coordination.id),
        user_id: Number(coordination.user_a_id),
        coordination_version: version
      })
      : null
    const bApp = deps.first
      ? await deps.first('date_coordination_application', {
        coordination_id: Number(coordination.id),
        user_id: Number(partner.id),
        coordination_version: version
      })
      : null
    const aAreas = (aApp && aApp.application && aApp.application.areas) || []
    const bAreas = (bApp && bApp.application && bApp.application.areas) || []
    if (!aAreas.includes('车公庙')) return { advanced: false, reason: 'waiting_initiator_area' }
    if (bAreas.includes('车公庙')) return { advanced: false, reason: 'area_already_aligned' }
    const preview = await deps.createPreviewForUser({
      coordination_id: coordination.id,
      changes: { areas: Array.from(new Set(bAreas.concat(['车公庙']))) }
    }, partner)
    const detail = await deps.confirmForUser({
      coordination_id: coordination.id,
      patch_id: preview.id
    }, partner)
    return { advanced: true, step: 'accept_compromise_area', detail, journey }
  }

  return { advanced: false, reason: `idle_at_${status}`, journey }
}

function publicSafeDeclineMessage() {
  return '对方暂未接受本次约会邀请。'
}

function fixtureSceneBadge(source = {}) {
  const isTest = Number(source.is_test_fixture || source.is_test_data || 0) === 1
    || text(source.profile_origin) === 'synthetic_fixture'
  if (!isTest) return ''
  const journey = resolveFixtureJourney(source) || text(source.fixture_journey || source.synthetic_partner_journey)
  if (journey === 'decline') return '测试 · 暂不方便'
  if (journey === 'accept_direct') return '测试 · 直接接受'
  if (journey === 'coordinate') return '测试 · AI协调'
  if (journey === 'no_response') return '测试 · 不回应'
  if (journey === 'accept_no_prefs') return '测试 · 接受未填偏好'
  return '测试数据'
}

function buildFixtureSeedProfile(overrides = {}) {
  const journey = resolveFixtureJourney(overrides) || 'accept_direct'
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
  fixtureSceneBadge,
  buildFixtureSeedProfile,
  futureDate
}

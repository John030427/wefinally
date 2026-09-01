const {
  col,
  first,
  byId,
  addWithId,
  updateByDoc,
  transaction,
  ensureUserSupportCode,
  authError,
  now,
  listChunksByOwnerIds,
  upsertChunk,
  disableChunks
} = require('../lib/db')
const { tokenFor } = require('./auth')
const { isVipActive } = require('../lib/format')
const { ensureReferralAttribution } = require('../lib/partnerReferralAttributionPolicy')
const {
  MEMBER_STATUS,
  memberStatus,
  normalizeOccupation,
  resolveInvitation
} = require('../lib/memberPolicy')
const { resolveTestIdentity } = require('../lib/testIdentityPolicy')
const { resolveQaTestRunEnabled } = require('../lib/qaAccessPolicy')
const { flagEnabled } = require('../lib/flags')
const { resolveRegion } = require('../lib/regionNormalize')
const {
  QA_REGISTRATION_CONFIRM_TEXT,
  QA_REGISTRATION_PUBLIC_FLAG,
  canReplayRegistration,
  createQaMatchRunId,
  buildReplayRequestPatch,
  buildReplayCompletionPatch,
  buildResetMatchSettingPatch
} = require('../lib/qaRegistrationReplayPolicy')
const {
  shouldInvalidateAiMatchProfile
} = require('../lib/aiMatchProfile')
const {
  normalizeIdentityInput,
  legacyTagsFromUser,
  summarizeIdentities
} = require('../lib/userIdentityTags')
const {
  projectCorpusDocuments,
  isEligibleUser,
  syncUserCorpus
} = require('../lib/matchRagCorpus')

function ragCorpusRepository() {
  return { listChunksByOwnerIds, upsertChunk, disableChunks, now }
}

async function markCorpusSyncState(user, stale, reason, timestamp) {
  if (!user || !user._id) return
  try {
    await updateByDoc('user', user, stale ? {
      rag_corpus_stale: 1,
      rag_corpus_sync_reason: reason || 'corpus_unavailable',
      rag_corpus_sync_failed_at: timestamp
    } : {
      rag_corpus_stale: 0,
      rag_corpus_sync_reason: '',
      rag_corpus_synced_at: timestamp
    })
  } catch (error) {
    // Reconciliation backfill remains the durable retry path.
  }
}

async function syncCorpusBestEffort(user, settingOverride) {
  const timestamp = now()
  try {
    const setting = settingOverride || await first('user_match_setting', { user_id: user.id }) || {}
    const documents = projectCorpusDocuments(user, setting, timestamp)
    const forceDisable = !isEligibleUser(user, setting, documents)
    await syncUserCorpus(user, setting, ragCorpusRepository(), { forceDisable })
    await markCorpusSyncState(user, false, '', timestamp)
    return { synced: true, reason: '' }
  } catch (error) {
    await markCorpusSyncState(user, true, 'corpus_unavailable', timestamp)
    return { synced: false, reason: 'corpus_unavailable' }
  }
}

async function currentUser(wxContext) {
  const openid = wxContext.OPENID
  if (!openid) throw authError('无法获取微信身份')
  const user = await first('user', { openid })
  if (!user) throw authError('请先登录')
  return user
}

async function circleName(circleId) {
  const circle = await byId('occupation_circle', circleId)
  return circle ? (circle.circle_name || circle.name || '') : ''
}

async function loadIdentityTags(userId) {
  try {
    const rows = await col('user_identity_tag').where({ user_id: Number(userId) }).limit(10).get()
    return (rows && rows.data) || []
  } catch (error) {
    return []
  }
}

async function replaceIdentityTags(userId, tags) {
  const existing = await loadIdentityTags(userId)
  for (const row of existing) {
    try {
      await col('user_identity_tag').doc(row._id || row.id).remove()
    } catch (error) {
      // best-effort cleanup
    }
  }
  for (const tag of tags || []) {
    await addWithId('user_identity_tag', {
      user_id: Number(userId),
      circle_id: Number(tag.circle_id),
      is_primary: tag.is_primary ? 1 : 0,
      source: tag.source || 'user_declared',
      verified_status: tag.verified_status || 'unverified',
      occupation_description: tag.occupation_description || ''
    }, 'user_identity_tag')
  }
}

async function profilePayload(user) {
  const [setting, supportCode, publicTestRunEnabled, publicRegistrationReplayEnabled, identityRows] = await Promise.all([
    first('user_match_setting', { user_id: user.id }),
    ensureUserSupportCode(user),
    flagEnabled('match_test_run_public_enabled'),
    flagEnabled(QA_REGISTRATION_PUBLIC_FLAG),
    loadIdentityTags(user.id)
  ])
  const identity = resolveTestIdentity(user)
  const tags = identityRows.length ? identityRows : legacyTagsFromUser(user)
  const summarized = summarizeIdentities(tags)
  const region = resolveRegion(user)
  return Object.assign({}, user, {
    support_code: supportCode,
    circle_name: user.circle_name || await circleName(user.circle_id),
    is_vip: isVipActive(user) ? 1 : 0,
    isVip: isVipActive(user),
    match_settings: setting || null,
    member_status: memberStatus(user),
    account_mode: identity.account_mode,
    identity_kind: identity.kind,
    qa_test_run_enabled: resolveQaTestRunEnabled(user, publicTestRunEnabled),
    qa_registration_replay_enabled: canReplayRegistration(user, publicRegistrationReplayEnabled),
    primary_circle_id: summarized.primary_circle_id || user.circle_id,
    secondary_circle_ids: summarized.secondary_circle_ids,
    identity_tags: summarized.tags,
    province_code: user.province_code || region.province_code,
    province_name: user.province_name || region.province_name,
    city_code: user.city_code || region.city_code,
    city_name: user.city_name || region.city_name || user.city,
    // Attribution remains partner-locked; multi-identity must not fork promote_partner_id
    promote_partner_id: user.promote_partner_id || 0
  })
}

function parseGender(value) {
  if (value === '男' || Number(value) === 1) return 1
  if (value === '女' || Number(value) === 2) return 2
  return 0
}

async function register(data, wxContext) {
  const openid = wxContext.OPENID || data.openid
  if (!openid) throw new Error('缺少 openid')
  const existing = await first('user', { openid })
  if (existing) {
    if (Number(existing.registration_replay_pending || 0) === 1 && canReplayRegistration(existing)) {
      const identity = normalizeIdentityInput({
        circle_id: data.primary_circle_id != null ? data.primary_circle_id : data.circle_id,
        secondary_circle_ids: data.secondary_circle_ids,
        occupation_description: data.occupation_description
      })
      const occupation = normalizeOccupation({
        circleId: identity.primary_circle_id,
        description: identity.occupation_description
      })
      const region = resolveRegion(data)
      const replayedAt = now()
      const replayPatch = Object.assign(buildReplayCompletionPatch(data, replayedAt), {
        qa_match_run_id: createQaMatchRunId(existing.id, replayedAt),
        qa_match_run_started_at: replayedAt,
        circle_id: occupation.circleId,
        occupation_description: occupation.description,
        city: region.city || data.city || '深圳',
        province_code: region.province_code || '',
        province_name: region.province_name || '',
        city_code: region.city_code || '',
        city_name: region.city_name || region.city || data.city || '深圳',
        country_code: region.country_code || 'CN',
        country_name: region.country_name || '中国'
      })
      const replayedUser = await updateByDoc('user', existing, replayPatch)
      try {
        await replaceIdentityTags(existing.id, identity.tags)
      } catch (error) {
        console.warn('identity tag replay write skipped:', error.message || error)
      }
      try {
        await addWithId('partner_user_audit_log', {
          application_id: 0,
          partner_id: Number(existing.promote_partner_id || 0),
          user_id: existing.id,
          actor_role: 'user',
          actor_id: existing.id,
          action: 'complete_qa_registration_replay',
          from_status: 'registration_replay_pending',
          to_status: memberStatus(existing),
          reason: 'QA 真机资料重录完成',
          request_id: existing.qa_registration_reset_request_id || ''
        }, 'member_audit')
      } catch (error) {
        console.warn('registration replay audit skipped:', error.message || error)
      }
      const replayedProfile = await profilePayload(replayedUser)
      return {
        token: tokenFor(openid),
        user: replayedProfile,
        userInfo: replayedProfile,
        registration_replayed: true
      }
    }
    if (Number(existing.promote_partner_id || 0) > 0) {
      await ensureReferralAttribution(
        existing,
        { id: existing.promote_partner_id, promote_code: existing.promote_code },
        existing.promote_code,
        { first, addWithId, now }
      )
    }
    return {
      token: tokenFor(openid),
      user: await profilePayload(existing)
    }
  }

  const partner = await resolveInvitation(data.promote_code, first)
  const identity = normalizeIdentityInput({
    circle_id: data.primary_circle_id != null ? data.primary_circle_id : data.circle_id,
    secondary_circle_ids: data.secondary_circle_ids,
    occupation_description: data.occupation_description
  })
  const occupation = normalizeOccupation({
    circleId: identity.primary_circle_id,
    description: identity.occupation_description
  })
  const region = resolveRegion(data)
  const normalizedPromoteCode = partner
    ? String(partner.promote_code || data.promote_code).trim().toUpperCase()
    : ''
  const createdAt = now()

  const user = await addWithId('user', {
    openid,
    gender: parseGender(data.gender),
    birth_year: Number(data.birth_year),
    height_range: data.height_range || '',
    education: data.education || '',
    circle_id: occupation.circleId,
    occupation_description: occupation.description,
    city: region.city || data.city || '深圳',
    province_code: region.province_code || '',
    province_name: region.province_name || '',
    city_code: region.city_code || '',
    city_name: region.city_name || region.city || data.city || '深圳',
    country_code: region.country_code || 'CN',
    country_name: region.country_name || '中国',
    marry_status: data.marry_status || '未婚',
    baby_plan: data.baby_plan || '',
    income_range: data.income_range || '',
    house_car: data.house_car || '',
    status: 1,
    member_status: MEMBER_STATUS.PENDING_PROFILE,
    member_status_updated_at: createdAt,
    is_vip: 0,
    vip_expire_time: null,
    promote_partner_id: partner ? Number(partner.id) : 0,
    promote_code: normalizedPromoteCode,
    free_member: 0,
    free_source: '',
    appearance_description: data.appearance_description || '',
    appearance_want: '',
    appearance_tags: '',
    appearance_want_tags: '',
    last_match_setting_time: null
  }, 'user')
  try {
    await replaceIdentityTags(user.id, identity.tags)
  } catch (error) {
    console.warn('identity tag write skipped:', error.message || error)
  }

  if (partner) {
    await ensureReferralAttribution(user, partner, data.promote_code, { first, addWithId, now })
  }

  await addWithId('user_match_setting', {
    user_id: user.id,
    last_edit_time: null
  }, 'match_setting')

  try {
    await addWithId('user_privacy_auth_log', {
      openid,
      user_id: user.id,
      auth_service: 1,
      auth_privacy: 1,
      auth_data: 1,
      device_info: data.device_info || '',
      auth_time: now()
    }, 'privacy')
  } catch (err) {
    console.warn('privacy auth log skipped:', err.message || err)
  }

  const registeredProfile = await profilePayload(user)
  return {
    token: tokenFor(openid),
    user: registeredProfile,
    userInfo: registeredProfile
  }
}

async function resetQaRegistration(data, wxContext) {
  const user = await currentUser(wxContext)
  const publicRegistrationReplayEnabled = await flagEnabled(QA_REGISTRATION_PUBLIC_FLAG)
  if (!canReplayRegistration(user, publicRegistrationReplayEnabled)) {
    const error = new Error('仅显式 QA 测试账号可重新录入资料')
    error.code = 403
    throw error
  }
  const requestedAt = now()
  const patch = buildReplayRequestPatch(data, requestedAt)
  if (
    Number(user.registration_replay_pending || 0) === 1
    && String(user.qa_registration_reset_request_id || '') === patch.qa_registration_reset_request_id
  ) {
    return { reset: true, need_register: true, idempotent: true }
  }

  const setting = await first('user_match_setting', { user_id: user.id })
  await transaction(async (store) => {
    const current = await store.byId('user', user.id)
    if (!current || !canReplayRegistration(current, publicRegistrationReplayEnabled)) {
      throw new Error('QA 测试账号状态已变化，请刷新后重试')
    }
    if (setting && setting._id) {
      const currentSetting = await store.byDocId('user_match_setting', setting._id)
      if (currentSetting) await store.updateByDoc('user_match_setting', currentSetting, buildResetMatchSettingPatch())
    }
    await store.updateByDoc('user', current, patch)
    await store.addWithId('partner_user_audit_log', {
      application_id: 0,
      partner_id: Number(current.promote_partner_id || 0),
      user_id: current.id,
      actor_role: 'user',
      actor_id: current.id,
      action: 'request_qa_registration_replay',
      from_status: memberStatus(current),
      to_status: 'registration_replay_pending',
      reason: `用户确认“${QA_REGISTRATION_CONFIRM_TEXT}”`,
      request_id: patch.qa_registration_reset_request_id
    }, 'member_audit')
  })

  return { reset: true, need_register: true, idempotent: false }
}

async function getProfile(data, wxContext) {
  return profilePayload(await currentUser(wxContext))
}

async function updateProfile(data, wxContext) {
  const user = await currentUser(wxContext)
  const patch = {}
  const allowed = [
    'city', 'education', 'income_range', 'house_car', 'baby_plan',
    'height_range', 'appearance_description', 'appearance_want',
    'circle_id', 'occupation_description',
    'province_code', 'province_name', 'city_code', 'city_name',
    'country_code', 'country_name'
  ]
  if (memberStatus(user) !== MEMBER_STATUS.APPROVED) allowed.push('birth_year')
  allowed.forEach((key) => {
    if (data[key] !== undefined) patch[key] = data[key]
  })

  if (data.primary_circle_id != null || data.circle_id != null || data.secondary_circle_ids) {
    const identity = normalizeIdentityInput({
      circle_id: data.primary_circle_id != null ? data.primary_circle_id : (data.circle_id != null ? data.circle_id : user.circle_id),
      secondary_circle_ids: data.secondary_circle_ids,
      occupation_description: data.occupation_description != null ? data.occupation_description : user.occupation_description
    })
    patch.circle_id = identity.primary_circle_id
    patch.occupation_description = identity.occupation_description
    try {
      await replaceIdentityTags(user.id, identity.tags)
    } catch (error) {
      console.warn('identity tag update skipped:', error.message || error)
    }
  }

  if (data.city || data.province_code || data.city_code) {
    const region = resolveRegion(Object.assign({}, user, data, patch))
    patch.city = region.city || patch.city || user.city
    patch.province_code = region.province_code
    patch.province_name = region.province_name
    patch.city_code = region.city_code
    patch.city_name = region.city_name || patch.city
    patch.country_code = region.country_code || 'CN'
    patch.country_name = region.country_name || '中国'
  }

  const updated = await updateByDoc('user', user, patch)

  try {
    const setting = await first('user_match_setting', { user_id: user.id })
    if (setting && setting.ai_match_profile_json) {
      const aiProfile = typeof setting.ai_match_profile_json === 'string'
        ? JSON.parse(setting.ai_match_profile_json)
        : setting.ai_match_profile_json
      const source = Object.assign({}, user, updated, patch, {
        primary_circle_id: patch.circle_id != null ? patch.circle_id : user.circle_id,
        secondary_circle_ids: data.secondary_circle_ids
      })
      if (shouldInvalidateAiMatchProfile(aiProfile, source)) {
        await updateByDoc('user_match_setting', setting, {
          ai_match_profile_stale: 1,
          last_profile_change_at: now()
        })
      }
    }
  } catch (error) {
    console.warn('ai profile stale mark skipped:', error.message || error)
  }

  await syncCorpusBestEffort(Object.assign({}, user, updated, patch))

  return profilePayload(updated)
}

async function marryReport(data, wxContext) {
  const user = await currentUser(wxContext)
  const report = await addWithId('marry_report', {
    user_id: user.id,
    openid: user.openid,
    report_type: 1,
    proof_img: data.proof_img || '',
    contact_phone: data.contact_phone || '',
    review_note: data.review_note || '',
    reject_reason: '',
    audit_status: 0
  }, 'marry_report')
  return report
}

async function cancel(data, wxContext) {
  const user = await currentUser(wxContext)
  const cancelledAt = now()
  const deleteAfter = new Date(cancelledAt.getTime() + 15 * 24 * 60 * 60 * 1000)
  const cancelledUser = await updateByDoc('user', user, { status: 3, cancel_time: cancelledAt })
  const taskRedaction = {
    status: 'cancelled',
    reports: null,
    input_snapshot: null,
    error_code: 'account_cancelled',
    error_message: '',
    cancelled_at: cancelledAt,
    delete_after: deleteAfter,
    update_time: cancelledAt
  }
  await Promise.all([
    col('ai_report_task').where({ 'user_ids.a': Number(user.id) }).update({ data: taskRedaction }),
    col('ai_report_task').where({ 'user_ids.b': Number(user.id) }).update({ data: taskRedaction }),
    col('user_match_log').where({ user_id: Number(user.id) }).update({ data: {
      ai_report_text: '',
      local_report_text: '',
      ai_report_error: '',
      update_time: cancelledAt
    } }),
    col('user_match_log').where({ match_user_id: Number(user.id) }).update({ data: {
      ai_report_text: '',
      local_report_text: '',
      ai_report_error: '',
      update_time: cancelledAt
    } })
  ])
  await syncCorpusBestEffort(Object.assign({}, user, cancelledUser, { status: 3, cancel_time: cancelledAt }))
  return { submitted: true }
}

async function claimFree(data, wxContext) {
  const user = await currentUser(wxContext)
  const code = String(data.activation_code || data.phone || '').trim()
  if (!code) throw new Error('请输入激活码')
  const wl = await first('free_whitelist', { phone: code })
  if (!wl || Number(wl.used || 0) === 1) throw new Error('激活码无效或已使用')
  await updateByDoc('free_whitelist', wl, { used: 1 })
  const updated = await updateByDoc('user', user, {
    free_member: 1,
    free_source: wl.source || 'activation',
    status: 1
  })
  await syncCorpusBestEffort(Object.assign({}, user, updated, { status: 1 }))
  return profilePayload(updated)
}

async function divorceReviewStatus(data, wxContext) {
  const openid = data.openid || wxContext.OPENID
  if (!openid) throw new Error('缺少 openid')
  const row = await first('marry_report', { openid, report_type: 2 })
  if (!row) return { status: 'none', audit_status: -1 }
  return Object.assign({}, row, {
    status: row.audit_status === 1 ? 'approved' : (row.audit_status === 2 ? 'rejected' : 'pending')
  })
}

async function submitDivorceReview(data, wxContext) {
  const openid = data.openid || wxContext.OPENID
  if (!openid) throw new Error('缺少 openid')
  return addWithId('marry_report', {
    user_id: 0,
    openid,
    report_type: 2,
    proof_img: '',
    contact_phone: data.contact_phone || '',
    review_note: data.review_note || '',
    reject_reason: '',
    audit_status: 0
  }, 'marry_report')
}

module.exports = {
  currentUser,
  profilePayload,
  register,
  resetQaRegistration,
  getProfile,
  updateProfile,
  marryReport,
  cancel,
  claimFree,
  divorceReviewStatus,
  submitDivorceReview
}

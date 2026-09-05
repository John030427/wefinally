/**
 * Optimistic concurrency helpers for A/B preference updates.
 */

function nextVersion(current) {
  const value = Number(current || 0)
  return (Number.isFinite(value) ? value : 0) + 1
}

/**
 * CAS-style preference merge: reject stale writes, merge additive fields.
 */
function applyPreferencePatch(currentApp = {}, patch = {}, expectedVersion) {
  const currentVersion = Number(currentApp.preference_version || currentApp.coordination_version || 1)
  if (expectedVersion != null && Number(expectedVersion) !== currentVersion) {
    return {
      ok: false,
      conflict: true,
      reason: 'version_conflict',
      current_version: currentVersion,
      expected_version: Number(expectedVersion)
    }
  }

  const next = {
    ...currentApp,
    preference_version: nextVersion(currentVersion),
    coordination_version: nextVersion(currentApp.coordination_version || currentVersion)
  }

  if (Array.isArray(patch.availability_add) && patch.availability_add.length) {
    const existing = Array.isArray(currentApp.availability) ? currentApp.availability.slice() : []
    for (const item of patch.availability_add) {
      const key = `${item.date}|${(item.periods || []).slice().sort().join(',')}`
      const exists = existing.some((row) => `${row.date}|${(row.periods || []).slice().sort().join(',')}` === key)
      if (!exists) existing.push(item)
    }
    next.availability = existing
  }

  if (Array.isArray(patch.areas_add) && patch.areas_add.length) {
    const set = new Set([...(currentApp.areas || []), ...patch.areas_add].map((item) => String(item).trim()).filter(Boolean))
    next.areas = Array.from(set)
  }

  if (Array.isArray(patch.activities_add) && patch.activities_add.length) {
    const set = new Set([...(currentApp.activities || []), ...patch.activities_add].map((item) => String(item).trim()).filter(Boolean))
    next.activities = Array.from(set)
  }

  for (const key of ['budget', 'payment_preference', 'duration', 'transport_constraints', 'other_requirements']) {
    if (patch[key] !== undefined) next[key] = patch[key]
  }

  return {
    ok: true,
    conflict: false,
    application: next,
    preference_version: next.preference_version,
    coordination_version: next.coordination_version
  }
}

/**
 * Merge two concurrent additive patches without lost update.
 */
function mergeConcurrentPreferencePatches(baseApp, patchA, patchB) {
  const afterA = applyPreferencePatch(baseApp, patchA)
  if (!afterA.ok) return afterA
  // Apply B against post-A state but keep additive semantics (do not require B's old version)
  return applyPreferencePatch(afterA.application, patchB, null)
}

function buildResumeSummary(events = [], lastSeenVersion = 0) {
  const unseen = (events || []).filter((event) => Number(event.coordination_version || 0) > Number(lastSeenVersion || 0))
  if (!unseen.length) {
    return {
      has_updates: false,
      lines: ['目前没有新的协调进展，你可以继续告诉我希望调整的条件。']
    }
  }
  const lines = ['你离开后有新的协调进展：']
  for (const event of unseen.slice(-6)) {
    const type = String(event.event_type || '')
    if (/overlap|共同/.test(type) || event.safe_summary && event.safe_summary.stage === 'overlap') {
      lines.push('- 目前双方出现了新的共同可约安排')
    } else if (/preference|申请|更新/.test(type)) {
      lines.push('- 对方补充了新的协调条件（仅展示共同进度）')
    } else if (/proposal/.test(type)) {
      lines.push('- 已生成待确认的见面方案')
    } else if (/action|confirm/.test(type)) {
      lines.push('- 有步骤等待你确认')
    } else {
      lines.push('- 协调状态已更新，请查看最新共同进度')
    }
  }
  lines.push('我不会向你透露对方的私人回答。你可以继续提出调整。')
  return { has_updates: true, lines: Array.from(new Set(lines)) }
}

function buildActiveContextSummary(events = [], contextRef = null) {
  if (!contextRef || contextRef.type !== 'partner_inquiry' || Number(contextRef.event_id || 0) <= 0) return ''
  const event = (events || []).find((row) => Number(row.id || row.event_id || 0) === Number(contextRef.event_id))
  const safeSummary = event && event.safe_summary && typeof event.safe_summary === 'object'
    ? event.safe_summary
    : null
  return String(safeSummary && (safeSummary.relay_text || safeSummary.content) || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 240)
}

function chooseAdjustmentParty(input = {}) {
  const last = String(input.last_adjustment_requested_party || '')
  const aFlexible = input.a_has_flexibility !== false
  const bFlexible = input.b_has_flexibility !== false
  if (aFlexible && !bFlexible) return 'A'
  if (bFlexible && !aFlexible) return 'B'
  if (last === 'A' && bFlexible) return 'B'
  if (last === 'B' && aFlexible) return 'A'
  return bFlexible ? 'B' : 'A'
}

module.exports = {
  nextVersion,
  applyPreferencePatch,
  mergeConcurrentPreferencePatches,
  buildResumeSummary,
  buildActiveContextSummary,
  chooseAdjustmentParty
}

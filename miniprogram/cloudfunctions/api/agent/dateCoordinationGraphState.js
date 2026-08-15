function uniqueStrings(values, limit, maxLength) {
  return [...new Set((values || [])
    .map((value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, limit)
}

function dateWindows(availability) {
  const values = []
  for (const item of Array.isArray(availability) ? availability : []) {
    const date = String(item && item.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    for (const period of Array.isArray(item.periods) ? item.periods : []) {
      const value = String(period || '').trim()
      if (value) values.push(`${date}:${value}`)
    }
  }
  return uniqueStrings(values, 12, 64)
}

function durationMinutes(value) {
  return {
    'about-1h': 60,
    '1-2h': 90,
    '2-3h': 150
  }[String(value || '')]
}

function budgetBand(value) {
  return {
    'under-50': 'low',
    '50-100': 'low',
    '100-200': 'medium',
    'over-200': 'high'
  }[String(value || '')]
}

function safePreference(application) {
  const source = application && typeof application === 'object' ? application : {}
  const result = {
    dateWindows: dateWindows(source.availability),
    regions: uniqueStrings(source.areas, 8, 40),
    venueTypes: uniqueStrings(source.activities, 8, 32)
  }
  const duration = durationMinutes(source.duration)
  const budget = budgetBand(source.budget)
  if (duration !== undefined) result.durationMinutes = duration
  if (budget !== undefined) result.budgetBand = budget
  return result
}

function latestApplication(rows, userId, coordinationVersion) {
  return (rows || [])
    .filter((row) => Number(row.user_id) === Number(userId))
    .filter((row) => Number(row.coordination_version || 0) <= Number(coordinationVersion || 1))
    .sort((a, b) => Number(b.coordination_version || 0) - Number(a.coordination_version || 0))[0] || null
}

function buildDateCoordinationGraphInput(coordination, applications, user) {
  const version = Number(coordination.coordination_version || 1)
  const applicationA = latestApplication(applications, coordination.user_a_id, version)
  const applicationB = latestApplication(applications, coordination.user_b_id, version)
  return {
    coordinationId: Number(coordination.id),
    coordinationVersion: version,
    party: Number(user.id) === Number(coordination.user_a_id) ? 'A' : 'B',
    partyAState: safePreference(applicationA && applicationA.application),
    partyBState: safePreference(applicationB && applicationB.application)
  }
}

module.exports = {
  safePreference,
  latestApplication,
  buildDateCoordinationGraphInput
}

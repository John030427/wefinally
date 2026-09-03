function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase()
}

function normalizedCircles(circles, primaryId) {
  const primary = Number(primaryId)
  return (circles || [])
    .map((item) => ({
      id: Number(item && item.id),
      name: String(item && (item.name || item.circle_name) || '').trim(),
      plate: String(item && item.plate_name || '其他').trim() || '其他'
    }))
    .filter((item) => Number.isFinite(item.id) && item.id !== 0 && item.id !== primary && item.name)
}

function buildSecondaryIdentityGroups(circles, primaryId, selectedIds, query) {
  const selected = new Set((selectedIds || []).map(Number))
  const keyword = normalizeText(query)
  const grouped = []
  const groupByPlate = new Map()
  normalizedCircles(circles, primaryId).forEach((item) => {
    const plateMatches = normalizeText(item.plate).includes(keyword)
    const nameMatches = normalizeText(item.name).includes(keyword)
    if (keyword && !plateMatches && !nameMatches) return
    if (!groupByPlate.has(item.plate)) {
      const group = { plate: item.plate, items: [] }
      groupByPlate.set(item.plate, group)
      grouped.push(group)
    }
    groupByPlate.get(item.plate).items.push({
      id: item.id,
      name: item.name,
      selected: selected.has(item.id)
    })
  })
  return grouped
}

function buildSelectedSecondaryIdentities(circles, selectedIds) {
  const selected = new Set((selectedIds || []).map(Number))
  return normalizedCircles(circles, null)
    .filter((item) => selected.has(item.id))
    .map((item) => ({ id: item.id, name: item.name }))
}

function toggleSecondaryIdentitySelection(selectedIds, id, max) {
  const normalizedId = Number(id)
  const limit = Math.max(0, Number(max) || 0)
  const selected = (selectedIds || []).map(Number).filter((item, index, rows) => (
    Number.isFinite(item) && item > 0 && rows.indexOf(item) === index
  ))
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return { selectedIds: selected, limitReached: false }
  }
  if (selected.includes(normalizedId)) {
    return { selectedIds: selected.filter((item) => item !== normalizedId), limitReached: false }
  }
  if (selected.length >= limit) return { selectedIds: selected, limitReached: true }
  return { selectedIds: selected.concat(normalizedId), limitReached: false }
}

module.exports = {
  buildSecondaryIdentityGroups,
  buildSelectedSecondaryIdentities,
  toggleSecondaryIdentitySelection
}

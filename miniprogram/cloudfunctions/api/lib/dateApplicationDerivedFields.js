function availabilityKey(value) {
  return JSON.stringify(Array.isArray(value) ? value : [])
}

function text(value) {
  return String(value || '').trim()
}

function reconcileDerivedFields(prev, next, options = {}) {
  const current = next && typeof next === 'object' ? Object.assign({}, next) : {}
  const previous = prev && typeof prev === 'object' ? prev : {}
  const exactTimeSupplied = options.exactTimeSupplied === true
  const venueSupplied = options.venueSupplied === true
  if (availabilityKey(previous.availability) !== availabilityKey(current.availability) && !exactTimeSupplied) {
    current.start_time = ''
  }
  const activityChanged = JSON.stringify(previous.activities || []) !== JSON.stringify(current.activities || [])
  const areaChanged = JSON.stringify(previous.areas || []) !== JSON.stringify(current.areas || [])
  // R2: changing activity/area must not wipe a user-chosen location unless venue was omitted
  // intentionally via an explicit empty activity_venue patch.
  if ((activityChanged || areaChanged) && !venueSupplied && !text(current.activity_venue) && text(previous.activity_venue)) {
    current.activity_venue = previous.activity_venue
  }
  return current
}

function enrichChangesWithDerivedClears(prev, changes) {
  const safeChanges = changes && typeof changes === 'object' ? Object.assign({}, changes) : {}
  const merged = Object.assign({}, prev || {}, safeChanges)
  const reconciled = reconcileDerivedFields(prev || {}, merged, {
    exactTimeSupplied: Object.prototype.hasOwnProperty.call(safeChanges, 'start_time'),
    venueSupplied: Object.prototype.hasOwnProperty.call(safeChanges, 'activity_venue')
  })
  if (text(reconciled.start_time) !== text(merged.start_time)) safeChanges.start_time = reconciled.start_time
  if (text(reconciled.activity_venue) !== text(merged.activity_venue)) {
    safeChanges.activity_venue = reconciled.activity_venue
  }
  return safeChanges
}

module.exports = {
  reconcileDerivedFields,
  enrichChangesWithDerivedClears
}

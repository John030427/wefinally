function finiteCoordinate(value, min, max) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

function normalizeChosenLocation(location = {}) {
  const name = String(location.name || location.address || '').trim().slice(0, 120)
  const address = String(location.address || '').trim().slice(0, 240)
  return {
    meet_place: name,
    meet_address: address,
    lat: finiteCoordinate(location.latitude, -90, 90),
    lng: finiteCoordinate(location.longitude, -180, 180),
    location_source: 'wechat_choose_location'
  }
}

function hasMapLocation(location = {}) {
  const lat = finiteCoordinate(location.lat, -90, 90)
  const lng = finiteCoordinate(location.lng, -180, 180)
  return lat !== null && lng !== null && Boolean(String(location.meet_place || location.meet_address || '').trim())
}

function shouldCreateBlankReport(options = {}) {
  return String(options.mode || '').toLowerCase() === 'create'
}

module.exports = { normalizeChosenLocation, hasMapLocation, shouldCreateBlankReport }

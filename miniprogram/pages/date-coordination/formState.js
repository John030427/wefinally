function createEmptyDateCoordinationForm() {
  return {
    availability: [], areas: [], activities: [], budget: '', payment_preference: '', duration: '',
    transport_constraints: '', other_requirements: '', share_message: '', contract_version: 2,
    start_time: '', activity_venue: '', meet_point: '', arrival_hint: ''
  }
}

function mergeCoordinationForm(currentForm, application, coordinationChanged) {
  const base = coordinationChanged
    ? createEmptyDateCoordinationForm()
    : Object.assign(createEmptyDateCoordinationForm(), currentForm || {})
  const source = application && typeof application === 'object' ? application : {}
  return Object.assign(base, source, {
    availability: Array.isArray(source.availability) ? source.availability : (base.availability || []),
    areas: Array.isArray(source.areas) ? source.areas : (base.areas || []),
    activities: Array.isArray(source.activities) ? source.activities : (base.activities || [])
  })
}

module.exports = { createEmptyDateCoordinationForm, mergeCoordinationForm }

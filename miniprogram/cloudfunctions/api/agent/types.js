const AGENT_TYPES = Object.freeze({
  PLATFORM_SERVICE: 'platform_service',
  LOVE_ADVISOR: 'love_advisor',
  DATE_COORDINATOR: 'date_coordinator'
})

function isAgentType(value) {
  return Object.values(AGENT_TYPES).includes(value)
}

module.exports = {
  AGENT_TYPES,
  isAgentType
}

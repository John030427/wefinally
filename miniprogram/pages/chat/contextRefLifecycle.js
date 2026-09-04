'use strict'

function activeContextFromMessages(messages) {
  const rows = Array.isArray(messages) ? messages : []
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const message = rows[index] || {}
    if (message.contextResolved) return null
    const patch = message.patchPreview
    if (patch && ['pending_confirmation', 'pending_primary_selection'].includes(String(patch.status || '')) && patch.contextRef) {
      return patch.contextRef
    }
    if (message.contextRef) return message.contextRef
  }
  return null
}

function activeContextAfterResponse(messages, response) {
  if (response && response.contextResolved) return null
  if (response && response.contextRef) return response.contextRef
  return activeContextFromMessages([...(Array.isArray(messages) ? messages : []), ...(response ? [response] : [])])
}

function contextRefPayload(contextRef) {
  return contextRef ? { context_ref: contextRef } : {}
}

module.exports = { activeContextFromMessages, activeContextAfterResponse, contextRefPayload }

'use strict'

const assert = require('assert')
const {
  activeContextFromMessages,
  activeContextAfterResponse,
  contextRefPayload
} = require('../../miniprogram/pages/chat/contextRefLifecycle')

const patchRef = { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
const proposalRef = { type: 'proposal', coordination_id: 716, coordination_version: 3, proposal_id: 99 }
const invitationRef = { type: 'invitation', coordination_id: 716, coordination_version: 3, invitation_version: 7 }

function pending(ref, extra = {}) {
  return Object.assign({ isBot: true, contextRef: ref }, extra)
}

const pendingPatch = pending(patchRef, {
  patchPreview: { status: 'pending_confirmation', contextRef: patchRef }
})
const pendingProposal = pending(proposalRef, { eventCard: { contextRef: proposalRef } })
const pendingInvitation = pending(invitationRef, { eventCard: { contextRef: invitationRef } })

for (const [label, contextRef, completedResponse] of [
  ['patch confirm', patchRef, { contextResolved: true, contextRef: null }],
  ['patch cancel', patchRef, { contextResolved: true, contextRef: null }],
  ['proposal confirm', proposalRef, { contextResolved: true, contextRef: null }],
  ['invitation response', invitationRef, { contextResolved: true, contextRef: null }]
]) {
  const prior = label.startsWith('proposal') ? pendingProposal
    : label.startsWith('invitation') ? pendingInvitation
      : pendingPatch
  assert.deepStrictEqual(activeContextFromMessages([prior]), contextRef, `${label} starts actionable`)
  const cleared = activeContextAfterResponse([prior], completedResponse)
  assert.equal(cleared, null, `${label} clears context after backend completion`)
  const nextMessage = { isBot: false, content: '下一条消息' }
  assert.equal(activeContextAfterResponse([prior, completedResponse, nextMessage], undefined), null, `${label} does not resurrect old context`)
  assert.deepStrictEqual(contextRefPayload(cleared), {}, `${label} next request omits old context_ref`)
}

console.log('PASS context_ref lifecycle clears completed patch/proposal/invitation contexts')

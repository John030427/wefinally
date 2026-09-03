'use strict'

/**
 * Pure helpers for AI chat waiting UX (Mini Program).
 * No third-party deps.
 */

const AGENT_TYPES = {
  PLATFORM_SERVICE: 'platform_service',
  LOVE_ADVISOR: 'love_advisor',
  DATE_COORDINATOR: 'date_coordinator'
}

const WAITING_COPY = {
  [AGENT_TYPES.LOVE_ADVISOR]: {
    primary: '正在思考…',
    rotating: ['正在理解你想聊的事情…', '正在整理更合适的回应…', '马上回来…']
  },
  [AGENT_TYPES.PLATFORM_SERVICE]: {
    primary: '正在为你查询…',
    rotating: ['正在理解你的问题…', '正在核对相关信息…', '正在整理回复…']
  },
  [AGENT_TYPES.DATE_COORDINATOR]: {
    primary: '正在理解你的安排…',
    rotating: ['正在核对当前协调状态…', '正在整理你的时间与地点偏好…', '正在生成可确认的调整建议…']
  }
}

const MIN_LOADER_MS = 400
const ROTATE_MS = 3000
const SLOW_HINT_MS = 8000

function waitingCopyFor(agentType) {
  return WAITING_COPY[agentType] || WAITING_COPY[AGENT_TYPES.PLATFORM_SERVICE]
}

function createPendingAssistantMessage({ pendingMessageId, requestId, agentType, originalUserText, timeText }) {
  const copy = waitingCopyFor(agentType)
  return {
    id: pendingMessageId,
    requestId,
    isBot: true,
    status: 'generating',
    content: '',
    waitingText: copy.primary,
    waitingPrimary: copy.primary,
    waitingRotating: copy.rotating.slice(),
    waitingRotateIndex: 0,
    originalUserText: String(originalUserText || ''),
    timeText: timeText || '',
    patchPreview: null,
    handoff: null,
    errorText: '',
    reveal: false
  }
}

function completeAssistantMessage(pending, { content, patchPreview, partnerInquiryPreview, handoff, timeText }) {
  const text = String(content || '').trim()
  if (!text && !patchPreview) {
    return Object.assign({}, pending, {
      status: 'error',
      errorText: '回复生成失败',
      waitingText: '',
      reveal: false
    })
  }
  return Object.assign({}, pending, {
    status: 'completed',
    content: text,
    waitingText: '',
    patchPreview: patchPreview || null,
    partnerInquiryPreview: partnerInquiryPreview || null,
    handoff: handoff || null,
    timeText: timeText || pending.timeText,
    reveal: true,
    errorText: ''
  })
}

function errorAssistantMessage(pending, errorText) {
  return Object.assign({}, pending, {
    status: 'error',
    content: '',
    waitingText: '',
    errorText: errorText || '回复生成失败',
    reveal: false,
    patchPreview: null
  })
}

function updateMessageById(messages, id, updater) {
  const list = Array.isArray(messages) ? messages.slice() : []
  const idx = list.findIndex((m) => m && m.id === id)
  if (idx < 0) return { messages: list, found: false }
  const next = typeof updater === 'function' ? updater(list[idx]) : Object.assign({}, list[idx], updater)
  list[idx] = next
  return { messages: list, found: true, message: next }
}

function nextRotatedWaitingText(message) {
  const rotating = (message && message.waitingRotating) || []
  if (!rotating.length) return message && message.waitingPrimary
  const idx = ((message.waitingRotateIndex || 0) + 1) % rotating.length
  return {
    waitingRotateIndex: idx,
    waitingText: rotating[idx]
  }
}

function elapsedAtLeast(startedAt, minMs, now) {
  const t = typeof now === 'number' ? now : Date.now()
  return Math.max(0, minMs - (t - startedAt))
}

function extractReplyContent(reply) {
  if (reply == null) return ''
  if (typeof reply === 'string') return String(reply).trim()
  if (typeof reply !== 'object') return String(reply || '').trim()
  return String(
    reply.reply || reply.content || reply.ai_content || reply.answer || reply.message || ''
  ).trim()
}

/**
 * Complete-response gate for one raw API payload.
 * Accepts only: non-empty assistant text OR valid normalized patchPreview.
 * Never invents generic success copy.
 */
function evaluateAssistantReply(reply, normalizePatchPreview) {
  if (reply === undefined) {
    return { ok: false, reason: 'EMPTY_REPLY', errorMessage: '回复生成失败' }
  }
  const content = extractReplyContent(reply)
  const patchPreview = typeof normalizePatchPreview === 'function'
    ? normalizePatchPreview(reply, reply && reply.requires_confirmation)
    : null
  const rawPatch = reply && typeof reply === 'object'
    ? (reply.patch_preview || reply.patchPreview)
    : null
  if (rawPatch && !patchPreview) {
    return {
      ok: false,
      reason: 'MALFORMED_PATCH',
      errorMessage: '调整建议尚未就绪，请稍后重试',
      content: '',
      patchPreview: null,
      handoff: null,
      reply
    }
  }
  if (!content && !patchPreview) {
    return {
      ok: false,
      reason: 'EMPTY_REPLY',
      errorMessage: '回复生成失败',
      content: '',
      patchPreview: null,
      handoff: null,
      reply
    }
  }
  const handoff = reply && typeof reply === 'object' && reply.handoff && reply.handoff.available
    ? reply.handoff
    : null
  return {
    ok: true,
    reason: content ? 'VALID_TEXT' : 'VALID_PATCH_ONLY',
    content,
    patchPreview: patchPreview || null,
    handoff,
    reply
  }
}

/**
 * Resolve primary (+ optional platform legacy) into a completed payload or throw.
 * Empty/malformed primary on platform_service triggers legacy without intermediate UI.
 */
function resolveCompleteAssistantReply({
  agentType,
  primaryReply,
  primaryError,
  legacyReply,
  legacyError,
  normalizePatchPreview
}) {
  const isPlatform = agentType === AGENT_TYPES.PLATFORM_SERVICE

  if (!primaryError) {
    const primaryEval = evaluateAssistantReply(primaryReply, normalizePatchPreview)
    if (primaryEval.ok) return primaryEval
    if (!isPlatform) {
      const err = new Error(primaryEval.errorMessage || '回复生成失败')
      err.gateReason = primaryEval.reason
      throw err
    }
  } else if (!isPlatform) {
    throw primaryError
  }

  if (legacyError) {
    throw primaryError || legacyError
  }
  if (legacyReply === undefined && isPlatform && primaryError) {
    throw primaryError
  }

  const legacyEval = evaluateAssistantReply(
    legacyReply === undefined ? null : legacyReply,
    normalizePatchPreview
  )
  if (!legacyEval.ok) {
    const err = new Error(legacyEval.errorMessage || '回复生成失败')
    err.gateReason = legacyEval.reason
    throw err
  }
  return legacyEval
}

module.exports = {
  AGENT_TYPES,
  WAITING_COPY,
  MIN_LOADER_MS,
  ROTATE_MS,
  SLOW_HINT_MS,
  waitingCopyFor,
  createPendingAssistantMessage,
  completeAssistantMessage,
  errorAssistantMessage,
  updateMessageById,
  nextRotatedWaitingText,
  elapsedAtLeast,
  extractReplyContent,
  evaluateAssistantReply,
  resolveCompleteAssistantReply
}

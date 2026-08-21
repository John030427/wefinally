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

function completeAssistantMessage(pending, { content, patchPreview, handoff, timeText }) {
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
    content: text || '已收到您的咨询',
    waitingText: '',
    patchPreview: patchPreview || null,
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
  elapsedAtLeast
}

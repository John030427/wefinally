'use strict'

function responseBody(response) {
  if (response && response.data && typeof response.data === 'object') return response.data
  return response && typeof response === 'object' ? response : {}
}

function buildPatchSuccessCopy(response) {
  const body = responseBody(response)
  const patch = body.patch && typeof body.patch === 'object' ? body.patch : {}
  const applied = body.applied === true || body.status === 'applied' || patch.status === 'applied'
  const projectionPending = body.projection_pending === true
    || body.projectionPending === true
    || body.event_status === 'pending'
    || body.notification_status === 'pending'
  const skipped = body.skipped === true
    || body.notification_status === 'skipped'
    || body.partner_notified === false
  const partnerNotified = body.partner_notified === true || body.partnerNotified === true

  if (!applied) return '请求已收到，请以当前协调状态为准。'
  if (projectionPending) return partnerNotified
    ? '已更新，对方通知正在完成同步，请稍后查看最新协调状态。'
    : '已更新，相关通知正在完成同步，请稍后查看最新协调状态。'
  if (skipped) return '已更新；对方暂未收到站内通知，请查看最新协调状态。'
  if (partnerNotified) return '已更新，对方已收到安全摘要。'
  return '已更新，请查看最新协调状态。'
}

module.exports = { buildPatchSuccessCopy }

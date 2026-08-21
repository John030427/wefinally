'use strict'

const STATUS_LABEL = {
  collecting_preferences: { label: '收集双方偏好', next: '等待双方填写安排' },
  collecting_initiator: { label: '等待发起方提交', next: '等待发起方完成申请' },
  inviting_partner: { label: '等待对方回应', next: '无需操作，系统将通知对方' },
  computing_overlap: { label: '正在协调', next: '等待系统生成可确认方案' },
  pending_primary_selection: { label: '等待用户选择建议安排', next: '可提醒用户选择时间/地点' },
  pending_confirmation: { label: '等待用户确认修改', next: '可提醒用户确认或暂不修改' },
  waiting_confirmations: { label: '等待双方确认', next: '无需操作，系统将通知双方' },
  awaiting_a: { label: '等待 A 确认', next: '可提醒 A 确认方案' },
  awaiting_b: { label: '等待 B 确认', next: '可提醒 B 确认方案' },
  arranged: { label: '双方已确认', next: '跟进见面安排' },
  invitation_declined: { label: '邀请已婉拒', next: '可结束或重新发起' },
  expired: { label: '已过期', next: '如需继续请重新发起协调' },
  failed: { label: '协调异常', next: '建议人工接管' },
  manual_handoff: { label: '已转人工', next: '由人工客服继续处理' }
}

function buildCoordinationOperatorView(coordination, options) {
  const opts = options || {}
  const confirmations = Array.isArray(opts.confirmations) ? opts.confirmations : []
  const version = Number(coordination && coordination.coordination_version || 1)
  const status = String(coordination && coordination.status || '')
  const aId = Number(coordination && coordination.user_a_id || 0)
  const bId = Number(coordination && coordination.user_b_id || 0)
  const aRef = opts.a_ref || (aId ? `WF-U-${String(aId).padStart(6, '0')}` : 'A')
  const bRef = opts.b_ref || (bId ? `WF-U-${String(bId).padStart(6, '0')}` : 'B')
  const copy = STATUS_LABEL[status] || { label: status || '未知状态', next: '请查看详情或人工跟进' }

  const sameVersion = confirmations.filter((row) => Number(row.coordination_version || version) === version)
  const confirmed = new Set(
    sameVersion
      .filter((row) => String(row.decision || '') === 'confirm')
      .map((row) => Number(row.user_id))
  )
  const olderConfirms = confirmations.some((row) => Number(row.coordination_version || 0) > 0
    && Number(row.coordination_version) < version
    && String(row.decision || '') === 'confirm')

  const aConfirmed = aId ? confirmed.has(aId) : false
  const bConfirmed = bId ? confirmed.has(bId) : false
  const both = aConfirmed && bConfirmed

  let display_status = copy.label
  let next_action = copy.next
  let stale_notice = ''

  if (olderConfirms || opts.stale_version === true) {
    stale_notice = '方案已经更新，旧确认已失效，需要双方重新确认'
  }

  if (status === 'arranged' || both) {
    display_status = '双方已确认'
    next_action = '跟进见面安排'
  } else if (aConfirmed && !bConfirmed) {
    display_status = '等待 B 确认'
    next_action = '无需操作，系统正在等待 B'
  } else if (!aConfirmed && bConfirmed) {
    display_status = '等待 A 确认'
    next_action = '无需操作，系统正在等待 A'
  } else if (status === 'waiting_confirmations' || status === 'pending_confirmation') {
    display_status = '等待双方确认'
    next_action = '无需操作，系统将通知双方'
  }

  return {
    coordination_ref: opts.coordination_ref || (coordination && coordination.id ? `WF-D-${coordination.id}` : '-'),
    proposal_version_text: `第 ${version} 版`,
    coordination_version: version,
    status,
    display_status,
    next_action,
    stale_notice,
    side_a: {
      label: 'A',
      user_ref: aRef,
      confirmed: aConfirmed,
      status_text: aConfirmed ? '已确认' : '等待确认'
    },
    side_b: {
      label: 'B',
      user_ref: bRef,
      confirmed: bConfirmed,
      status_text: bConfirmed ? '已确认' : '等待确认'
    },
    both_confirmed: both
  }
}

module.exports = { buildCoordinationOperatorView }

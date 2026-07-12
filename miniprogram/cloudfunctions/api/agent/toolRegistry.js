const TOOL_NAMES = Object.freeze({
  MEMBER_REVIEW: 'get_member_review_status',
  VIP: 'get_vip_status',
  MATCH: 'get_match_status',
  DATE_COORDINATION: 'get_date_coordination_status',
  PROFILE: 'get_user_visible_profile',
  HUMAN_TICKET: 'create_human_service_ticket'
})

const TOOL_WHITELIST = Object.freeze(Object.values(TOOL_NAMES))

function inferTool(message) {
  const text = String(message || '')
  if (/人工|投诉|支付争议|退款|隐私投诉/.test(text)) return TOOL_NAMES.HUMAN_TICKET
  if (/会员.*审核|审核.*状态|申请.*审核/.test(text)) return TOOL_NAMES.MEMBER_REVIEW
  if (/VIP|会员.*到期|会员.*有效|开通会员/i.test(text)) return TOOL_NAMES.VIP
  if (/约会.*状态|协调.*状态|奔现.*进度/.test(text)) return TOOL_NAMES.DATE_COORDINATION
  if (/匹配.*状态|匹配.*记录|什么时候匹配/.test(text)) return TOOL_NAMES.MATCH
  if (/我的资料|个人资料|资料状态/.test(text)) return TOOL_NAMES.PROFILE
  return ''
}

function memberStatusText(status) {
  const labels = {
    pending_profile: '资料尚未完善',
    pending_review: '正在等待审核',
    need_more_info: '需要补充资料',
    approved: '审核通过',
    rejected: '审核未通过',
    disabled: '会员资格已停用'
  }
  return labels[status] || '暂时无法确认'
}

async function executeTool(name, user, deps) {
  if (!TOOL_WHITELIST.includes(name)) throw new Error('工具不在允许列表中')
  if (name === TOOL_NAMES.MEMBER_REVIEW) {
    const status = String(user.member_status || '')
    return {
      data: { member_status: status },
      reply: `你的会员申请当前为：${memberStatusText(status)}。`
    }
  }
  if (name === TOOL_NAMES.VIP) {
    const active = Number(user.free_member || 0) === 1 || (Number(user.is_vip || 0) === 1 && (!user.vip_expire_time || new Date(user.vip_expire_time) > deps.now()))
    return {
      data: { active, expire_date: user.vip_expire_time ? String(user.vip_expire_time).slice(0, 10) : '' },
      reply: active
        ? `你的VIP当前有效${user.vip_expire_time ? `，到期时间为${String(user.vip_expire_time).slice(0, 10)}` : ''}。`
        : '你的VIP当前未生效或已经到期。'
    }
  }
  if (name === TOOL_NAMES.MATCH) {
    const rows = await deps.list('user_match_log', { user_id: user.id }, 100)
    rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    const latest = rows[0]
    return {
      data: latest ? { has_match: true, status: latest.status || 'matched', match_date: latest.match_date || null } : { has_match: false },
      reply: latest ? '你已有匹配记录，可以在“记录”中查看最新匹配详情。' : '目前还没有匹配记录，请等待系统匹配。'
    }
  }
  if (name === TOOL_NAMES.DATE_COORDINATION) {
    const rows = await deps.list('date_coordination', {}, 100)
    const latest = rows
      .filter((row) => [Number(row.user_a_id), Number(row.user_b_id)].includes(Number(user.id)))
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
    return {
      data: latest ? { has_coordination: true, status: latest.status || '' } : { has_coordination: false },
      reply: latest ? `你的第一次约会协调当前状态为：${latest.status || '处理中'}。` : '目前没有进行中的第一次约会协调。'
    }
  }
  if (name === TOOL_NAMES.PROFILE) {
    return {
      data: {
        member_status: user.member_status || '',
        city: user.city || '',
        education: user.education || '',
        profile_complete: Boolean(user.birth_year && user.city && user.education)
      },
      reply: user.birth_year && user.city && user.education ? '你的基础资料已经完善。' : '你的基础资料还有未完善内容，请前往个人资料补充。'
    }
  }
  return { data: {}, reply: '' }
}

module.exports = {
  TOOL_NAMES,
  TOOL_WHITELIST,
  inferTool,
  executeTool
}

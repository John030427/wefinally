const { first, list } = require('../lib/db')
const { referralInput } = require('../lib/partnerReferralPolicy')
const { demoFlags } = require('../lib/flags')

const defaultCircles = [
  { id: 1, name: '公务员', circle_name: '公务员', plate_name: '体制内', status: 1 },
  { id: 2, name: '在编教师', circle_name: '在编教师', plate_name: '教育', status: 1 },
  { id: 3, name: '医护人员', circle_name: '医护人员', plate_name: '医疗', status: 1 },
  { id: 4, name: '金融从业', circle_name: '金融从业', plate_name: '金融', status: 1 },
  { id: 5, name: '互联网技术', circle_name: '互联网技术', plate_name: '互联网', status: 1 },
  { id: 6, name: '法律从业', circle_name: '法律从业', plate_name: '专业服务', status: 1 },
  { id: 7, name: '国企职员', circle_name: '国企职员', plate_name: '国企央企', status: 1 },
  { id: 8, name: '创业/管理', circle_name: '创业/管理', plate_name: '经营管理', status: 1 }
]

async function circles() {
  const rows = await list('occupation_circle', { status: 1 }, 100)
  const source = rows.length ? rows : defaultCircles
  const result = source.map((row) => ({
    id: row.id,
    name: row.name || row.circle_name,
    circle_name: row.circle_name || row.name,
    plate_name: row.plate_name || '其他'
  }))
  if (!result.some((row) => Number(row.id) === 0)) {
    result.push({ id: 0, name: '其他', circle_name: '其他', plate_name: '其他' })
  }
  return result
}

async function promoteCode(data) {
  const code = String(data.code || '').trim()
  if (!code) throw new Error('请填写推广码')
  let referral
  try {
    referral = referralInput(code)
  } catch (err) {
    return { valid: false, message: '推广码无效或合伙人未激活' }
  }
  const partner = referral.partnerId
    ? await first('partner', { id: referral.partnerId, status: 1 })
    : await first('partner', { promote_code: referral.code, status: 1 })
  if (!partner) {
    return { valid: false, message: '推广码无效或合伙人未激活' }
  }
  return {
    valid: true,
    message: '已识别合伙人推广码',
    partner_id: partner.id,
    circle_id: partner.circle_id
  }
}

function agreements() {
  return {
    user_service: {
      title: '用户服务协议',
      content: 'WeFinally 提供严肃婚恋匹配服务。用户需如实填写资料，遵守平台规则。'
    },
    privacy: {
      title: '隐私政策',
      content: '平台仅在注册、匹配、见面安全确认等必要场景处理个人信息。'
    },
    data_auth: {
      title: '个人信息授权协议',
      content: '你授权平台基于所填资料进行匹配、审核、安全留证和客服对接。'
    }
  }
}

function safetyConfig() {
  return {
    sosPhone: '110',
    guangdong110: {
      enabled: true,
      appId: 'wxf654be7f2931bfcb',
      path: ''
    },
    prompt: '见面请选白天公共场所，提前告知亲友，保管财物，勿轻信任何转账要求。'
  }
}

async function config() {
  return {
    vip: { price: 188, days: 30 },
    matchSchedule: {
      days: ['周三', '周五'],
      time: '00:00',
      desc: '每周三、周五 0:00 系统自动空投 1 位匹配对象，无手动刷新'
    },
    safety: safetyConfig(),
    demo: await demoFlags(),
    api_schema_version: 2,
    date_coordination_contract_version: 5,
    capabilities: {
      notifications: true,
      date_coordinator_pre_accept_chat: true,
      bilateral_coordination: true,
      first_date_invitation: true,
      invitation_direct_accept: true,
      invitation_coordinate: true,
      invitation_primary_proposal: true,
      direct_accept_cas: true,
      neutral_payment_proposal: true,
      invitation_atomic_transitions: true,
      invitation_response_version_cas: true,
      pre_accept_patch_cas: true
    }
  }
}

async function marryStat() {
  const row = await first('system_stat', {})
  return {
    marry_success_count: row ? Number(row.marry_success_count || 0) : 0
  }
}

function rules() {
  return {
    title: 'WeFinally 平台规则',
    content: [
      '1. 禁止上传图片视频，无头像相册，从根源杜绝照骗',
      '2. 用户间无私聊、无社交、无动态，仅可联系平台 AI 客服',
      '3. AI 匹配每周三、周五 0:00 各 1 次',
      '4. 择偶配置 7 天仅可修改 1 次',
      '5. VIP 188 元/30 天，无自动续费',
      '6. 违规永久封号不退费',
      '7. 结婚可自主报备注销',
      '8. 仅官方一对一私密奔现'
    ].join('\n')
  }
}

function health() {
  return { status: 'ok', time: new Date().toISOString() }
}

module.exports = {
  circles,
  promoteCode,
  agreements,
  safetyConfig,
  config,
  marryStat,
  rules,
  health
}

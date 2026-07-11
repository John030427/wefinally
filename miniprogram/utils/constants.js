const STORAGE_KEYS = {
  TOKEN: 'wf_token',
  USER_INFO: 'wf_user_info',
  OPENID: 'wf_openid',
  AGREEMENT_ACCEPTED: 'wf_agreement_accepted',
  MATCH_SETTING_COOLDOWN: 'wf_match_setting_cooldown',
  PROMOTE_CODE: 'wf_promote_code'
}

const API_PATHS = {
  WX_LOGIN: '/api/auth/wx-login',
  REGISTER: '/api/user/register',
  USER_PROFILE: '/api/user/profile',
  USER_PROFILE_UPDATE: '/api/user/profile',
  MATCH_SETTING: '/api/match/setting',
  MATCH_SETTING_COOLDOWN: '/api/match/setting/cooldown',
  MATCH_START: '/api/match/start',
  MATCH_LIST: '/api/match/list',
  MATCH_DETAIL: '/api/match/detail',
  MATCH_HANDOFF: '/api/match/handoff',
  MATCH_REPORT: '/api/match/report',
  MATCH_LATEST: '/api/match/latest',
  VIP_INFO: '/api/vip/info',
  VIP_PURCHASE: '/api/vip/purchase',
  ORDER_STATUS: '/api/order/status',
  MARRY_STAT: '/api/platform/marry-stat',
  MARRY_REPORT: '/api/user/marry-report',
  CHAT_SEND: '/api/chat/send',
  CHAT_HISTORY: '/api/chat/history',
  ACCOUNT_CANCEL: '/api/user/cancel',
  RULES: '/api/platform/rules',
  CIRCLES: '/api/common/circles',
  AGREEMENTS: '/api/common/agreements',
  COMMON_CONFIG: '/api/common/config',
  SAFETY_CONFIG: '/api/common/safety-config',
  MEET_SOS: '/api/meet/sos',
  PROMOTE_CODE_CHECK: '/api/common/promote-code',
  DIVORCE_REVIEW: '/api/user/divorce-review',
  DIVORCE_REVIEW_STATUS: '/api/user/divorce-review/status',
  MEMBER_APPLICATION: '/api/member/application',
  MEMBER_APPLICATION_SUBMIT: '/api/member/application/submit'
}

const GENDER_OPTIONS = ['男', '女']
const EDUCATION_OPTIONS = ['高中及以下', '大专', '本科', '硕士', '博士']
const INCOME_OPTIONS = ['5万以下', '5-10万', '10-20万', '20-50万', '50万以上']
const MARRIAGE_OPTIONS = ['未婚', '离异']
const BABY_PLAN_OPTIONS = ['1年内', '2-3年内', '3-5年内', '5年后', '丁克', '待定']
const HOUSE_CAR_OPTIONS = ['无', '有车', '有房', '有房有车']
const CITY_OPTIONS = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉',
  '南京', '西安', '苏州', '天津', '长沙', '郑州', '青岛', '厦门'
]
const AGE_RANGE_OPTIONS = ['20-25岁', '25-30岁', '30-35岁', '35-40岁', '40-45岁', '45岁以上']
const HEIGHT_RANGE_OPTIONS = ['140-150cm', '150-160cm', '160-170cm', '170-180cm', '180-190cm', '190cm以上']
const LIKE_MARRY_OPTIONS = ['仅看未婚', '可接受离异']
const LIKE_BABY_PLAN_OPTIONS = ['1年内', '2-3年内', '3-5年内', '5年后', '丁克', '待定', '不限']
const PSYCH_PROFILE_OPTIONS = {
  marriage_pace: ['稳定推进', '先磨合再定', '顺其自然'],
  conflict_style: ['及时沟通', '冷静后沟通', '需要空间'],
  security_space: ['高陪伴感', '亲密也独立', '重视个人空间'],
  family_boundary: ['大家庭融合', '小家庭优先', '边界清晰'],
  money_view: ['共同规划', '相对独立', '稳健储蓄'],
  career_family: ['事业优先', '家庭优先', '动态平衡']
}

const COOLDOWN_DAYS = 7
const VIP_PRICE = 188
const VIP_DAYS = 30
const TEXT_MIN_LEN = 20
const TEXT_MAX_LEN = 300
const SUBSCRIBE_TMPL_IDS = []
const GUANGDONG_110_DEFAULT = {
  enabled: true,
  appId: 'wxf654be7f2931bfcb',
  path: ''
}

const AGREEMENT_ITEMS = [
  { key: 'userAgreement', label: '我已阅读并同意《用户服务协议》', type: 'user_service' },
  { key: 'privacyPolicy', label: '我已阅读并同意《隐私政策》', type: 'privacy' },
  { key: 'dataAuth', label: '我已阅读并同意《个人信息授权协议》', type: 'data_auth' }
]

const MATCH_SCHEDULE = {
  days: ['周三', '周五'],
  time: '00:00',
  desc: '每周三、周五 0:00 系统自动空投 1 位匹配对象，无手动刷新'
}

module.exports = {
  STORAGE_KEYS,
  API_PATHS,
  GENDER_OPTIONS,
  EDUCATION_OPTIONS,
  INCOME_OPTIONS,
  MARRIAGE_OPTIONS,
  BABY_PLAN_OPTIONS,
  HOUSE_CAR_OPTIONS,
  CITY_OPTIONS,
  AGE_RANGE_OPTIONS,
  HEIGHT_RANGE_OPTIONS,
  LIKE_MARRY_OPTIONS,
  LIKE_BABY_PLAN_OPTIONS,
  PSYCH_PROFILE_OPTIONS,
  COOLDOWN_DAYS,
  VIP_PRICE,
  VIP_DAYS,
  TEXT_MIN_LEN,
  TEXT_MAX_LEN,
  SUBSCRIBE_TMPL_IDS,
  GUANGDONG_110_DEFAULT,
  AGREEMENT_ITEMS,
  MATCH_SCHEDULE
}

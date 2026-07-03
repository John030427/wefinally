const { COOLDOWN_DAYS } = require('./constants')

function formatDate(date, fmt = 'YYYY-MM-DD HH:mm:ss') {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const map = {
    YYYY: d.getFullYear(),
    MM: String(d.getMonth() + 1).padStart(2, '0'),
    DD: String(d.getDate()).padStart(2, '0'),
    HH: String(d.getHours()).padStart(2, '0'),
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0')
  }
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k])
}

function formatDateOnly(value) {
  if (!value) return ''
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const dateText = formatDate(value, 'YYYY-MM-DD')
  if (dateText) return dateText
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function getCooldownRemain(cooldownEndTime) {
  const end = Number(cooldownEndTime)
  if (!end || isNaN(end)) {
    return { active: false, days: 0, hours: 0, minutes: 0, seconds: 0, text: '', remainMs: 0 }
  }
  const remainMs = end - Date.now()
  if (remainMs <= 0) {
    return { active: false, days: 0, hours: 0, minutes: 0, seconds: 0, text: '', remainMs: 0 }
  }
  const totalSeconds = Math.floor(remainMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const text = `${days}天${String(hours).padStart(2, '0')}时${String(minutes).padStart(2, '0')}分${String(seconds).padStart(2, '0')}秒`
  return { active: true, days, hours, minutes, seconds, text, remainMs }
}

function setCooldownEnd() {
  return Date.now() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000
}

/** 80%+ 绿色，50-79% 灰色，50%以下 橙色 */
function getCompatibilityColor(score) {
  const s = Number(score) || 0
  if (s >= 80) return 'progress-green'
  if (s >= 50) return 'progress-gray'
  return 'progress-orange'
}

function getCompatibilityLevel(score) {
  const s = Number(score) || 0
  if (s >= 80) return '高度契合'
  if (s >= 50) return '中等契合'
  return '契合度偏低'
}

function getCompatibilityDisplayText(score) {
  const s = Number(score) || 0
  if (s >= 90) return '三观高度契合'
  if (s >= 75) return '三观较高契合'
  if (s >= 60) return '三观值得了解'
  return '三观存在差异'
}

function getTotalMatchDisplayText(score) {
  const s = Number(score) || 0
  if (s >= 105) return '综合高度契合'
  if (s >= 95) return '综合较高契合'
  if (s >= 90) return '综合值得了解'
  return '综合谨慎了解'
}

function getCompatibilityTagClass(score) {
  const s = Number(score) || 0
  if (s >= 80) return 'tag-green'
  if (s >= 50) return 'tag-gray'
  return 'tag-orange'
}

function parseScenePromoteCode(scene) {
  if (!scene) return ''
  const decoded = decodeURIComponent(String(scene))
  const match = decoded.match(/promote[_=]?(\w+)/i)
  if (match) return match[1]
  if (/^[A-Za-z0-9_]{4,50}$/.test(decoded) && !/^\d+$/.test(decoded)) return decoded
  return ''
}

function parsePromoteCode(scene, query) {
  if (query && query.promote_code) return query.promote_code
  if (query && query.promoteCode) return query.promoteCode
  if (query && query.scene) {
    const querySceneCode = parseScenePromoteCode(query.scene)
    if (querySceneCode) return querySceneCode
  }
  const sceneCode = parseScenePromoteCode(scene)
  if (sceneCode) return sceneCode
  return ''
}

function validateTextLength(text, min, max) {
  const len = (text || '').trim().length
  return len >= min && len <= max
}

function calcAge(birthYear) {
  if (!birthYear) return '--'
  const y = Number(String(birthYear).replace(/\D/g, ''))
  if (!y) return '--'
  return new Date().getFullYear() - y
}

function genderText(g) {
  if (g === 1 || g === '1' || g === '男') return '男'
  if (g === 2 || g === '2' || g === '女') return '女'
  return g || '--'
}

/** 计算下一次匹配时间（周三/周五 0:00） */
function getNextMatchTime() {
  const now = new Date()
  const candidates = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    d.setHours(0, 0, 0, 0)
    const day = d.getDay()
    if (day === 3 || day === 5) {
      if (d.getTime() > now.getTime() || (i === 0 && now.getHours() === 0 && now.getMinutes() === 0)) {
        candidates.push(d)
      } else if (i > 0) {
        candidates.push(d)
      }
    }
  }
  if (candidates.length === 0) return null
  const next = candidates[0]
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return {
    date: formatDate(next, 'YYYY-MM-DD'),
    dayName: dayNames[next.getDay()],
    text: `${formatDate(next, 'MM月DD日')} ${dayNames[next.getDay()]} 00:00`
  }
}

module.exports = {
  formatDate,
  formatDateOnly,
  getCooldownRemain,
  setCooldownEnd,
  getCompatibilityColor,
  getCompatibilityLevel,
  getCompatibilityDisplayText,
  getTotalMatchDisplayText,
  getCompatibilityTagClass,
  parsePromoteCode,
  validateTextLength,
  calcAge,
  genderText,
  getNextMatchTime
}

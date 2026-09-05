function calcAge(birthYear) {
  const y = Number(birthYear)
  if (!y) return 0
  return new Date().getFullYear() - y
}

function isVipActive(user, nowValue = new Date()) {
  if (!user) return false
  if (Number(user.free_member || 0) === 1) return true
  if (Number(user.is_vip || 0) !== 1) return false
  if (!user.vip_expire_time) return false
  return new Date(user.vip_expire_time).getTime() > new Date(nowValue).getTime()
}

function genderText(gender) {
  return Number(gender) === 1 ? '男' : '女'
}

function ageBand(birthYear) {
  const age = calcAge(birthYear)
  if (!age) return '--'
  if (age < 30) return '25-30岁'
  if (age < 35) return '30-35岁'
  if (age < 40) return '35-40岁'
  return '40岁以上'
}

function dateOnly(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

module.exports = {
  calcAge,
  isVipActive,
  genderText,
  ageBand,
  dateOnly
}

const RISK = Object.freeze({
  SAFE: 'safe',
  INJECTION: 'injection',
  PRIVACY: 'privacy',
  HIGH_RISK: 'high_risk',
  IRRELEVANT: 'irrelevant'
})

const RISK_RULES = [
  [RISK.INJECTION, /ignore (all )?(previous|prior) instructions|system prompt|reveal.*prompt|忽略(之前|前面).*(指令|要求)|提示词|越狱/i],
  [RISK.PRIVACY, /phone number|home address|openid|身份证|手机号|电话号码|住址|家庭地址|精确地址|联系方式/i],
  [RISK.HIGH_RISK, /hurt myself|suicide|self-harm|kill myself|伤害自己|自杀|自残|伤害他人|杀人|medical diagnosis|法律意见|诊断|抑郁症|暴力|威胁|骚扰|跟踪|尾随|未成年/i],
  [RISK.IRRELEVANT, /write malware|steal passwords|ransomware|博彩|赌博|色情|恶意软件|窃取.*密码|攻击网站/i]
]

function classifyRisk(input) {
  const text = String(input || '').trim()
  for (let index = 0; index < RISK_RULES.length; index += 1) {
    const rule = RISK_RULES[index]
    if (rule[1].test(text)) return { category: rule[0], allowed: false }
  }
  return { category: RISK.SAFE, allowed: true }
}

function redactText(value) {
  return String(value || '')
    .replace(/\b1[3-9]\d{9}\b/g, '[已隐藏手机号]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[已隐藏邮箱]')
    .replace(/\b(?:openid|open_id)\s*[:：]?\s*[A-Za-z0-9_-]{6,}\b/gi, '[已隐藏标识]')
    .replace(/(?:身份证|证件号)\s*[:：]?\s*\d{15,18}[0-9Xx]?/g, '[已隐藏证件]')
    .replace(/(?:用户|内部)?\s*(?:id|ID)\s*[:：]?\s*[A-Za-z0-9_-]{4,}/g, '[已隐藏标识]')
    .replace(/(?:地址|住址|定位)\s*[:：]\s*[^，。；;\n]{2,}/g, '[已隐藏地址]')
}

function sanitizeOutput(value) {
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.map(sanitizeOutput)
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((result, key) => {
      result[key] = sanitizeOutput(value[key])
      return result
    }, {})
  }
  return value
}

module.exports = {
  RISK,
  classifyRisk,
  sanitizeOutput
}

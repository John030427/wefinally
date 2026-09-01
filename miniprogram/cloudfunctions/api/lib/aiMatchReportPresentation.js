/**
 * Normalize AI match report into scannable bilateral sections for UI.
 * Never includes partner raw preference / raw chat text.
 */

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (value == null || value === '') return []
  return [value]
}

function itemText(item) {
  if (item == null) return ''
  if (typeof item === 'string') return item
  if (item.title && item.detail) return `${item.title}：${item.detail}`
  return String(item.title || item.detail || item.value || item.text || '')
}

function redactPrivate(text) {
  return String(text || '')
    .replace(/(?:对方说|A说|B说|原话)[：:].+/g, '[已隐藏私人表述]')
    .replace(/\b1[3-9]\d{9}\b/g, '[已脱敏]')
}

function presentAiMatchReport(report = {}, options = {}) {
  const strengths = asList(report.strengths).map(itemText).map(redactPrivate).filter(Boolean)
  const differences = asList(report.differences).map(itemText).map(redactPrivate).filter(Boolean)
  const communication = asList(report.communication_suggestions).map(itemText).map(redactPrivate).filter(Boolean)
  const firstDate = asList(report.first_date_suggestions).map(itemText).map(redactPrivate).filter(Boolean)
  const summary = redactPrivate(report.summary || '')

  const whyLines = strengths.slice(0, 3)
  if (!whyLines.length && summary) whyLines.push(summary.slice(0, 80))

  const forYou = asList(report.for_you || report.a_to_b_reasons || options.forYou)
    .map(itemText).map(redactPrivate).filter(Boolean)
  const forThem = asList(report.for_them || report.b_to_a_reasons || options.forThem)
    .map(itemText).map(redactPrivate).filter(Boolean)

  if (!forYou.length && strengths.length) {
    forYou.push(...strengths.slice(0, 2).map((line) => `对方与你在「${line.split('：')[0]}」上较契合`))
  }
  if (!forThem.length && strengths.length) {
    forThem.push(...strengths.slice(0, 2).map((line) => `你的背景可能回应对方对「${line.split('：')[0]}」的期待`))
  }

  return {
    disclaimer: 'AI 生成内容，仅供参考',
    sections: [
      { key: 'why', index: '01', title: '为什么值得了解', items: whyLines },
      {
        key: 'bilateral',
        index: '02',
        title: '你们彼此满足了什么',
        groups: [
          { label: '对你而言', items: forYou.slice(0, 3) },
          { label: '对对方而言', items: forThem.slice(0, 3) }
        ]
      },
      { key: 'fit', index: '03', title: '契合点', items: strengths.slice(0, 4) },
      { key: 'confirm', index: '04', title: '需要进一步确认', items: differences.slice(0, 4) },
      { key: 'talk', index: '05', title: '第一次沟通建议', items: (communication.length ? communication : firstDate).slice(0, 3) }
    ].filter((section) => {
      if (section.groups) return section.groups.some((group) => group.items && group.items.length)
      return section.items && section.items.length
    }),
    summary
  }
}

module.exports = {
  presentAiMatchReport,
  redactPrivate
}

const REPORT_ITEMS = [
  { key: 'baby', label: '婚育节奏', max: 30, note: '双方婚育计划是否同频' },
  { key: 'view', label: '三观文本', max: 25, note: '双方三观自述与期待的语义契合' },
  { key: 'psych', label: '关系偏好', max: 18, note: '沟通、安全感、边界、金钱观等偏好' },
  { key: 'appearance', label: '外貌偏好', max: 10, note: '外貌描述与期待的契合度，不是颜值评分' },
  { key: 'age', label: '年龄区间', max: 15, note: '是否落在对方年龄偏好内' },
  { key: 'height', label: '身高区间', max: 12, note: '是否落在对方身高偏好内' },
  { key: 'education', label: '学历偏好', max: 8, note: '学历是否达到对方偏好' },
  { key: 'circle', label: '职业圈层', max: 6, note: '是否命中对方偏好圈层' },
  { key: 'city', label: '城市距离', max: 4, note: '同城更利于见面和落地' }
]

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatScore(value) {
  const n = num(value)
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

function dimensionScore(side, key) {
  if (side && side[key] !== undefined && side[key] !== null) return num(side[key])
  const dim = side && side.dimensions && side.dimensions[key]
  if (!dim) return 0
  if (dim.raw_score !== undefined && dim.raw_score !== null) return num(dim.raw_score)
  return num(dim.score)
}

function hasDimensionSource(side, key) {
  return Boolean(
    side
    && (
      (side[key] !== undefined && side[key] !== null)
      || (side.dimensions && side.dimensions[key])
    )
  )
}

function reportLevel(percent) {
  if (percent >= 90) return '优势明显'
  if (percent >= 70) return '比较匹配'
  if (percent >= 45) return '需要磨合'
  return '差异较大'
}

function explainText(item, percent) {
  if (item.key === 'baby') {
    return percent >= 70
      ? '双方婚育计划接近，后续推进关系时更容易对齐时间表。'
      : '双方婚育计划存在差异，建议提前聊清楚要孩子、时间表和可接受弹性。'
  }
  if (item.key === 'view') {
    return percent >= 70
      ? '双方三观表达和对另一半的期待有较多重合，沟通时更容易接住彼此重点。'
      : '双方三观文本里的重点不完全一样，建议先聊生活选择、家庭期待和长期规划。'
  }
  if (item.key === 'psych') {
    return percent >= 70
      ? '沟通方式、安全感、边界和金钱观等关系偏好较接近。'
      : '关系偏好需要更多磨合，建议提前聊冲突处理、边界感和家庭分工。'
  }
  if (item.key === 'appearance') {
    return percent >= 70
      ? '外貌描述和期待有较多重合，会计入匹配度，但这里不是颜值评分。'
      : '外貌描述和期待重合不多，这一项只反映偏好契合，不代表对外貌本身的评价。'
  }
  if (item.key === 'age') {
    return percent >= 70
      ? '年龄阶段落在偏好范围内，现实节奏更容易对齐。'
      : '年龄阶段和偏好有距离，需要确认生活阶段和结婚节奏是否一致。'
  }
  if (item.key === 'height') {
    return percent >= 70
      ? '身高区间符合偏好，属于基础条件上的加分项。'
      : '身高区间与偏好存在差异，建议把重点放回现实相处和长期匹配。'
  }
  if (item.key === 'education') {
    return percent >= 70
      ? '学历达到偏好，沟通语境和成长路径更容易接近。'
      : '学历未完全达到偏好，建议看真实沟通质量、稳定性和长期规划。'
  }
  if (item.key === 'circle') {
    return percent >= 70
      ? '职业圈层或工作节奏更容易互相理解。'
      : '职业圈层不同，建议提前聊工作节奏、压力来源和休息安排。'
  }
  return percent >= 70
    ? '生活半径较接近，见面和关系落地成本更低。'
    : '城市距离可能增加见面成本，需要提前确认安排和未来城市计划。'
}

function buildFieldExplainItems(scoreDetail) {
  const side = (scoreDetail && scoreDetail.side) || {}
  if (!REPORT_ITEMS.some((item) => hasDimensionSource(side, item.key))) return []
  return REPORT_ITEMS.map((item, index) => {
    const dim = side.dimensions && side.dimensions[item.key]
    const insufficient = Boolean(
      dim
      && (dim.status === 'not_compared' || dim.compared === false || dim.raw_score == null)
    )
    if (insufficient) {
      return {
        ...item,
        index,
        score: null,
        scoreText: '—',
        percent: 0,
        status: 'not_compared',
        insufficient: true,
        level: '资料不足',
        explain: '该维度缺少可比较资料，不计入契合分，也不显示进度条。',
        expanded: false
      }
    }
    const score = dimensionScore(side, item.key)
    const percent = item.max ? Math.min(100, Math.round((score / item.max) * 100)) : 0
    return {
      ...item,
      index,
      score,
      scoreText: formatScore(score),
      percent,
      status: 'compared',
      insufficient: false,
      level: reportLevel(percent),
      explain: explainText(item, percent),
      expanded: false
    }
  })
}

function pickLabels(items, minPercent) {
  return items.filter((item) => item.percent >= minPercent).map((item) => item.label)
}

function buildLocalMatchReport({ scoreDetail, ageBand, education, circleName, babyPlan, appearanceText } = {}) {
  const items = buildFieldExplainItems(scoreDetail)
  if (!items.length) return ''

  const strong = pickLabels(items, 75)
  const soft = items.filter((item) => item.percent > 0 && item.percent < 60).map((item) => item.label)
  const baseParts = []
  if (ageBand) baseParts.push(`年龄阶段在 ${ageBand}`)
  if (education && education !== '--') baseParts.push(`学历为${education}`)
  if (circleName && circleName !== '--') baseParts.push(`职业圈层是${circleName}`)
  if (babyPlan && babyPlan !== '--') baseParts.push(`婚育节奏倾向${babyPlan}`)

  const first = `你们这组匹配的现实基础${strong.length ? '比较稳' : '有可了解空间'}：${baseParts.length ? baseParts.join('，') : '基础资料已完成脱敏匹配'}。${strong.length ? `更接近的地方主要在${strong.slice(0, 3).join('、')}，这意味着初次见面和后续推进会少一些现实成本。` : '目前没有特别突出的单项优势，更适合先通过轻量沟通确认真实感受。'}`
  const second = `从三观和关系偏好看，更重要的是双方能不能在沟通方式、安全感、家庭边界和长期规划上形成稳定共识。${appearanceText || '外貌偏好按双方自述与期待的契合度计入匹配度，不做颜值判断，也不展示对方外貌原文。'}`
  const third = `真正需要提前聊的是${soft.length ? soft.slice(0, 3).join('、') : '未来城市安排、父母边界和家庭财务规划'}。第一次沟通可以从“未来三年想怎么生活”“婚后和双方父母保持什么距离”“家庭财务怎么规划”开始。`
  return `${first}\n\n${second}\n\n${third}`
}

module.exports = {
  REPORT_ITEMS,
  buildFieldExplainItems,
  buildLocalMatchReport
}

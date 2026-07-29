function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function percent(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function resolveTotalScorePercent(totalScore, scoreDetail) {
  const detail = scoreDetail || {}
  const normalizedSnake = finiteNumber(detail.normalized_total)
  if (normalizedSnake !== null) return percent(normalizedSnake)

  const normalizedCamel = finiteNumber(detail.normalizedTotal)
  if (normalizedCamel !== null) return percent(normalizedCamel)

  const detailTotal = finiteNumber(detail.total)
  const maxTotal = finiteNumber(
    detail.max_total !== null && detail.max_total !== undefined
      ? detail.max_total
      : detail.maxTotal
  )
  if (detailTotal !== null && maxTotal !== null && maxTotal > 0) {
    return percent((detailTotal / maxTotal) * 100)
  }

  const legacyTotal = finiteNumber(totalScore)
  return legacyTotal === null ? 0 : percent(legacyTotal)
}

module.exports = {
  resolveTotalScorePercent
}

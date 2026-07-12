function reviewed(record) {
  return Boolean(record) && (
    record.reviewed === true ||
    record.review_status === 'approved' ||
    record.status === 'approved' ||
    record.status === 'published'
  )
}

function queryTerms(query) {
  return String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
}

function score(record, terms) {
  const searchable = [record.title, record.content]
    .concat(Array.isArray(record.keywords) ? record.keywords : [])
    .join(' ')
    .toLowerCase()
  return terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0)
}

function knowledgeDto(record) {
  return {
    id: String(record._id || record.id || ''),
    title: String(record.title || '').slice(0, 160),
    content: String(record.content || record.answer || '').slice(0, 900)
  }
}

function searchReviewedKnowledge(records, query, limit) {
  const terms = queryTerms(query)
  const max = Math.min(Math.max(Number(limit) || 4, 1), 4)
  return (Array.isArray(records) ? records : [])
    .filter(reviewed)
    .map((record, index) => ({ record, index, score: score(record, terms) }))
    .filter((item) => terms.length === 0 || item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .map((item) => knowledgeDto(item.record))
}

module.exports = {
  searchReviewedKnowledge
}

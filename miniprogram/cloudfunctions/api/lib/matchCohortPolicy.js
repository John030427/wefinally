function cohortKey(user = {}) {
  return String(user.qa_match_cohort || '').trim()
}

function sharesCandidateCohort(left = {}, right = {}) {
  const leftKey = cohortKey(left)
  const rightKey = cohortKey(right)
  if (!leftKey && !rightKey) return true
  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

module.exports = { cohortKey, sharesCandidateCohort }

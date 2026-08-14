const assert = require('assert')
const { computeViewSimilarity } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')

// Fixed case proving char Jaccard under-scores synonym values.
// Desired product: synonym pairs enter semantic recall with score >= 60 (Batch 3 RAG).
const synonym = computeViewSimilarity(
  '我重视踏实和担当',
  '希望对方稳重有责任心',
  '我为人稳重有责任心',
  '希望对方踏实有担当'
)

assert.ok(
  synonym >= 60,
  `synonym values must enter semantic recall path; current Jaccard diagnostic score=${synonym}`
)

console.log('PASS synonym values clear semantic recall threshold')

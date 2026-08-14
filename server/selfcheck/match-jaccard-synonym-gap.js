const assert = require('assert')
const { computeViewSimilarity } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')
const { retrieveBidirectional } = require('../../miniprogram/cloudfunctions/api/lib/matchSemanticRetrieval')

async function main() {
  const jaccard = computeViewSimilarity(
    '我重视踏实和担当',
    '希望对方稳重有责任心',
    '我为人稳重有责任心',
    '希望对方踏实有担当'
  )
  assert.ok(jaccard < 50, `Jaccard remains diagnostic-only for synonyms; got ${jaccard}`)

  const retrieval = await retrieveBidirectional({
    userA: { id: 1, gender: 1, baby_plan: '3-5年内' },
    settingsA: {
      self_view_text: '我重视踏实和担当',
      target_view_text: '希望对方稳重有责任心'
    },
    userB: { id: 2, gender: 2, baby_plan: '3-5年内' },
    settingsB: {
      self_view_text: '我为人稳重有责任心',
      target_view_text: '希望对方踏实有担当'
    }
  }, { providerName: 'stub' })

  assert.ok(retrieval.mutual_score >= 60, `synonym values must enter semantic recall; got ${retrieval.mutual_score}`)
  console.log('PASS synonym values clear semantic recall threshold')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

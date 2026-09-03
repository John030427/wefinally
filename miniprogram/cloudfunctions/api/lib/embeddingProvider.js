const crypto = require('crypto')

const STUB_DIMS = 32

function unavailable(message = 'semantic_retrieval_unavailable') {
  const error = new Error(message)
  error.code = 'semantic_retrieval_unavailable'
  error.class = 'provider_unavailable'
  return error
}

function stubVector(text) {
  const digest = crypto.createHash('sha256').update(String(text || ''), 'utf8').digest()
  const vector = []
  for (let i = 0; i < STUB_DIMS; i += 1) {
    vector.push(((digest[i % digest.length] / 255) * 2) - 1)
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => Math.round((value / norm) * 1e6) / 1e6)
}

function cosineSimilarity(left = [], right = []) {
  if (!left.length || left.length !== right.length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i]
    leftNorm += left[i] * left[i]
    rightNorm += right[i] * right[i]
  }
  if (!leftNorm || !rightNorm) return 0
  return dot / Math.sqrt(leftNorm * rightNorm)
}

function createEmbeddingProvider(options = {}) {
  const name = String(options.provider || process.env.MATCH_EMBEDDING_PROVIDER || 'none').trim().toLowerCase()
  if (name === 'stub') {
    return {
      name: 'stub',
      async embed(texts = []) {
        return (Array.isArray(texts) ? texts : []).map((text) => stubVector(text))
      }
    }
  }
  if (name === 'none' || !name) {
    return {
      name: 'none',
      async embed() {
        throw unavailable()
      }
    }
  }
  return {
    name,
    async embed() {
      throw unavailable(`embedding provider not configured: ${name}`)
    }
  }
}

module.exports = {
  createEmbeddingProvider,
  cosineSimilarity,
  stubVector
}

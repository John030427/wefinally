'use strict'

function resolveAiMode(env = process.env) {
  return String(env.E2E_AI_MODE || 'fixture').trim().toLowerCase()
}

function hasCloudbaseCredentials(env = process.env) {
  const id = env.TCB_SECRET_ID || env.TENCENTCLOUD_SECRETID || env.SECRETID
  const key = env.TCB_SECRET_KEY || env.TENCENTCLOUD_SECRETKEY || env.SECRETKEY
  return Boolean(String(id || '').trim() && String(key || '').trim())
}

function createFixtureAiProvider(scenarioFixtures = {}) {
  return {
    mode: 'fixture',
    async generateDecision(input) {
      const key = String(input.message || '').trim()
      if (scenarioFixtures[key]) return scenarioFixtures[key](input)
      if (input.context && input.context.coordinationState) {
        if (/patch|futian|nanshan|area|activity|budget|turn1|turn2|turn3|coordinate|continue/i.test(key)) {
          return {
            intent: 'modify_date_application',
            replyDraft: 'Patch preview ready. Confirm to apply.',
            requestedTools: ['create_date_application_patch'],
            toolRequest: {
              tool: 'create_date_application_patch',
              arguments: input.suggestedPatch || { areas: ['Futian'] }
            },
            riskLevel: 'safe',
            suggestedActions: ['confirm_patch'],
            provider: 'e2e_fixture',
            fallback: false
          }
        }
        if (/coordinate|continue/i.test(key)) {
          return {
            intent: 'coordinate_date',
            replyDraft: 'Continuing coordination.',
            requestedTools: [],
            toolRequest: null,
            riskLevel: 'safe',
            suggestedActions: [],
            provider: 'e2e_fixture',
            fallback: false
          }
        }
      }
      return {
        intent: 'love_advice',
        replyDraft: 'Start with light topics and give each other time.',
        requestedTools: [],
        riskLevel: 'safe',
        suggestedActions: [],
        provider: 'e2e_fixture',
        fallback: false
      }
    },
    async semanticRerank(ranked) {
      return { applied: false, ranked, provider: 'e2e_fixture', degraded: true }
    },
    async invokeGraphFunction(name, payload) {
      return {
        result: {
          success: true,
          data: {
            status: 'awaiting_confirmation',
            threadId: payload.threadId || 'e2e_thread',
            phase: 'awaiting_confirmation',
            replyDraft: 'Overlap found. Waiting for confirmation.',
            pendingAction: null,
            coordinationVersion: payload.coordinationVersion || 1,
            provider: 'e2e_fixture'
          }
        }
      }
    }
  }
}

function createLiveAiProvider(env = process.env) {
  const cloudbaseAi = require('../../../../miniprogram/cloudfunctions/api/lib/cloudbaseAi')
  return {
    mode: 'live',
    async generateDecision(input) {
      const config = cloudbaseAi.getAiRuntimeConfig(env)
      if (config.provider !== 'cloudbase') {
        throw new Error('E2E live mode requires cloudbase provider, not deepseek fallback')
      }
      const result = await cloudbaseAi.generateText({
        env,
        config,
        messages: [{ role: 'user', content: String(input.message || 'ping').slice(0, 200) }]
      })
      return {
        intent: 'live_smoke',
        replyDraft: result.text || 'live ok',
        requestedTools: [],
        provider: 'cloudbase',
        fallback: false,
        metadata: result.metadata
      }
    },
    async semanticRerank(ranked) {
      const { semanticRerank } = require('../../../../miniprogram/cloudfunctions/api/lib/semanticMatchService')
      return semanticRerank(ranked, { env, embeddingProvider: null })
    },
    async invokeGraphFunction(name, payload) {
      throw new Error('Live LangGraph requires CloudBase runtime; use WEFINALLY_LIVE_GRAPH_SMOKE in selfcheck')
    }
  }
}

function createAiProvider(options = {}) {
  const mode = resolveAiMode(options.env)
  if (mode === 'live') return createLiveAiProvider(options.env)
  return createFixtureAiProvider(options.fixtures || {})
}

module.exports = {
  resolveAiMode,
  hasCloudbaseCredentials,
  createAiProvider,
  createFixtureAiProvider,
  createLiveAiProvider
}

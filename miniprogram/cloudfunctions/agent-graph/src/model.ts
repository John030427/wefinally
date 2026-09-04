import { z } from 'zod'
import { CoordinationCommandSchema, type CoordinationCommand } from './contracts.js'
import { sanitizeGraphText } from './sanitize.js'

const ToolRequestSchema = z.object({
  tool: z.string().min(1).max(80),
  arguments: z.record(z.string(), z.unknown()).default({})
}).strict()

const RawDecisionSchema = z.object({
  intent: z.string().min(1).max(64),
  reply_draft: z.string().max(1200).default(''),
  risk_level: z.enum(['safe', 'low', 'medium', 'high', 'critical']).default('safe'),
  route: z.enum(['frontline', 'faq', 'complaint', 'safety', 'date_coordination', 'manual_review']),
  tool_request: ToolRequestSchema.nullable().default(null),
  coordination_command: CoordinationCommandSchema.nullable().default(null),
  suggested_actions: z.array(z.string().max(120)).max(5).default([])
}).strict()

const ProviderResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }).passthrough()
  }).passthrough()).min(1)
}).passthrough()

export type ModelDecision = {
  intent: string
  replyDraft: string
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  route: 'frontline' | 'faq' | 'complaint' | 'safety' | 'date_coordination' | 'manual_review'
  toolRequest: { tool: string; arguments: Record<string, unknown> } | null
  coordinationCommand?: CoordinationCommand | null
  suggestedActions: string[]
}

export type DecisionInput = {
  mode: 'customer_service' | 'date_coordination'
  phase: string
  userText: string
  safeSummary: string
  context?: Record<string, unknown>
}

export type DecisionModel = {
  decide(input: DecisionInput): Promise<ModelDecision>
}

export class ModelBoundaryError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'ModelBoundaryError'
    this.code = code
  }
}

type GenerateTextResult = {
  text: string
}

type GenerateTextImpl = (input: {
  model: string
  group: string
  messages: Array<{ role: string; content: string }>
  maxTokens: number
  temperature: number
  responseFormat?: { type: string }
}) => Promise<GenerateTextResult>

type DecisionModelConfig = {
  provider?: string
  apiKey?: string
  baseUrl?: string
  model?: string
  group?: string
  envId?: string
  fetchImpl?: typeof fetch
  generateTextImpl?: GenerateTextImpl
}

const SYSTEM_PROMPT = [
  'Return one JSON object only.',
  'Allowed keys: intent, reply_draft, risk_level, route, tool_request, coordination_command, suggested_actions.',
  'For date_coordination, coordination_command is the only semantic decision output. Use canonical fields and include target_version or context_ref for every plan mutation.',
  'Never request raw database access, payment mutation, membership mutation, account bans, secrets, contact details, exact addresses, OpenID, or another user raw messages.',
  'Do not claim any business action succeeded. Business services execute actions after validation.'
].join(' ')

function buildUserPayload(input: DecisionInput) {
  const userText = sanitizeGraphText(input.userText, 2000)
  const safeSummary = sanitizeGraphText(input.safeSummary, 800)
  return {
    model: '',
    max_tokens: 900,
    temperature: 0.2,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          mode: input.mode,
          phase: sanitizeGraphText(input.phase, 80),
          user_text: userText,
          safe_summary: safeSummary,
          ...(input.context ? {
            context_json: sanitizeGraphText(JSON.stringify(input.context), 2600)
          } : {})
        })
      }
    ]
  }
}

function parseDecisionContent(content: string): ModelDecision {
  let rawDecision: unknown
  try {
    rawDecision = JSON.parse(content)
  } catch {
    throw new ModelBoundaryError('invalid_model_output')
  }
  const parsed = RawDecisionSchema.safeParse(rawDecision)
  if (!parsed.success) throw new ModelBoundaryError('invalid_model_output')
  return {
    intent: parsed.data.intent,
    replyDraft: sanitizeGraphText(parsed.data.reply_draft, 1200),
    riskLevel: parsed.data.risk_level,
    route: parsed.data.route,
    toolRequest: parsed.data.tool_request,
    coordinationCommand: parsed.data.coordination_command,
    suggestedActions: parsed.data.suggested_actions.map((item) => sanitizeGraphText(item, 120))
  }
}

function createDeepseekDecisionModel(config: DecisionModelConfig): DecisionModel {
  const apiKey = String(config.apiKey || '').trim()
  const baseUrl = String(config.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')
  const model = String(config.model || 'deepseek-chat')
  const request = config.fetchImpl || fetch

  return {
    async decide(input: DecisionInput): Promise<ModelDecision> {
      if (!apiKey) throw new ModelBoundaryError('provider_disabled')
      const payload = buildUserPayload(input)
      payload.model = model

      let response: Response
      try {
        response = await request(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20_000)
        })
      } catch (error) {
        if (error instanceof ModelBoundaryError) throw error
        throw new ModelBoundaryError(error instanceof Error && error.name === 'TimeoutError' ? 'provider_timeout' : 'provider_request_error')
      }
      if (!response.ok) throw new ModelBoundaryError('provider_http_error')

      let providerBody: unknown
      try {
        providerBody = await response.json()
      } catch {
        throw new ModelBoundaryError('invalid_provider_response')
      }
      const provider = ProviderResponseSchema.safeParse(providerBody)
      if (!provider.success) throw new ModelBoundaryError('invalid_provider_response')
      return parseDecisionContent(provider.data.choices[0]?.message.content || '')
    }
  }
}

function createCloudbaseGenerateText(config: DecisionModelConfig): GenerateTextImpl {
  if (config.generateTextImpl) return config.generateTextImpl
  let appInstance: ReturnType<typeof import('@cloudbase/node-sdk').init> | null = null
  const group = String(config.group || 'cloudbase')
  const model = String(config.model || 'hy3')
  const envId = String(config.envId || process.env.TCB_ENV || process.env.SCF_NAMESPACE || '')
  return async (input) => {
    const tcb = await import('@cloudbase/node-sdk')
    if (!appInstance) appInstance = tcb.init({ env: envId })
    const ai = appInstance.ai()
    const client = ai.createModel(input.group || group)
    const generate = client.generateText.bind(client) as (input: {
      model: string
      messages: Array<{ role: string; content: string }>
      maxTokens?: number
      temperature?: number
      responseFormat?: { type: string }
    }) => Promise<{ text?: string }>
    const result = await generate({
      model: input.model || model,
      messages: input.messages,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      ...(input.responseFormat ? { responseFormat: input.responseFormat } : {})
    })
    return { text: String(result.text || '') }
  }
}

function createCloudbaseDecisionModel(config: DecisionModelConfig): DecisionModel {
  const group = String(config.group || 'cloudbase')
  const model = String(config.model || 'hy3')
  const generateText = createCloudbaseGenerateText(config)

  return {
    async decide(input: DecisionInput): Promise<ModelDecision> {
      const payload = buildUserPayload(input)
      let result: GenerateTextResult
      try {
        result = await generateText({
          group,
          model,
          messages: payload.messages,
          maxTokens: payload.max_tokens,
          temperature: payload.temperature,
          responseFormat: payload.response_format
        })
      } catch (error) {
        if (error instanceof ModelBoundaryError) throw error
        throw new ModelBoundaryError(error instanceof Error && error.name === 'TimeoutError' ? 'provider_timeout' : 'provider_request_error')
      }
      return parseDecisionContent(result.text)
    }
  }
}

export function createDecisionModel(config: DecisionModelConfig = {}): DecisionModel {
  const provider = String(
    config.provider
    || process.env.AI_PROVIDER
    || 'cloudbase'
  ).toLowerCase()
  if (provider === 'deepseek' || provider === 'legacy_deepseek') {
    return createDeepseekDecisionModel(config)
  }
  return createCloudbaseDecisionModel(config)
}

export function resolveDecisionModelConfig(env: NodeJS.ProcessEnv = process.env): DecisionModelConfig {
  const provider = String(env.AI_PROVIDER || 'cloudbase').toLowerCase()
  if (provider === 'deepseek' || provider === 'legacy_deepseek') {
    return {
      provider: 'deepseek',
      apiKey: String(env.DEEPSEEK_API_KEY || ''),
      baseUrl: String(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'),
      model: String(env.DEEPSEEK_MODEL || 'deepseek-chat')
    }
  }
  return {
    provider: 'cloudbase',
    group: String(env.AI_GROUP || 'cloudbase'),
    model: String(env.AI_MODEL || env.LLM_MODEL || 'hy3'),
    envId: String(env.TCB_ENV || env.SCF_NAMESPACE || '')
  }
}

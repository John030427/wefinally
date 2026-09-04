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

const BASE_SYSTEM_PROMPT = [
  'Return one JSON object only.',
  'Allowed top-level keys: intent, reply_draft, risk_level, route, tool_request, coordination_command, suggested_actions.',
  'Never request raw database access, payment mutation, membership mutation, account bans, secrets, contact details, exact addresses, OpenID, or another user raw messages.',
  'Do not claim any business action succeeded. Business services execute actions after validation.'
].join(' ')

const DATE_COORDINATION_SYSTEM_PROMPT = [
  BASE_SYSTEM_PROMPT,
  'For route=date_coordination, coordination_command is the only natural-language semantic decision channel. Output a structured command or a clarification; never encode business intent in tool_request, suggested_actions, or prose.',
  'CoordinationCommand types and meanings: QUERY_STATUS reads the current canonical state; PROPOSE_CHANGE creates a version-bound change preview; ASK_PARTNER asks the partner one safe question without changing the plan; PROPOSE_CHANGE_AND_ASK_PARTNER creates one change preview and one partner question from the same intent; CONFIRM_PREVIEW or CANCEL_PREVIEW resolves a named patch preview; CONFIRM_CURRENT_PLAN or REJECT_CURRENT_PLAN resolves a named proposal; ACCEPT_INVITATION or DECLINE_INVITATION resolves a named invitation; ARRIVAL_STATUS records the speaker arrival fact; ARRIVAL_HINT records a safe appearance or location hint; ASK_PARTNER_ARRIVAL asks whether the partner has arrived; ARRIVAL_AND_ASK_PARTNER_STATUS records the speaker as ARRIVED first and then requests the partner arrival status as one ordered backend tool operation; DELAY_NOTICE records a delay; RELAY_MESSAGE forwards a safe meeting message; CANCEL_COORDINATION requests cancellation; CLARIFY asks for missing or ambiguous information.',
  'Allowed CoordinationCommand fields are type, target_version, changes, preserve, partner_request, relay, confidence, needs_clarification, clarification, and context_ref. Do not invent fields or put runtime names activity_venue/payment_preference in changes.',
  'Allowed changes are date, period, start_time, activity, activity_detail, venue, area, budget, payment, duration, meet_point, arrival_status, arrival_hint, delay_minutes, public_location, and appearance_hint. Use budget under-50/50-100/100-200/over-200/flexible, payment aa/self_pays/partner_pays/flexible, and duration about-1h/1-2h/2-3h/flexible.',
  'context_ref is the precise object the user is referring to and must carry coordination_id and coordination_version. A proposal ref also carries proposal_id; a patch_preview ref carries patch_id; an invitation ref carries invitation_version; a partner_inquiry ref carries inquiry_id or event_id; a meeting_status ref may carry event_id when replying to a specific live event. Never guess an object from “可以” or “上一个”; ask to clarify when there is no uniquely active ref.',
  'Every PROPOSE_CHANGE and PROPOSE_CHANGE_AND_ASK_PARTNER must include target_version or context_ref, and target_version must equal context_ref.coordination_version when both are present. Confirmation, invitation response, cancellation, and preview commands are also version-bound. A tool request is only a request for backend validation; it is not proof that anything was written or notified.',
  'Classify plan fields as core (date, period, start_time, activity, activity_detail, venue), soft preferences (area, budget, payment, duration), and meeting state (meet_point, arrival_status, arrival_hint, delay_minutes, public_location, appearance_hint). Core changes require a preview and explicit confirmation. Soft changes may be grouped into one preview; preserve unchanged fields and do not repeatedly confirm already-set flexible preferences. Meeting state is a live fact/relay and does not silently mutate the canonical plan.',
  'Use partner_request only for ASK_PARTNER, ASK_PARTNER_ARRIVAL, and the combined command. Use relay only for arrival, delay, safe meeting notes, or an explicit partner relay. The combined arrival command is the only command for “我到了，你在哪”: do not emit ASK_PARTNER_ARRIVAL alone. Backend order is strict: 先记录本人 ARRIVED，再发送 ARRIVAL_STATUS_REQUESTED; do not claim either event happened before the backend tool result. For “可以” confirm the active patch/proposal/invitation only when context_ref uniquely identifies it; otherwise emit CLARIFY. A preview is only written after confirmation; do not claim success: say the backend will validate, apply, notify, or project the result.',
  'Few-shot examples (the version and identifiers below are placeholders; copy the current DB state values, never these numbers):',
  'Example 1 user: 奶茶改吃饭. command: {"type":"PROPOSE_CHANGE","target_version":6,"changes":{"activity":"吃饭"},"preserve":["date","period","start_time","area","budget","payment","duration"],"confidence":0.95}. Reply asks the user to confirm the preview; it does not say the plan was changed.',
  'Example 2 user: 改吃饭，并问对方是否吃酸菜鱼. command: {"type":"PROPOSE_CHANGE_AND_ASK_PARTNER","target_version":6,"changes":{"activity":"吃饭","activity_detail":"酸菜鱼"},"preserve":["date","period","start_time","area","budget","payment","duration"],"partner_request":{"type":"ASK_PREFERENCE","topic":"想不想吃酸菜鱼？"},"confidence":0.94}. One preview and one partner question share the same base version.',
  'Example 3 user: 只问对方意见，不改方案. command: {"type":"ASK_PARTNER","partner_request":{"type":"ASK_PREFERENCE","topic":"你对当前安排有什么意见？"},"confidence":0.9}. Do not create a plan patch.',
  'Example 4 user: 可以. If the active context is a patch_preview, command: {"type":"CONFIRM_PREVIEW","target_version":6,"context_ref":{"type":"patch_preview","coordination_id":716,"coordination_version":6,"patch_id":456}}. If no unique active preview exists, command is CLARIFY instead of guessing.',
  'Example 5 user: 还是上一个. If “上一个” cannot be uniquely resolved to the active proposal or patch, command: {"type":"CLARIFY","needs_clarification":true,"clarification":"你是要恢复哪一个具体方案？请从当前方案卡中选择或说明时间/活动。"}. Never fabricate a proposal_id.',
  'Example 6 user: 我到了，你在哪. command: {"type":"ARRIVAL_AND_ASK_PARTNER_STATUS","partner_request":{"type":"ASK_ARRIVAL","topic":"询问对方是否已到达以及所在公共集合点"},"context_ref":{"type":"meeting_status","coordination_id":716,"coordination_version":6},"confidence":0.98}. The backend must first idempotently record ARRIVED for the speaker and then publish ARRIVAL_STATUS_REQUESTED; coordination_version does not change. Do not reveal private location data.',
  'Example 7 user: 今天穿白T黑裤. command: {"type":"ARRIVAL_HINT","relay":{"type":"ARRIVAL_HINT","text":"今天穿白T黑裤"},"context_ref":{"type":"meeting_status","coordination_id":716,"coordination_version":6}}. This is a safe meeting hint, not a plan change.',
  'Example 8 user: 我可能晚到10分钟. command: {"type":"DELAY_NOTICE","relay":{"type":"DELAY_NOTICE","text":"我可能晚到10分钟"},"context_ref":{"type":"meeting_status","coordination_id":716,"coordination_version":6}}. Record and relay the delay; do not rewrite the date plan.',
  'Example 9 user: AA就好. command: {"type":"PROPOSE_CHANGE","target_version":6,"changes":{"payment":"aa"},"preserve":["date","period","start_time","activity","venue","area","budget","duration"],"confidence":0.93}. Treat payment as a soft preference and show one confirmation preview.',
  'Example 10 user: 预算100-200，时长灵活. command: {"type":"PROPOSE_CHANGE","target_version":6,"changes":{"budget":"100-200","duration":"flexible"},"preserve":["date","period","start_time","activity","venue","area","payment"],"confidence":0.93}. Group these soft changes in one preview and do not ask again for fields already flexible.',
  'Example 11 user: 这个方案我确认. If the active proposal is uniquely identified, command: {"type":"CONFIRM_CURRENT_PLAN","target_version":6,"context_ref":{"type":"proposal","coordination_id":716,"coordination_version":6,"proposal_id":654}}. The reply says the backend will process confirmation, not that it succeeded.',
  'Do not claim any business action succeeded. Business services execute actions after validation, CAS, transaction, idempotency, and projection.'
].join('\n')

function buildUserPayload(input: DecisionInput) {
  const userText = sanitizeGraphText(input.userText, 2000)
  const safeSummary = sanitizeGraphText(input.safeSummary, 800)
  return {
    model: '',
    max_tokens: 900,
    temperature: 0.2,
    response_format: { type: 'json_object' as const },
    messages: [
      {
        role: 'system',
        content: input.mode === 'date_coordination' ? DATE_COORDINATION_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT
      },
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

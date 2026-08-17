import { z } from 'zod'
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

type DecisionModelConfig = {
  apiKey: string
  baseUrl?: string
  model?: string
  fetchImpl?: typeof fetch
}

const SYSTEM_PROMPT = [
  'Return one JSON object only.',
  'Allowed keys: intent, reply_draft, risk_level, route, tool_request, suggested_actions.',
  'Never request raw database access, payment mutation, membership mutation, account bans, secrets, contact details, exact addresses, OpenID, or another user raw messages.',
  'Do not claim any business action succeeded. Business services execute actions after validation.'
].join(' ')

export function createDecisionModel(config: DecisionModelConfig): DecisionModel {
  const apiKey = String(config.apiKey || '').trim()
  const baseUrl = String(config.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')
  const model = String(config.model || 'deepseek-chat')
  const request = config.fetchImpl || fetch

  return {
    async decide(input: DecisionInput): Promise<ModelDecision> {
      if (!apiKey) throw new ModelBoundaryError('provider_disabled')
      const userText = sanitizeGraphText(input.userText, 2000)
      const safeSummary = sanitizeGraphText(input.safeSummary, 800)
      const payload = {
        model,
        max_tokens: 900,
        temperature: 0.2,
        response_format: { type: 'json_object' },
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

      let rawDecision: unknown
      try {
        rawDecision = JSON.parse(provider.data.choices[0]?.message.content || '')
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
        suggestedActions: parsed.data.suggested_actions.map((item) => sanitizeGraphText(item, 120))
      }
    }
  }
}

import {
  Annotation,
  END,
  START,
  StateGraph,
  interrupt,
  type BaseCheckpointSaver
} from '@langchain/langgraph'
import {
  SafeToolResultSchema,
  type PendingAction,
  type SafeToolResult
} from '../contracts.js'
import type { DecisionModel, ModelDecision } from '../model.js'
import { sanitizeGraphText } from '../sanitize.js'

type CustomerServiceRoute = ModelDecision['route']
type RiskLevel = ModelDecision['riskLevel']

type CustomerServiceState = {
  operation: 'run'
  threadId: string
  actorRef: string
  mode: 'customer_service'
  userText: string
  safeSummary: string
  phase: string
  riskLevel: RiskLevel
  route: CustomerServiceRoute | undefined
  intent: string | undefined
  replyDraft: string
  pendingAction: PendingAction | null
  lastResult: SafeToolResult | undefined
  confirmationA: boolean
  confirmationB: boolean
  proposal: Record<string, unknown> | null
}

const CustomerServiceAnnotation = Annotation.Root({
  operation: Annotation<CustomerServiceState['operation']>,
  threadId: Annotation<string>,
  actorRef: Annotation<string>,
  mode: Annotation<CustomerServiceState['mode']>,
  userText: Annotation<string>,
  safeSummary: Annotation<string>,
  phase: Annotation<string>,
  riskLevel: Annotation<RiskLevel>,
  route: Annotation<CustomerServiceRoute | undefined>,
  intent: Annotation<string | undefined>,
  replyDraft: Annotation<string>,
  pendingAction: Annotation<PendingAction | null>,
  lastResult: Annotation<SafeToolResult | undefined>,
  confirmationA: Annotation<boolean>,
  confirmationB: Annotation<boolean>,
  proposal: Annotation<Record<string, unknown> | null>
})

const PROMPT_INJECTION_PATTERN = /(?:忽略|绕过|覆盖).{0,20}(?:规则|指令|限制)|系统提示词|后台全部|开发者指令/i

function isPromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERN.test(text)
}

function manualCategory(state: CustomerServiceState): string {
  if (isPromptInjection(state.userText)) return 'prompt_injection'
  if (state.intent === 'payment_dispute') return 'payment_dispute'
  if (state.route === 'safety') return 'safety_risk'
  return 'customer_complaint'
}

function ticketPriority(state: CustomerServiceState): 'P0' | 'P1' {
  return state.riskLevel === 'critical' ? 'P0' : 'P1'
}

export type CustomerServiceGraphDependencies = {
  model: DecisionModel
  checkpointer: BaseCheckpointSaver
}

export function buildCustomerServiceGraph(dependencies: CustomerServiceGraphDependencies) {
  const graph = new StateGraph(CustomerServiceAnnotation)
    .addNode('frontline', async (state) => {
      if (isPromptInjection(state.userText)) {
        return {
          phase: 'classified',
          riskLevel: 'high' as const,
          route: 'manual_review' as const,
          intent: 'prompt_injection',
          replyDraft: '该请求需要人工核查，我已为你转交处理。'
        }
      }

      const decision = await dependencies.model.decide({
        mode: 'customer_service',
        phase: sanitizeGraphText(state.phase, 80),
        userText: sanitizeGraphText(state.userText, 2000),
        safeSummary: sanitizeGraphText(state.safeSummary, 800)
      })
      return {
        phase: 'classified',
        riskLevel: decision.riskLevel,
        route: decision.route,
        intent: decision.intent,
        replyDraft: sanitizeGraphText(decision.replyDraft, 1200)
      }
    })
    .addNode('respond', () => ({ phase: 'completed', pendingAction: null }))
    .addNode('manualReview', (state) => {
      const pendingAction: PendingAction = {
        type: 'create_human_ticket',
        arguments: {
          priority: ticketPriority(state),
          category: manualCategory(state),
          summary: sanitizeGraphText(state.userText, 300)
        },
        requiresConfirmation: false
      }
      const resumed: unknown = interrupt({
        action_request: {
          action: pendingAction.type,
          args: pendingAction.arguments
        },
        config: {
          allow_accept: true,
          allow_edit: false,
          allow_ignore: false,
          allow_respond: false
        },
        description: '需由白名单业务服务创建人工客服工单。'
      })
      const toolResult = SafeToolResultSchema.safeParse(resumed)
      return {
        phase: 'manual_pending',
        pendingAction,
        lastResult: toolResult.success
          ? toolResult.data
          : { ok: false, code: 'invalid_tool_result' }
      }
    })
    .addEdge(START, 'frontline')
    .addConditionalEdges('frontline', (state) => {
      if (state.route === 'complaint' || state.route === 'safety' || state.route === 'manual_review') {
        return 'manualReview'
      }
      return 'respond'
    })
    .addEdge('respond', END)
    .addEdge('manualReview', END)

  return graph.compile({ checkpointer: dependencies.checkpointer })
}

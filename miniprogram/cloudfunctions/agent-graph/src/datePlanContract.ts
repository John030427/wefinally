import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type DatePlanV3 = {
  contract_version: number
  date: string
  period: string
  start_time: string
  area: string
  activity: string
  activity_venue: string
  meet_point: string
  budget: string
  payment: string
  duration: string
  arrival_hint: string
}

export type StructuredPlanIntent = {
  intent: string
  changed_dimensions: string[]
  candidate_values: Record<string, unknown>
  confidence: number
  needs_clarification: boolean
  clarification: string
}

export type AppliedPlanIntent = StructuredPlanIntent & {
  plan: DatePlanV3
}

export type DatePlanValidation = {
  valid: boolean
  missing: string[]
  conflicts: Array<{ code: string; message?: string }>
  clarification: string
  plan: DatePlanV3
  stage: string
}

type ContractModule = {
  buildDatePlanV3: (input?: Record<string, unknown>) => DatePlanV3
  validateDatePlan: (plan?: Record<string, unknown>, stage?: string) => DatePlanValidation
  interpretNlPlanUtterance: (text: string, base?: Record<string, unknown>) => StructuredPlanIntent
  applyStructuredPlanIntent: (intent: Record<string, unknown>, base?: Record<string, unknown>) => AppliedPlanIntent
  exactTimeFromText: (value: string, options?: { period?: string }) => string
  periodForStartTime: (value: string) => string
  canSendInvitation: (plan?: Record<string, unknown>) => { ok: boolean }
  canFinalizePlan: (plan?: Record<string, unknown>, options?: Record<string, unknown>) => { ok: boolean }
  normalizeFlexibleLocation: (activity: string, input: string, options?: Record<string, unknown>) => Record<string, unknown>
  NL_CONTRACT_CASES: Array<Record<string, unknown>>
  PLAN_CONTRACT_VERSION: number
}

function loadContract(): ContractModule {
  const require = createRequire(import.meta.url)
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(here, '../datePlanContract.cjs'),
    path.join(here, '../../api/lib/datePlanContract.js')
  ]
  for (const candidate of candidates) {
    try {
      return require(candidate) as ContractModule
    } catch {
      // try next packaging path
    }
  }
  throw new Error('datePlanContract module is not available')
}

const contract = loadContract()

export const PLAN_CONTRACT_VERSION = contract.PLAN_CONTRACT_VERSION
export const NL_CONTRACT_CASES = contract.NL_CONTRACT_CASES
export const buildDatePlanV3 = contract.buildDatePlanV3
export const validateDatePlan = contract.validateDatePlan
export const interpretNlPlanUtterance = contract.interpretNlPlanUtterance
export const applyStructuredPlanIntent = contract.applyStructuredPlanIntent
export const exactTimeFromText = contract.exactTimeFromText
export const periodForStartTime = contract.periodForStartTime
export const canSendInvitation = contract.canSendInvitation
export const canFinalizePlan = contract.canFinalizePlan
export const normalizeFlexibleLocation = contract.normalizeFlexibleLocation

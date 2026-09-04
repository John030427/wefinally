export const COORDINATION_FIELD_RUNTIME_ADAPTER: Readonly<{
  venue: 'activity_venue'
  payment: 'payment_preference'
}>
export const COORDINATION_EVENT_TYPE_RUNTIME_ADAPTER: Readonly<Record<string, string>>
export const COORDINATION_EVENT_TYPE_LEGACY_ALIASES: Readonly<Record<string, string>>
export const COORDINATION_EVENT_TYPE_MIGRATION_INVENTORY: ReadonlyArray<readonly [string, string]>
export function toCanonicalCoordinationField(field: string): string
export function toRuntimeCoordinationField(field: string): string
export function toCanonicalCoordinationPlan(source: Record<string, unknown> | null | undefined): Record<string, unknown>
export function toRuntimeCoordinationChanges(changes: Record<string, unknown>, candidatePlan?: Record<string, unknown> | null): Record<string, unknown>
export function toCanonicalCoordinationChanges(changes: Record<string, unknown>): Record<string, unknown>
export function toCanonicalCoordinationEventType(value: string): string | null
export function toRuntimeCoordinationEventType(value: string): string | null

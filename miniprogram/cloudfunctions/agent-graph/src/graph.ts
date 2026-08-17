import { Command, type BaseCheckpointSaver } from '@langchain/langgraph'
import type { GraphResumeInput, GraphRunInput } from './contracts.js'
import type { DecisionModel } from './model.js'
import { buildCustomerServiceGraph } from './graphs/customerService.js'
import {
  applyConfirmation,
  buildDateCoordinationGraph,
  type DateCoordinationState
} from './graphs/dateCoordination.js'

export type GraphMode = GraphRunInput['mode']

type GraphRuntimeDependencies = {
  checkpointer: BaseCheckpointSaver
  model: DecisionModel
}

function config(threadId: string) {
  return { configurable: { thread_id: threadId } }
}

export async function loadCheckpointState(
  checkpointer: BaseCheckpointSaver,
  threadId: string
): Promise<Record<string, unknown> | undefined> {
  const tuple = await checkpointer.getTuple(config(threadId))
  return tuple?.checkpoint.channel_values as Record<string, unknown> | undefined
}

export async function runGraph(
  input: GraphRunInput & Record<string, unknown>,
  dependencies: GraphRuntimeDependencies
): Promise<Record<string, unknown>> {
  if (input.mode === 'customer_service') {
    const graph = buildCustomerServiceGraph(dependencies)
    return graph.invoke(input as Parameters<typeof graph.invoke>[0], config(input.threadId)) as Promise<Record<string, unknown>>
  }
  return buildDateCoordinationGraph({ checkpointer: dependencies.checkpointer, model: dependencies.model })
    .invoke(input as unknown as DateCoordinationState, config(input.threadId)) as Promise<Record<string, unknown>>
}

export async function resumeGraph(
  input: GraphResumeInput,
  state: Record<string, unknown>,
  dependencies: GraphRuntimeDependencies
): Promise<Record<string, unknown>> {
  const mode = state.mode
  if (mode === 'customer_service') {
    const resumeValue = input.operation === 'resume_tool' ? input.toolResult : input.confirmation
    return buildCustomerServiceGraph(dependencies)
      .invoke(new Command({ resume: resumeValue }), config(input.threadId)) as Promise<Record<string, unknown>>
  }
  if (mode !== 'date_coordination') throw new Error('invalid_checkpoint_mode')

  if (input.operation === 'resume_tool') {
    return buildDateCoordinationGraph({ checkpointer: dependencies.checkpointer, model: dependencies.model })
      .invoke(new Command({ resume: input.toolResult }), config(input.threadId)) as Promise<Record<string, unknown>>
  }
  const party = input.confirmation?.arguments?.party
  const version = input.confirmation?.arguments?.coordinationVersion
  if ((party !== 'A' && party !== 'B') || typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error('invalid_confirmation')
  }
  const next = applyConfirmation(state as unknown as DateCoordinationState, party, version)
  return buildDateCoordinationGraph({ checkpointer: dependencies.checkpointer, model: dependencies.model })
    .invoke(next, config(input.threadId)) as Promise<Record<string, unknown>>
}

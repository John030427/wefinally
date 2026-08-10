import { createHash } from 'node:crypto'
import type { RunnableConfig } from '@langchain/core/runnables'
import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  getCheckpointId,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointPendingWrite,
  type CheckpointTuple,
  type PendingWrite
} from '@langchain/langgraph-checkpoint'

type SerializedValue = {
  type: string
  data: string
}

type BaseDocument = {
  id: string
  threadId: string
  checkpointNamespace: string
  checkpointId: string
  createdAt: number
  expireAt: number
}

export type CheckpointDocument = BaseDocument & (
  | {
      kind: 'checkpoint'
      parentCheckpointId?: string
      checkpoint: SerializedValue
      metadata: SerializedValue
    }
  | {
      kind: 'write'
      taskId: string
      writeIndex: number
      channel: string
      value: SerializedValue
    }
)

export type CheckpointCollection = {
  get(id: string): Promise<CheckpointDocument | undefined>
  set(id: string, value: CheckpointDocument): Promise<void>
  query(threadId: string): Promise<CheckpointDocument[]>
  removeByThread(threadId: string): Promise<void>
}

type SaverOptions = {
  retentionDays?: number
  now?: () => number
}

const THREAD_ID_PATTERN = /^wf_thread_[A-Za-z0-9_-]{10,80}$/
const CHECKPOINT_KEY_PATTERN = /^[A-Za-z0-9_.:-]{0,160}$/

function requireThreadId(config: RunnableConfig): string {
  const threadId = config.configurable?.thread_id
  if (typeof threadId !== 'string' || !THREAD_ID_PATTERN.test(threadId)) {
    throw new Error('invalid_thread_id')
  }
  return threadId
}

function checkpointNamespace(config: RunnableConfig): string {
  const value = config.configurable?.checkpoint_ns ?? ''
  if (typeof value !== 'string' || !CHECKPOINT_KEY_PATTERN.test(value)) {
    throw new Error('invalid_checkpoint_namespace')
  }
  return value
}

function validateCheckpointId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !CHECKPOINT_KEY_PATTERN.test(value)) {
    throw new Error('invalid_checkpoint_id')
  }
  return value
}

function documentId(parts: unknown[]): string {
  return `lg_${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`
}

function encode(type: string, data: Uint8Array): SerializedValue {
  return { type, data: Buffer.from(data).toString('base64') }
}

export class CloudBaseCheckpointSaver extends BaseCheckpointSaver {
  private readonly retentionMs: number
  private readonly now: () => number

  constructor(
    private readonly collection: CheckpointCollection,
    options: SaverOptions = {}
  ) {
    super()
    this.retentionMs = Math.max(1, options.retentionDays ?? 30) * 86_400_000
    this.now = options.now ?? Date.now
  }

  private async decode(value: SerializedValue): Promise<unknown> {
    return this.serde.loadsTyped(value.type, Buffer.from(value.data, 'base64'))
  }

  private async tupleFromDocument(document: Extract<CheckpointDocument, { kind: 'checkpoint' }>): Promise<CheckpointTuple> {
    const all = await this.collection.query(document.threadId)
    const writes = all
      .filter((candidate): candidate is Extract<CheckpointDocument, { kind: 'write' }> =>
        candidate.kind === 'write' &&
        candidate.checkpointNamespace === document.checkpointNamespace &&
        candidate.checkpointId === document.checkpointId
      )
      .sort((left, right) => left.writeIndex - right.writeIndex)
    const pendingWrites: CheckpointPendingWrite[] = await Promise.all(writes.map(async (write) => [
      write.taskId,
      write.channel,
      await this.decode(write.value)
    ] as CheckpointPendingWrite))
    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: document.threadId,
          checkpoint_ns: document.checkpointNamespace,
          checkpoint_id: document.checkpointId
        }
      },
      checkpoint: await this.decode(document.checkpoint) as Checkpoint,
      metadata: await this.decode(document.metadata) as CheckpointMetadata,
      pendingWrites
    }
    if (document.parentCheckpointId) {
      tuple.parentConfig = {
        configurable: {
          thread_id: document.threadId,
          checkpoint_ns: document.checkpointNamespace,
          checkpoint_id: document.parentCheckpointId
        }
      }
    }
    return tuple
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = requireThreadId(config)
    const namespace = checkpointNamespace(config)
    const requestedId = validateCheckpointId(getCheckpointId(config))
    let checkpoint: Extract<CheckpointDocument, { kind: 'checkpoint' }> | undefined
    if (requestedId) {
      const found = await this.collection.get(documentId(['checkpoint', threadId, namespace, requestedId]))
      if (found?.kind === 'checkpoint') checkpoint = found
    } else {
      const all = await this.collection.query(threadId)
      checkpoint = all
        .filter((candidate): candidate is Extract<CheckpointDocument, { kind: 'checkpoint' }> =>
          candidate.kind === 'checkpoint' && candidate.checkpointNamespace === namespace
        )
        .sort((left, right) => right.checkpointId.localeCompare(left.checkpointId))[0]
    }
    return checkpoint ? this.tupleFromDocument(checkpoint) : undefined
  }

  async *list(config: RunnableConfig, options: CheckpointListOptions = {}): AsyncGenerator<CheckpointTuple> {
    const threadId = requireThreadId(config)
    const namespace = checkpointNamespace(config)
    const beforeId = validateCheckpointId(options.before ? getCheckpointId(options.before) : undefined)
    const requestedId = validateCheckpointId(getCheckpointId(config))
    const all = await this.collection.query(threadId)
    let remaining = options.limit ?? Number.POSITIVE_INFINITY
    const checkpoints = all
      .filter((candidate): candidate is Extract<CheckpointDocument, { kind: 'checkpoint' }> =>
        candidate.kind === 'checkpoint' &&
        candidate.checkpointNamespace === namespace &&
        (!requestedId || candidate.checkpointId === requestedId) &&
        (!beforeId || candidate.checkpointId < beforeId)
      )
      .sort((left, right) => right.checkpointId.localeCompare(left.checkpointId))
    for (const checkpoint of checkpoints) {
      if (remaining <= 0) break
      const tuple = await this.tupleFromDocument(checkpoint)
      const metadataRecord = tuple.metadata as unknown as Record<string, unknown> | undefined
      if (options.filter && !Object.entries(options.filter).every(([key, value]) => metadataRecord?.[key] === value)) continue
      remaining -= 1
      yield tuple
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const threadId = requireThreadId(config)
    const namespace = checkpointNamespace(config)
    const checkpointId = validateCheckpointId(checkpoint.id)
    if (!checkpointId) throw new Error('invalid_checkpoint_id')
    const parentCheckpointId = validateCheckpointId(getCheckpointId(config))
    const [[checkpointType, checkpointData], [metadataType, metadataData]] = await Promise.all([
      this.serde.dumpsTyped(checkpoint),
      this.serde.dumpsTyped(metadata)
    ])
    const createdAt = this.now()
    const id = documentId(['checkpoint', threadId, namespace, checkpointId])
    const document: Extract<CheckpointDocument, { kind: 'checkpoint' }> = {
      id,
      kind: 'checkpoint',
      threadId,
      checkpointNamespace: namespace,
      checkpointId,
      checkpoint: encode(checkpointType, checkpointData),
      metadata: encode(metadataType, metadataData),
      createdAt,
      expireAt: createdAt + this.retentionMs
    }
    if (parentCheckpointId) document.parentCheckpointId = parentCheckpointId
    await this.collection.set(id, document)
    return { configurable: { thread_id: threadId, checkpoint_ns: namespace, checkpoint_id: checkpointId } }
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = requireThreadId(config)
    const namespace = checkpointNamespace(config)
    const checkpointId = validateCheckpointId(getCheckpointId(config))
    if (!checkpointId) throw new Error('missing_checkpoint_id')
    if (!CHECKPOINT_KEY_PATTERN.test(taskId)) throw new Error('invalid_task_id')
    const createdAt = this.now()
    await Promise.all(writes.map(async ([channel, value], index) => {
      const writeIndex = WRITES_IDX_MAP[channel] ?? index
      const [type, data] = await this.serde.dumpsTyped(value)
      const id = documentId(['write', threadId, namespace, checkpointId, taskId, writeIndex])
      await this.collection.set(id, {
        id,
        kind: 'write',
        threadId,
        checkpointNamespace: namespace,
        checkpointId,
        taskId,
        writeIndex,
        channel,
        value: encode(type, data),
        createdAt,
        expireAt: createdAt + this.retentionMs
      })
    }))
  }

  async deleteThread(threadId: string): Promise<void> {
    requireThreadId({ configurable: { thread_id: threadId } })
    await this.collection.removeByThread(threadId)
  }
}

import type { CheckpointCollection, CheckpointDocument } from './cloudbaseSaver.js'

type QueryResult = { data?: Array<Record<string, unknown>> }
type DocumentResult = { data?: Record<string, unknown> }

export type CloudBaseCollectionLike = {
  doc(id: string): {
    get(): Promise<DocumentResult>
    set(input: { data: Record<string, unknown> }): Promise<unknown>
  }
  where(query: { threadId: string }): {
    limit(value: number): { get(): Promise<QueryResult> }
    remove(): Promise<unknown>
  }
}

function withoutDocumentId(value: Record<string, unknown>): Record<string, unknown> {
  const result = { ...value }
  delete result._id
  return result
}

function missingDocument(error: unknown): boolean {
  return /document[^\n]*(?:not exist|does not exist)|文档[^\n]*不存在/i.test(String(error instanceof Error ? error.message : error || ''))
}

export function createCloudBaseCheckpointCollection(collection: CloudBaseCollectionLike): CheckpointCollection {
  return {
    async get(id) {
      try {
        const result = await collection.doc(id).get()
        return result.data ? withoutDocumentId(result.data) as CheckpointDocument : undefined
      } catch (error) {
        if (missingDocument(error)) return undefined
        throw error
      }
    },
    async set(id, value) {
      await collection.doc(id).set({ data: withoutDocumentId(value as unknown as Record<string, unknown>) })
    },
    async query(threadId) {
      const result = await collection.where({ threadId }).limit(1000).get()
      return (result.data || []).map((row) => withoutDocumentId(row) as CheckpointDocument)
    },
    async removeByThread(threadId) {
      await collection.where({ threadId }).remove()
    }
  }
}

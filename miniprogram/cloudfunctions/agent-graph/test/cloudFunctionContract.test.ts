import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createCloudBaseCheckpointCollection } from '../src/checkpoint/cloudbaseCollection.js'

test('CloudBase checkpoint adapter persists opaque documents by thread', async () => {
  const rows = new Map<string, Record<string, unknown>>()
  const collection = {
    doc(id: string) {
      return {
        async get() {
          const data = rows.get(id)
          if (!data) throw new Error('document does not exist')
          return { data }
        },
        async set(input: { data: Record<string, unknown> }) {
          rows.set(id, { _id: id, ...input.data })
        }
      }
    },
    where(query: { threadId: string }) {
      return {
        limit() {
          return {
            async get() {
              return { data: [...rows.values()].filter((row) => row.threadId === query.threadId) }
            }
          }
        },
        async remove() {
          for (const [id, row] of rows) if (row.threadId === query.threadId) rows.delete(id)
        }
      }
    }
  }
  const adapter = createCloudBaseCheckpointCollection(collection)
  const document = {
    id: 'opaque-doc', threadId: 'wf_thread_1234567890', checkpointNamespace: '', checkpointId: 'cp-1',
    createdAt: 1, expireAt: 2, kind: 'checkpoint' as const,
    checkpoint: { type: 'json', data: 'e30=' }, metadata: { type: 'json', data: 'e30=' }
  }
  await adapter.set(document.id, document)
  assert.deepEqual(await adapter.get(document.id), document)
  assert.equal((await adapter.query(document.threadId)).length, 1)
  await adapter.removeByThread(document.threadId)
  assert.equal((await adapter.query(document.threadId)).length, 0)
})

test('CloudBase function entrypoint wires the persistent saver and provider', () => {
  const source = readFileSync(new URL('../src/cloudFunction.ts', import.meta.url), 'utf8')
  for (const contract of ['cloud.DYNAMIC_CURRENT_ENV', 'CloudBaseCheckpointSaver', 'createDecisionModel', 'createAgentGraphMain', 'export const main']) {
    assert(source.includes(contract), `cloud function entrypoint missing: ${contract}`)
  }
  const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8')) as { handler?: string }
  const root = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  assert.equal(config.handler, 'index.main')
  assert(root.includes("export { main } from './dist/src/cloudFunction.js'"))
})

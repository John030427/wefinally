import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// These tests live outside the agent-graph cloud function package, so bare
// imports of @langchain/* cannot resolve from here. Anchor CommonJS require
// resolution at the agent-graph package (its node_modules is authoritative).
function anchorPath(): string {
  if (typeof __dirname === 'string') {
    return path.join(__dirname, '../../cloudfunctions/agent-graph/package.json')
  }
  return fileURLToPath(new URL('../../cloudfunctions/agent-graph/package.json', import.meta.url))
}

export const requireFromAgentGraph = createRequire(anchorPath())

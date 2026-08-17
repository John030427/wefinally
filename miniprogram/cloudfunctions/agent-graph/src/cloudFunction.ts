import cloud from 'wx-server-sdk'
import { CloudBaseCheckpointSaver } from './checkpoint/cloudbaseSaver.js'
import { createCloudBaseCheckpointCollection, type CloudBaseCollectionLike } from './checkpoint/cloudbaseCollection.js'
import { createAgentGraphMain } from './index.js'
import { createDecisionModel } from './model.js'

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV as unknown as string })

const database = cloud.database()
const checkpointCollection = createCloudBaseCheckpointCollection(
  database.collection('langgraph_checkpoints') as unknown as CloudBaseCollectionLike
)

export const main = createAgentGraphMain({
  checkpointer: new CloudBaseCheckpointSaver(checkpointCollection, { retentionDays: 30 }),
  model: createDecisionModel({
    apiKey: String(process.env.DEEPSEEK_API_KEY || ''),
    baseUrl: String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'),
    model: String(process.env.DEEPSEEK_MODEL || 'deepseek-chat')
  })
})

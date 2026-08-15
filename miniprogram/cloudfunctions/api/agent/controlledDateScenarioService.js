const crypto = require('crypto')

const STEP_SEQUENCE = Object.freeze([
  'created',
  'applications_submitted',
  'first_proposal',
  'a_patch_preview',
  'a_patch_applied',
  'revised_proposal',
  'confirmations_submitted',
  'passed'
])

const CONTROLLED_PATCH_REQUEST = [
  '受控端到端校验：请修改我自己的约会申请，把活动改为只喝咖啡。',
  '请返回 intent=modify_date_application，调用 create_date_application_patch，',
  'tool_request.arguments 仅设置 activities=["咖啡"]，并生成待我确认的修改预览。'
].join('')

function requireSuperAdmin(actor) {
  if (!actor || actor.role !== 'admin' || actor.admin_role !== 'super_admin') {
    throw new Error('无权运行受控约会场景')
  }
}

function normalizeRunId(value) {
  const runId = String(value || '').trim()
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(runId)) throw new Error('受控场景编号无效')
  return runId
}

function publicRun(run) {
  return {
    run_id: run.run_id,
    status: run.status,
    step: run.step,
    user_a_id: Number(run.user_a_id || 0),
    user_b_id: Number(run.user_b_id || 0),
    coordination_id: Number(run.coordination_id || 0),
    session_a_id: Number(run.session_a_id || 0),
    session_b_id: Number(run.session_b_id || 0),
    patch_id: Number(run.patch_id || 0),
    error_code: String(run.error_code || ''),
    create_time: run.create_time,
    update_time: run.update_time
  }
}

function controlledUser(runId, side, now) {
  return {
    openid: `controlled_date_${side.toLowerCase()}_${runId}`,
    nickname: `受控约会用户${side}`,
    gender: side === 'A' ? 1 : 2,
    birth_year: side === 'A' ? 1994 : 1996,
    city: '深圳',
    status: 1,
    member_status: 'approved',
    member_status_updated_at: now,
    is_vip: 1,
    vip_expire_time: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    vip_source: 'controlled_qa',
    free_member: 1,
    free_source: 'controlled_date_scenario',
    account_mode: 'internal_qa',
    profile_origin: 'controlled_date_scenario',
    controlled_scenario_run_id: runId,
    formal_match_hidden: 1,
    is_test_fixture: 1
  }
}

function createDefaultServices(deps) {
  const cloud = require('wx-server-sdk')
  const { createDateCoordinationHandlers } = require('../handlers/dateCoordination')
  const { processCoordinationTasks } = require('../handlers/dateCoordinationWorker')
  const { createAgentHandlers } = require('../handlers/agent')
  const { generateDecision } = require('./provider')
  const { publishCoordinationEvent } = require('./dateCoordinationEvents')

  const currentUser = async (context) => {
    const user = await deps.byId('user', Number(context && context.CONTROLLED_USER_ID || 0))
    if (!user || user.account_mode !== 'internal_qa') throw new Error('受控用户不存在')
    return user
  }
  const suppressedAdd = async (name, data, hint) => {
    if (name === 'agent_notification_job') {
      return { id: 0, ...data, status: 'suppressed_controlled_qa' }
    }
    return deps.addWithId(name, data, hint)
  }
  const dateHandlers = createDateCoordinationHandlers({
    currentUser,
    first: deps.first,
    list: deps.list,
    byId: deps.byId,
    addWithId: suppressedAdd,
    updateByDoc: deps.updateByDoc,
    now: deps.now
  })
  const agentHandlers = createAgentHandlers({
    currentUser,
    first: deps.first,
    list: deps.list,
    byId: deps.byId,
    addWithId: suppressedAdd,
    updateByDoc: deps.updateByDoc,
    now: deps.now,
    generateDecision,
    env: process.env,
    invokeGraphFunction: (name, payload) => cloud.callFunction({ name, data: payload })
  })
  const contextFor = (userId) => ({ CONTROLLED_USER_ID: Number(userId) })
  const applicationFor = (side) => {
    const date = new Date(deps.now().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return {
      availability: [{ date, periods: ['afternoon'] }],
      areas: side === 'A' ? ['福田区', '南山区'] : ['福田区'],
      activities: side === 'A' ? ['咖啡', '散步'] : ['咖啡'],
      budget: '100-200',
      payment_preference: 'aa',
      duration: '1-2h',
      transport_constraints: '',
      other_requirements: '',
      share_message: ''
    }
  }

  return {
    async bootstrap({ run, userA, userB }) {
      const coordination = await deps.addWithId('date_coordination', {
        pair_key: [userA.id, userB.id].sort((a, b) => Number(a) - Number(b)).join(':'),
        user_a_id: Number(userA.id),
        user_b_id: Number(userB.id),
        status: 'collecting_initiator',
        business_state: 'created',
        coordination_version: 1,
        recoordination_count: 0,
        application_deadline_at: new Date(deps.now().getTime() + 72 * 60 * 60 * 1000),
        formal_notification_suppressed: 1,
        controlled_scenario_run_id: run.run_id
      }, 'date_coordination')
      const sessionA = await deps.addWithId('agent_session', {
        user_id: userA.id, agent_type: 'date_coordinator', coordination_id: coordination.id,
        status: 'active', summary: '', controlled_scenario_run_id: run.run_id
      }, 'agent_session')
      const sessionB = await deps.addWithId('agent_session', {
        user_id: userB.id, agent_type: 'date_coordinator', coordination_id: coordination.id,
        status: 'active', summary: '', controlled_scenario_run_id: run.run_id
      }, 'agent_session')
      return { coordination, sessionA, sessionB }
    },
    async submitApplications({ run }) {
      await dateHandlers.saveApplication({ coordination_id: run.coordination_id, ...applicationFor('A') }, contextFor(run.user_a_id))
      await dateHandlers.respondInvitation({ coordination_id: run.coordination_id, decision: 'accept' }, contextFor(run.user_b_id))
      await dateHandlers.saveApplication({ coordination_id: run.coordination_id, ...applicationFor('B') }, contextFor(run.user_b_id))
    },
    async processProposal({ run }) {
      const result = await processCoordinationTasks({
        limit: 1,
        deps: {
          listTasks: async () => {
            const coordination = await deps.byId('date_coordination', run.coordination_id)
            return coordination
              && coordination.controlled_scenario_run_id === run.run_id
              && coordination.status === 'computing_overlap'
              && coordination.processing_status === 'queued'
              ? [coordination]
              : []
          },
          claimTask: deps.claimCoordinationProcessing,
          listApplications: (coordinationId, version) => deps.list('date_coordination_application', {
            coordination_id: Number(coordinationId), coordination_version: Number(version)
          }, 10),
          completeTask: deps.completeCoordinationProcessing,
          failTask: deps.failCoordinationProcessing,
          publishCoordinationEvent: (input) => publishCoordinationEvent(input, {
            first: deps.first, addWithId: suppressedAdd, now: deps.now
          }),
          now: deps.now
        }
      })
      if (!result.completed) throw new Error('受控场景未生成协调方案')
      return result
    },
    async requestPatch({ run }) {
      const result = await agentHandlers.send({
        session_id: run.session_a_id,
        message: CONTROLLED_PATCH_REQUEST
      }, contextFor(run.user_a_id))
      if (!result.requires_confirmation || !result.patch_preview) throw new Error('AI 未生成约会修改预览')
      return { patch_id: Number(result.patch_preview.id) }
    },
    async applyPatch({ run }) {
      const result = await agentHandlers.send({ session_id: run.session_a_id, message: '确认修改' }, contextFor(run.user_a_id))
      if (result.tool_failed || !result.coordination_version) throw new Error('AI 修改预览未成功应用')
      return result
    },
    async confirmBoth({ run }) {
      const coordination = await deps.byId('date_coordination', run.coordination_id)
      const proposals = await deps.list('date_coordination_proposal', {
        coordination_id: Number(run.coordination_id),
        coordination_version: Number(coordination.coordination_version || 1),
        status: 'active'
      }, 20)
      const proposal = proposals.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
      if (!proposal) throw new Error('受控场景没有可确认方案')
      await dateHandlers.confirmProposal({
        coordination_id: run.coordination_id, proposal_id: proposal.id, decision: 'confirm'
      }, contextFor(run.user_a_id))
      await dateHandlers.confirmProposal({
        coordination_id: run.coordination_id, proposal_id: proposal.id, decision: 'confirm'
      }, contextFor(run.user_b_id))
    }
  }
}

function createControlledDateScenarioService(deps, services) {
  if (!deps) throw new Error('受控场景依赖缺失')
  const workflow = services || createDefaultServices(deps)

  async function createRun(actor, input = {}) {
    requireSuperAdmin(actor)
    const runId = normalizeRunId(input.run_id || `wf_date_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`)
    const existing = await deps.first('controlled_date_scenario_run', { run_id: runId })
    if (existing) return publicRun(existing)
    const now = deps.now()
    const run = await deps.addWithId('controlled_date_scenario_run', {
      run_id: runId,
      status: 'running',
      step: 'created',
      actor_admin_id: Number(actor.id),
      error_code: ''
    }, 'controlled_date_scenario_run')
    const userA = await deps.addWithId('user', controlledUser(runId, 'A', now), 'user')
    const userB = await deps.addWithId('user', controlledUser(runId, 'B', now), 'user')
    await deps.addWithId('user_match_log', {
      user_id: userA.id, match_user_id: userB.id, status: 'matched',
      is_test_fixture: 1, formal_match_hidden: 1, controlled_scenario_run_id: runId
    }, 'match_log')
    await deps.addWithId('user_match_log', {
      user_id: userB.id, match_user_id: userA.id, status: 'matched',
      is_test_fixture: 1, formal_match_hidden: 1, controlled_scenario_run_id: runId
    }, 'match_log')
    Object.assign(run, { user_a_id: userA.id, user_b_id: userB.id })
    const bootstrapped = await workflow.bootstrap({ run, userA, userB })
    await deps.updateByDoc('controlled_date_scenario_run', run, {
      user_a_id: userA.id,
      user_b_id: userB.id,
      coordination_id: bootstrapped.coordination.id,
      session_a_id: bootstrapped.sessionA.id,
      session_b_id: bootstrapped.sessionB.id
    })
    return publicRun({
      ...run,
      user_a_id: userA.id,
      user_b_id: userB.id,
      coordination_id: bootstrapped.coordination.id,
      session_a_id: bootstrapped.sessionA.id,
      session_b_id: bootstrapped.sessionB.id
    })
  }

  async function advanceRun(actor, rawRunId) {
    requireSuperAdmin(actor)
    const runId = normalizeRunId(rawRunId)
    const run = await deps.first('controlled_date_scenario_run', { run_id: runId })
    if (!run) throw new Error('受控约会场景不存在')
    if (run.status === 'passed') return publicRun(run)
    try {
      const input = { run }
      let nextStep = ''
      const patch = {}
      if (run.step === 'created') {
        await workflow.submitApplications(input)
        nextStep = 'applications_submitted'
      } else if (run.step === 'applications_submitted') {
        const coordination = await deps.byId('date_coordination', run.coordination_id)
        if (!coordination || coordination.status !== 'waiting_confirmations') {
          await workflow.processProposal(input)
        }
        nextStep = 'first_proposal'
      } else if (run.step === 'first_proposal') {
        const result = await workflow.requestPatch(input)
        patch.patch_id = Number(result.patch_id || 0)
        nextStep = 'a_patch_preview'
      } else if (run.step === 'a_patch_preview') {
        await workflow.applyPatch(input)
        nextStep = 'a_patch_applied'
      } else if (run.step === 'a_patch_applied') {
        await workflow.processProposal(input)
        nextStep = 'revised_proposal'
      } else if (run.step === 'revised_proposal') {
        await workflow.confirmBoth(input)
        nextStep = 'confirmations_submitted'
      } else if (run.step === 'confirmations_submitted') {
        const coordination = await deps.byId('date_coordination', run.coordination_id)
        if (!coordination || coordination.status !== 'arranged') throw new Error('双方尚未形成约会安排')
        const graphRuns = await deps.list('agent_run', { provider: 'langgraph' }, 200)
        const patchCalls = await deps.list('agent_tool_call', { tool_name: 'create_date_application_patch' }, 200)
        if (!graphRuns.some((row) => Number(row.session_id) === Number(run.session_a_id))) throw new Error('缺少 LangGraph 运行证据')
        if (!patchCalls.some((row) => Number(row.session_id) === Number(run.session_a_id))) throw new Error('缺少 AI 工具调用证据')
        nextStep = 'passed'
        patch.status = 'passed'
      } else throw new Error('受控约会场景步骤无效')
      if (!STEP_SEQUENCE.includes(nextStep)) throw new Error('受控约会场景下一步无效')
      patch.step = nextStep
      patch.error_code = ''
      if (nextStep !== 'passed') patch.status = 'running'
      await deps.updateByDoc('controlled_date_scenario_run', run, patch)
      return publicRun({ ...run, ...patch })
    } catch (error) {
      await deps.updateByDoc('controlled_date_scenario_run', run, {
        status: 'failed',
        error_code: String(error && error.message || 'controlled_scenario_failed').slice(0, 160)
      })
      throw error
    }
  }

  async function getRun(actor, rawRunId) {
    requireSuperAdmin(actor)
    const run = await deps.first('controlled_date_scenario_run', { run_id: normalizeRunId(rawRunId) })
    if (!run) throw new Error('受控约会场景不存在')
    return publicRun(run)
  }

  return { createRun, advanceRun, getRun }
}

module.exports = {
  CONTROLLED_PATCH_REQUEST,
  createControlledDateScenarioService,
  createDefaultServices,
  requireSuperAdmin,
  normalizeRunId,
  publicRun
}

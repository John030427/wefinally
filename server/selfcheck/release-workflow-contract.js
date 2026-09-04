const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '../..')
const workflowPath = path.join(root, '.github/workflows/selfcheck.yml')
const manifestPath = path.join(root, 'project-docs/RELEASE_MANIFEST_TEMPLATE.md')
const agentsPath = path.join(root, 'AGENTS.md')
const handoffPath = path.join(root, 'PROJECT_HANDOFF.md')
const contributingPath = path.join(root, 'CONTRIBUTING.md')

const REQUIRED_MANIFEST_FIELDS = [
  'source_commit',
  'api_deploy_commit',
  'agent_graph_deploy_commit',
  'miniprogram_upload_commit',
  'cloud_env',
  'test_results',
  'rollback_commit'
]

function main() {
  const workflow = fs.readFileSync(workflowPath, 'utf8')
  assert.ok(/permissions:\s*\n\s*contents:\s*read/.test(workflow), 'workflow must keep contents: read')
  assert.ok(!/secrets\.|TCB_|WX_|WECHAT_|MYSQL_|DATABASE_URL|API_KEY|PRIVATE_KEY/i.test(workflow), 'PR workflow must not inject production secrets')
  assert.ok(workflow.includes('miniprogram/cloudfunctions/agent-graph/package-lock.json'), 'workflow must cache agent-graph lockfile')
  assert.ok(workflow.includes('npm ci --prefix miniprogram/cloudfunctions/agent-graph'), 'workflow must install agent-graph deps')
  assert.ok(workflow.includes('npm --prefix miniprogram/cloudfunctions/agent-graph run check'), 'workflow must run agent-graph check')
  assert.ok(workflow.includes('selfcheck:flexible-date-location') || workflow.includes('flexible-date-location'), 'workflow must run flexible date location')
  assert.ok(workflow.includes('selfcheck:qa-pair-reset'), 'workflow must run qa-pair-reset')
  assert.ok(workflow.includes('selfcheck:wx-identity') || workflow.includes('wx-identity-boundary'), 'workflow must run wx identity boundary')
  assert.ok(workflow.includes('release-workflow-contract.js'), 'workflow must run release workflow contract')

  const manifest = fs.readFileSync(manifestPath, 'utf8')
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    assert.ok(manifest.includes(field), `manifest template missing ${field}`)
  }
  assert.ok(manifest.includes('dependency_baseline'), 'manifest should record dependency baseline')

  const agents = fs.readFileSync(agentsPath, 'utf8')
  assert.ok(agents.includes('wefinally-release-20260904') || agents.includes('fix/release-review-remediation'), 'AGENTS.md must point at current release worktree/branch')
  assert.ok(agents.includes('wefinally-ai-agent') && /只读|历史|不得部署/.test(agents), 'AGENTS.md must mark old experiment tree as non-deploy')
  assert.ok(agents.includes('RELEASE_MANIFEST_TEMPLATE.md'), 'AGENTS.md must require release manifest')
  assert.ok(agents.includes('selfcheck:qa-pair-reset'), 'AGENTS.md baseline must include qa-pair-reset')

  const handoff = fs.readFileSync(handoffPath, 'utf8')
  assert.ok(handoff.includes('wefinally-release-20260904') || handoff.includes('fix/release-review-remediation-2026-09-04'), 'PROJECT_HANDOFF must name current release branch/worktree')
  assert.ok(handoff.includes('RELEASE_MANIFEST_TEMPLATE.md'), 'PROJECT_HANDOFF must reference release manifest')

  const contributing = fs.readFileSync(contributingPath, 'utf8')
  assert.ok(contributing.includes('selfcheck:qa-pair-reset'), 'CONTRIBUTING must include qa-pair-reset gate')
  assert.ok(contributing.includes('agent-graph') && contributing.includes('check'), 'CONTRIBUTING must include agent-graph check')
  assert.ok(contributing.includes('RELEASE_MANIFEST_TEMPLATE.md'), 'CONTRIBUTING must require release manifest on deploy')

  console.log('PASS release workflow contract')
}

main()

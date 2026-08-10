const http = require('http')

const port = Number(process.env.MEMBER_ADMIN_FIXTURE_PORT || 3101)
const applicationId = 990001
const userId = 990002

let application
let user

function reset(status = 'pending_review') {
  application = {
    id: applicationId,
    user_id: userId,
    assigned_partner_id: 3,
    partner_name: '测试合伙人',
    status,
    revision: 1,
    review_note: '',
    submitted_at: '2026-07-24T00:00:00.000Z',
    profile_snapshot_json: JSON.stringify({
      profile: {
        gender: 2,
        birth_year: 1995,
        height_range: '160-170cm',
        education: '本科',
        circle_id: 1,
        occupation_description: '浏览器审核测试',
        city: '深圳',
        marry_status: '未婚',
        baby_plan: '3-5年内'
      },
      match_setting: {
        age_min: 28,
        age_max: 38,
        height_min: 170,
        height_max: 190,
        min_education: '本科',
        like_marry_status: '仅看未婚',
        like_baby_plan: '3-5年内',
        self_view_text: '测试本人三观',
        target_view_text: '测试期待三观'
      }
    })
  }
  user = { id: userId, member_status: status }
}

reset()

function send(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:3000',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  })
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  try {
    if (req.method === 'POST' && url.pathname === '/__reset') {
      const body = await readBody(req)
      reset(body.status || 'pending_review')
      return send(res, 200, { code: 0, data: { application, user } })
    }
    if (req.method === 'GET' && url.pathname === '/__state') {
      return send(res, 200, { code: 0, data: { application, user } })
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/member-applications') {
      const status = url.searchParams.get('status')
      const list = !status || status === application.status ? [application] : []
      return send(res, 200, { code: 0, data: { list } })
    }
    if (req.method === 'GET' && url.pathname === `/api/admin/member-applications/${applicationId}`) {
      return send(res, 200, { code: 0, data: { application, user } })
    }
    if (req.method === 'PUT' && url.pathname === `/api/admin/member-applications/${applicationId}/review`) {
      const body = await readBody(req)
      const transitions = {
        pending_review: { approve: 'approved', need_more_info: 'need_more_info', reject: 'rejected' },
        approved: { disable: 'disabled' },
        disabled: { restore: 'approved' }
      }
      const nextStatus = transitions[application.status] && transitions[application.status][body.action]
      if (!nextStatus) return send(res, 400, { code: 400, message: '当前状态不能执行该审核操作' })
      if (['need_more_info', 'reject', 'disable'].includes(body.action) && !String(body.reason || '').trim()) {
        return send(res, 400, { code: 400, message: '请填写审核意见' })
      }
      application.status = nextStatus
      application.review_note = String(body.reason || '')
      user.member_status = nextStatus
      return send(res, 200, { code: 0, data: user })
    }
    if (req.method === 'PUT' && url.pathname === `/api/admin/member-applications/${applicationId}/reassign`) {
      const body = await readBody(req)
      if (!Number(body.partner_id) || !String(body.reason || '').trim()) {
        return send(res, 400, { code: 400, message: '请选择接管合伙人并填写原因' })
      }
      application.assigned_partner_id = Number(body.partner_id)
      application.partner_name = `测试合伙人 #${body.partner_id}`
      return send(res, 200, { code: 0, data: { assigned_partner_id: application.assigned_partner_id } })
    }
    return send(res, 404, { code: 404, message: 'fixture route not found' })
  } catch (err) {
    return send(res, 500, { code: 500, message: err.message })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`member admin browser fixture listening on ${port}`)
})

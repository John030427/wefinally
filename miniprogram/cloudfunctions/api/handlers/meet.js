const { first, list, byId, addWithId, updateByDoc, now } = require('../lib/db')
const { currentUser } = require('./user')

function safetyPrompt() {
  return '见面请选白天公共场所，提前告知亲友，保管财物，勿轻信任何转账要求。'
}

function shareToken() {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function guangdong110() {
  return {
    enabled: true,
    appId: 'wxf654be7f2931bfcb',
    path: ''
  }
}

function normalizeLoc(data) {
  return {
    lat: data.lat === undefined || data.lat === null || data.lat === '' ? null : Number(data.lat),
    lng: data.lng === undefined || data.lng === null || data.lng === '' ? null : Number(data.lng)
  }
}

async function findExistingForMatch(userId, matchUserId) {
  const partnerId = Number(matchUserId || 0)
  if (!partnerId) return null
  const rows = await list('meet_report', { user_id: Number(userId), match_user_id: partnerId }, 100)
  rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
  return rows.find((row) => Number(row.status) !== 2) || null
}

async function create(data, wxContext) {
  const user = await currentUser(wxContext)
  if (!data.safety_ack) throw new Error('请先阅读并勾选安全提示')
  if (!/^\d{11}$/.test(String(data.emergency_contact || ''))) throw new Error('请填写 11 位紧急联系人手机号')
  const loc = normalizeLoc(data)
  const matchUserId = Number(data.match_user_id || data.matchUserId || 0)
  const matchLogId = Number(data.match_log_id || data.matchLogId || 0)
  const payload = {
    user_id: user.id,
    match_user_id: matchUserId,
    match_log_id: matchLogId,
    meet_time: data.meet_time || null,
    meet_place: String(data.meet_place || '').trim().slice(0, 120),
    meet_address: String(data.meet_address || '').trim().slice(0, 240),
    lat: loc.lat,
    lng: loc.lng,
    location_source: data.location_source === 'wechat_choose_location' ? 'wechat_choose_location' : '',
    meet_note: data.meet_note || '',
    emergency_contact: data.emergency_contact || '',
    safety_ack: 1,
    safety_prompt: safetyPrompt(),
    status: 0,
    card_no: `SAFE${Date.now()}`,
    share_token: shareToken()
  }
  const existing = await findExistingForMatch(user.id, matchUserId)
  const report = existing
    ? await updateByDoc('meet_report', existing, Object.assign({}, payload, {
      card_no: existing.card_no || payload.card_no,
      share_token: existing.share_token || payload.share_token
    }))
    : await addWithId('meet_report', payload, 'meet_report')
  return {
    id: report.id,
    card_no: report.card_no,
    share_token: report.share_token,
    match_user_id: report.match_user_id || 0,
    match_log_id: report.match_log_id || 0
  }
}

async function meetList(data, wxContext) {
  const user = await currentUser(wxContext)
  const query = { user_id: user.id }
  const matchUserId = Number(data.match_user_id || data.matchUserId || 0)
  if (matchUserId) query.match_user_id = matchUserId
  const rows = await list('meet_report', query, 100)
  rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
  const out = []
  for (let i = 0; i < rows.length; i += 1) {
    const stats = await locationStats(user.id, rows[i].id)
    out.push(Object.assign({}, rows[i], stats))
  }
  return out
}

async function existing(data, wxContext) {
  const user = await currentUser(wxContext)
  const row = await findExistingForMatch(user.id, data.match_user_id || data.matchUserId)
  if (!row) return null
  return Object.assign({}, row, await locationStats(user.id, row.id))
}

async function locationStats(userId, meetReportId) {
  const rows = await list('meet_location_log', { user_id: userId, meet_report_id: Number(meetReportId) }, 100)
  rows.sort((a, b) => new Date(b.create_time || 0).getTime() - new Date(a.create_time || 0).getTime())
  return {
    location_count: rows.length,
    latest_location_time: rows[0] ? rows[0].create_time : null
  }
}

async function detail(data, wxContext) {
  const user = await currentUser(wxContext)
  const row = await byId('meet_report', data.id)
  if (!row || Number(row.user_id) !== Number(user.id)) throw new Error('记录不存在')
  return Object.assign({}, row, await locationStats(user.id, row.id))
}

async function shareDetail(data) {
  const token = String(data.token || '').trim()
  const row = await first('meet_report', { share_token: token })
  if (!row) throw new Error('分享卡不存在')
  return Object.assign({}, row, await locationStats(row.user_id, row.id), {
    emergency_contact: ''
  })
}

async function uploadLocation(data, wxContext) {
  const user = await currentUser(wxContext)
  const meetId = Number(data.id || 0)
  const row = await byId('meet_report', meetId)
  if (!row || Number(row.user_id) !== Number(user.id)) throw new Error('记录不存在')
  const loc = normalizeLoc(data)
  await addWithId('meet_location_log', {
    user_id: user.id,
    meet_report_id: meetId,
    lat: loc.lat,
    lng: loc.lng,
    accuracy: data.accuracy || null,
    source: data.source || 'watch'
  }, 'meet_location')
  return locationStats(user.id, meetId)
}

async function finish(data, wxContext) {
  const user = await currentUser(wxContext)
  const row = await byId('meet_report', data.id)
  if (!row || Number(row.user_id) !== Number(user.id)) throw new Error('记录不存在')
  await updateByDoc('meet_report', row, { status: 1 })
  return { ok: true }
}

async function cancel(data, wxContext) {
  const user = await currentUser(wxContext)
  const row = await byId('meet_report', data.id)
  if (!row || Number(row.user_id) !== Number(user.id)) throw new Error('记录不存在')
  await updateByDoc('meet_report', row, { status: 2 })
  return { ok: true }
}

async function insertSos(userId, meetReportId, loc, emergencyContact) {
  await addWithId('sos_log', {
    user_id: userId,
    meet_report_id: meetReportId || 0,
    lat: loc.lat,
    lng: loc.lng,
    emergency_contact: emergencyContact || ''
  }, 'sos')
  return {
    meet_report_id: meetReportId || 0,
    sosPhone: '110',
    emergency_contact: emergencyContact || '',
    guangdong110: guangdong110()
  }
}

async function homeSos(data, wxContext) {
  const user = await currentUser(wxContext)
  return insertSos(user.id, 0, normalizeLoc(data), '')
}

async function sos(data, wxContext) {
  const user = await currentUser(wxContext)
  const row = await byId('meet_report', data.id)
  if (!row || Number(row.user_id) !== Number(user.id)) throw new Error('记录不存在')
  return insertSos(user.id, row.id, normalizeLoc(data), row.emergency_contact)
}

module.exports = {
  create,
  existing,
  meetList,
  detail,
  shareDetail,
  uploadLocation,
  finish,
  cancel,
  homeSos,
  sos
}

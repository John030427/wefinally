'use strict'
const fs = require('fs')
const path = require('path')
const p = path.join(__dirname, '../public/partner/index.html')
let h = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const oldNav = `        <button class="nav-item active" data-page="dashboard">数据看板</button>
        <button class="nav-item" data-page="audit">用户审核</button>
        <button class="nav-item" data-page="users">推广用户</button>
        <button class="nav-item" data-page="orders">分润订单</button>
        <button class="nav-item" data-page="promote">推广工具</button>
        <button class="nav-item" data-page="withdraw">资金提现</button>
        <button class="nav-item" data-page="profile">账号设置</button>`

const newNav = `        <button class="nav-item active" data-page="dashboard">首页</button>
        <button class="nav-item" data-page="audit">会员审核</button>
        <button class="nav-item" data-page="users">我的用户</button>
        <button class="nav-item" data-page="promote">推广</button>
        <button class="nav-item" data-page="orders">收入</button>
        <button class="nav-item" data-page="withdraw">提现</button>
        <button class="nav-item" data-page="profile">账号</button>`

if (!h.includes(oldNav)) throw new Error('partner nav not found')
h = h.replace(oldNav, newNav)

h = h.replace(
  "const TITLES = { dashboard:'数据看板', audit:'用户审核', users:'推广用户', orders:'分润订单', promote:'推广工具', withdraw:'资金提现', profile:'账号设置' };",
  "const TITLES = { dashboard:'首页', audit:'会员审核', users:'我的用户', orders:'收入', promote:'推广', withdraw:'提现', profile:'账号' };"
)

if (!h.includes('.ws-hero')) {
  h = h.replace('.stats-grid {', `.ws-hero{background:linear-gradient(135deg,#fff,#fff5f7);border:1px solid #f3d6de;border-radius:14px;padding:1.25rem 1.5rem;margin-bottom:1rem}
    .ws-hero h2{font-size:1.35rem;margin-bottom:.35rem}
    .ws-hero p{color:var(--muted);font-size:.9rem}
    .ws-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem}
    .ws-card{background:#fff;border:1px solid #efe4e7;border-radius:12px;padding:1.1rem;margin-bottom:1rem}
    .ws-card h4{margin-bottom:.65rem}
    .ws-metric{display:flex;gap:1.25rem;flex-wrap:wrap}
    .ws-metric div{min-width:100px}
    .ws-metric .k{font-size:.75rem;color:#888}
    .ws-metric .v{font-size:1.35rem;font-weight:700;color:var(--primary)}
    .privacy-note{background:#fff8e1;border:1px solid #f2d879;color:#8a6d1a;border-radius:8px;padding:.65rem .85rem;font-size:.8125rem;margin-bottom:1rem}
    .stats-grid {`)
}

const rdStart = h.indexOf('async function renderDashboard()')
const rdEnd = h.indexOf('function renderCloudDashboard')
if (rdStart < 0 || rdEnd < 0) throw new Error('renderDashboard markers missing')

const newRd = `async function renderDashboard() {
    const data = await api('/partner/dashboard');
    if (data.metrics) {
      renderCloudDashboard(data);
      return;
    }
    state.partner = data.partner;
    const name = data.partner.real_name || data.partner.name || data.partner.username || '合伙人';
    document.getElementById('partnerInfo').textContent = name + ' · ' + (data.partner.promote_code || '');
    const s = data.stats || {};
    let pendingCount = 0;
    try {
      const pending = CLOUD_MEMBER_API
        ? await memberApi('/partner/member-applications?status=pending_review')
        : await api('/partner/users?member_status=pending_review&pageSize=1');
      pendingCount = CLOUD_MEMBER_API ? (pending.list || []).length : Number(pending.total || 0);
    } catch (e) {}
    const hour = new Date().getHours();
    const greet = hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
    document.getElementById('pageContent').innerHTML =
      '<div class="ws-hero"><h2>' + esc(name) + '，' + greet + '</h2>' +
      '<p>今天需要处理：<strong style="color:var(--primary)">' + pendingCount + '</strong> 个会员待审核</p>' +
      '<div class="ws-actions"><button class="btn btn-primary" onclick="navigate(\\'audit\\')">' + (pendingCount ? '开始审核' : '查看审核') + '</button>' +
      '<button class="btn btn-outline" onclick="navigate(\\'promote\\')">查看推广码</button>' +
      '<button class="btn btn-outline" onclick="navigate(\\'withdraw\\')">申请提现</button></div></div>' +
      '<div class="ws-card"><h4>我的推广</h4><div class="ws-metric">' +
      '<div><div class="k">推广用户</div><div class="v">' + Number(s.promoted_users||0) + '</div></div>' +
      '<div><div class="k">有效会员</div><div class="v">' + Number(s.vip_users||0) + '</div></div>' +
      '<div><div class="k">付费订单</div><div class="v">' + Number(s.paid_orders||0) + '</div></div></div></div>' +
      '<div class="ws-card"><h4>我的收入</h4><div class="ws-metric">' +
      '<div><div class="k">可提现</div><div class="v">¥' + Number(data.partner.balance||0).toFixed(2) + '</div></div>' +
      '<div><div class="k">累计分润</div><div class="v">¥' + Number(s.total_commission||0).toFixed(2) + '</div></div>' +
      '<div><div class="k">待处理提现</div><div class="v">' + Number(s.pending_withdrawals||0) + '</div></div></div></div>' +
      '<div class="privacy-note">隐私提示：您只能查看自己推广的用户；手机号已脱敏；无法查看匹配详情或 AI 私聊内容。</div>';
  }

  `

h = h.slice(0, rdStart) + newRd + h.slice(rdEnd)

h = h.replace(
  "rows = '<tr><td colspan=\"6\" class=\"empty\">暂无待审核用户</td></tr>';",
  "rows = '<tr><td colspan=\"6\" class=\"empty\">今天没有待审核会员</td></tr>';"
)
h = h.replace(
  "rows = '<tr><td colspan=\"7\" class=\"empty\">暂无推广用户</td></tr>';",
  "rows = '<tr><td colspan=\"7\" class=\"empty\">暂时还没有推广用户</td></tr>';"
)

h = h.replace(
  "rows += '<tr><td>' + u.id + '</td><td>' + esc(u.nickname || '-') + '</td><td>' + esc(MEMBER_STATUS[u.member_status] || u.member_status) + '</td><td>' + (u.vip_expire_at ? esc(u.vip_expire_at) : '非VIP') + '</td><td>' + esc(u.phone || '-') + '</td><td>' + esc(u.created_at) + '</td><td><button class=\"btn btn-sm btn-outline\" onclick=\"auditUser(' + u.id + ')\">查看</button></td></tr>';",
  "rows += '<tr><td>' + esc(u.support_code || ('用户'+u.id)) + '</td><td>' + esc(u.nickname || '-') + '</td><td>' + esc(MEMBER_STATUS[u.member_status] || u.member_status) + '</td><td>' + (u.vip_expire_at ? esc(u.vip_expire_at) : '非VIP') + '</td><td>' + esc(u.phone_masked || '已脱敏') + '</td><td>' + esc(u.created_at) + '</td><td><button class=\"btn btn-sm btn-outline\" onclick=\"auditUser(' + u.id + ')\">查看</button></td></tr>';"
)
h = h.replace(
  '<th>ID</th><th>昵称</th><th>状态</th><th>VIP到期</th><th>手机</th><th>注册时间</th><th>管理</th>',
  '<th>用户编号</th><th>昵称</th><th>状态</th><th>VIP到期</th><th>手机（脱敏）</th><th>注册时间</th><th>管理</th>'
)

// Audit modal next_action + grouped sections
h = h.replace(
  "'<p>用户：<strong>' + esc(data.user.nickname || data.user.id) + '</strong></p>' +\n        '<p style=\"margin:.5rem 0;font-size:.875rem;color:var(--muted)\">' + esc(data.note) + '</p>' +\n        '<div class=\"form-group\"><label>审核意见</label><textarea id=\"auditReason\" rows=\"3\" placeholder=\"补资料、拒绝或禁用时必须填写\"></textarea></div>',",
  "'<p>用户：<strong>' + esc(data.user.nickname || data.user.support_code || data.user.id) + '</strong></p>' +\n        '<p style=\"margin:.5rem 0;font-size:.875rem;color:var(--muted)\">' + esc(data.next_action || data.note || '') + '</p>' +\n        '<div class=\"privacy-note\">仅内部处理：请勿向他人转发用户资料。</div>' +\n        '<div class=\"form-group\"><label>审核意见</label><textarea id=\"auditReason\" rows=\"3\" placeholder=\"需要补充资料 / 不通过时必须填写原因\"></textarea></div>',"
)

// Withdraw confirmation
if (h.includes('window.submitWithdraw')) {
  h = h.replace(
    /window\.submitWithdraw\s*=\s*async\s*function\s*\(([^)]*)\)\s*\{/,
    (m, args) => `window.submitWithdraw = async function (${args}) {
    if (!window.confirm('确认申请提现？请核对金额后再提交。')) return;`
  )
} else {
  // find withdraw submit inline
  h = h.replace(
    "await api('/partner/withdraw'",
    "if (!window.confirm('确认申请提现？请核对金额后再提交。')) return;\n      await api('/partner/withdraw'"
  )
}

// Profile phone_masked
h = h.replace(/partner\.phone(?!_masked)/g, (m, offset) => {
  // only in profile-ish contexts - safer replace display
  return m
})
h = h.replace(
  "esc(state.partner.phone || '-')",
  "esc(state.partner.phone_masked || '已脱敏')"
)
h = h.replace(
  "esc(data.partner.phone || '-')",
  "esc(data.partner.phone_masked || '已脱敏')"
)

// Success toasts already exist; improve audit toast
h = h.replace("toast('审核完成', 'success');", "toast(action==='approve'?'✓ 审核已通过':action==='need_more_info'?'✓ 已要求用户补充资料':action==='reject'?'✓ 已驳回':'✓ 已完成', 'success');")

// Disable double submit on audit
h = h.replace(
  "window.submitAudit = async function (id, action, applicationId) {\n    const reason = document.getElementById('auditReason')?.value || '';\n    closeModal();\n    try {",
  "window.submitAudit = async function (id, action, applicationId) {\n    if (window.__auditBusy) return;\n    window.__auditBusy = true;\n    const reason = document.getElementById('auditReason')?.value || '';\n    closeModal();\n    try {"
)
h = h.replace(
  "toast('审核完成', 'success');\n      if (state.page === 'audit') renderAudit();\n      else renderUsers();\n    } catch (err) { toast(err.message, 'error'); }\n  };",
  "if (state.page === 'audit') renderAudit();\n      else renderUsers();\n    } catch (err) { toast(err.message, 'error'); }\n    finally { window.__auditBusy = false; }\n  };"
)

fs.writeFileSync(p, h)
console.log('OK partner', p, h.length)

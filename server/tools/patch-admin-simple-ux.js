'use strict'
const fs = require('fs')
const path = require('path')
const p = path.join(__dirname, '../public/admin/index.html')
let h = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const oldNav = `        <button class="nav-item active" data-p="dashboard">数据看板</button>
        <button class="nav-item" data-p="service">客服工作台</button>
        <button class="nav-item" data-p="users">用户管理</button>
        <button class="nav-item" data-p="members">会员审核</button>
        <button class="nav-item" data-p="matches">匹配记录</button>
        <button class="nav-item" data-p="partners">合伙人审核与管理</button>
        <button class="nav-item" data-p="orders">订单对账</button>
        <button class="nav-item" data-p="withdrawals">提现审核</button>
        <button class="nav-item" data-p="marry">婚姻报备</button>
        <button class="nav-item" data-p="cancel">注销/离异</button>
        <button class="nav-item" data-p="stats">公示数据</button>
        <button class="nav-item" data-p="knowledge">AI 知识库</button>
        <button class="nav-item" data-p="chat">客服会话</button>
        <button class="nav-item" data-p="handoff">奔现工单</button>
        <button class="nav-item" data-p="privacy">授权日志</button>
        <button class="nav-item" data-p="whitelist">白名单</button>
        <button class="nav-item" data-p="export">数据导出</button>
        <button class="nav-item" data-p="logs">系统日志</button>`

const newNav = `        <div class="nav-group">首页</div>
        <button class="nav-item active" data-p="dashboard">今日待办</button>
        <div class="nav-group">客服与异常</div>
        <button class="nav-item" data-p="service">客服工作台</button>
        <button class="nav-item" data-p="chat">客服会话</button>
        <button class="nav-item" data-p="handoff">奔现工单</button>
        <div class="nav-group">会员</div>
        <button class="nav-item" data-p="users">用户管理</button>
        <button class="nav-item" data-p="members">会员审核</button>
        <div class="nav-group">匹配与约会</div>
        <button class="nav-item" data-p="matches">匹配与约会</button>
        <div class="nav-group">合伙人</div>
        <button class="nav-item" data-p="partners">合伙人</button>
        <div class="nav-group">订单资金</div>
        <button class="nav-item" data-p="orders">订单对账</button>
        <button class="nav-item" data-p="withdrawals">提现审核</button>
        <button class="nav-item" data-p="marry">婚姻报备</button>
        <button class="nav-item" data-p="cancel">注销/离异</button>
        <div class="nav-group">系统</div>
        <button class="nav-item" data-p="stats">公示数据</button>
        <button class="nav-item" data-p="knowledge">AI 知识库</button>
        <button class="nav-item" data-p="privacy">授权日志</button>
        <button class="nav-item" data-p="whitelist">白名单</button>
        <button class="nav-item" data-p="export">数据导出</button>
        <button class="nav-item" data-p="logs">系统日志</button>`

if (!h.includes(oldNav)) throw new Error('admin nav block not found')
h = h.replace(oldNav, newNav)

if (!h.includes('.nav-group')) {
  h = h.replace('.nav-item.active', `.nav-group{padding:.65rem 1.25rem .2rem;font-size:.7rem;color:rgba(255,255,255,.45)}
    .todo-hero{background:linear-gradient(135deg,#fff,#fff5f7);border:1px solid #f3d6de;border-radius:14px;padding:1.25rem 1.5rem;margin-bottom:1rem}
    .todo-hero h2{font-size:1.35rem;margin-bottom:.35rem}
    .todo-hero p{color:var(--muted);font-size:.9rem}
    .todo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:1.25rem}
    .todo-card{background:#fff;border:1px solid #efe4e7;border-radius:12px;padding:1.1rem;display:flex;flex-direction:column;gap:.55rem;box-shadow:0 2px 8px rgba(0,0,0,.03)}
    .todo-card .t{font-size:.9rem;color:#746b70}
    .todo-card .n{font-size:2rem;font-weight:700;color:#ff6b8a;line-height:1}
    .todo-card .cta{margin-top:auto}
    .priority-row{display:flex;gap:.75rem;align-items:flex-start;padding:.85rem 0;border-bottom:1px solid #f0e6e9}
    .priority-tag{flex:none;font-size:.75rem;padding:.2rem .55rem;border-radius:999px;background:#ffe8ee;color:#c2185b}
    .priority-tag.warn{background:#fff3e0;color:#e65100}
    .priority-tag.ok{background:#e8f5e9;color:#2e7d32}
    .ai-ops-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.75rem}
    .ai-ops-item{background:#faf7f8;border-radius:8px;padding:.75rem}
    .ai-ops-item .k{font-size:.75rem;color:#888}
    .ai-ops-item .v{font-size:1rem;font-weight:600;margin-top:.2rem}
    .privacy-warn{background:#fff8e1;border:1px solid #f2d879;color:#8a6d1a;border-radius:8px;padding:.65rem .85rem;font-size:.8125rem;margin:.5rem 0 1rem}
    .tech-details{margin-top:1rem}
    .tech-details summary{cursor:pointer;color:#888;font-size:.8125rem}
    .nav-item.active`)
}

h = h.replace("dashboard:'数据看板'", "dashboard:'今日待办'")
h = h.replace(
  "const ROLE_PAGES = { customer_service: ['service', 'orders', 'partners'], auditor: ['partners'] };",
  "const ROLE_PAGES = { customer_service: ['dashboard', 'service', 'orders', 'partners', 'chat', 'handoff'], auditor: ['dashboard', 'partners', 'members'], finance: ['dashboard', 'orders', 'withdrawals'] };"
)

const start = h.indexOf('async function pgDashboard()')
const end = h.indexOf('window.setDashRange = function')
if (start < 0 || end < 0) throw new Error('pgDashboard markers missing')

const newDash = `async function pgDashboard() {
    const dash = await api('/admin/dashboard');
    const todos = Array.isArray(dash.todos) ? dash.todos : [
      { key:'members', title:'待审核会员', count: dash.pending_member_applications || 0, priority:'P1', cta:'立即审核', page:'members' },
      { key:'service', title:'待处理客服', count: dash.open_service_tickets || 0, priority:'P1', cta:'去处理', page:'service' },
      { key:'coordination', title:'待处理约会协调', count: dash.stuck_coordinations || 0, priority:'P1', cta:'查看协调', page:'service' },
      { key:'ai', title:'异常 AI 会话', count: dash.ai_failed_today || 0, priority:'P1', cta:'查看异常', page:'service' },
      { key:'withdrawals', title:'待处理提现', count: dash.pending_withdrawals || 0, priority:'P0', cta:'去审核', page:'withdrawals' },
      { key:'partners', title:'待审合伙人', count: dash.pending_partner_approve || 0, priority:'P2', cta:'去审核', page:'partners' }
    ];
    const total = Number(dash.todo_total != null ? dash.todo_total : todos.reduce((s,t)=>s+Number(t.count||0),0));
    const hour = new Date().getHours();
    const greet = hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
    const priLabel = { P0:'紧急', P1:'尽快处理', P2:'普通' };
    const priCls = { P0:'', P1:'warn', P2:'ok' };
    const queue = (dash.priority_queue && dash.priority_queue.length ? dash.priority_queue : todos.filter(t=>Number(t.count)>0));
    const ai = dash.ai_ops || { status: (dash.ai_failed_today||0)>0?'异常':'正常', provider:'CloudBase', model:'HY3', failed_today: dash.ai_failed_today||0, note:'暂无运行统计' };
    const cards = todos.map(t =>
      '<div class="todo-card"><div class="t">' + esc(t.title) + '</div><div class="n">' + Number(t.count||0) + '</div>' +
      '<button class="btn btn-primary btn-sm cta" onclick="go(\\'' + esc(t.page) + '\\')">' + esc(t.cta || '去处理') + '</button></div>'
    ).join('');
    const queueHtml = queue.length
      ? queue.map(t => '<div class="priority-row"><span class="priority-tag ' + (priCls[t.priority]||'') + '">' + (priLabel[t.priority]||'普通') + '</span><div style="flex:1"><strong>' + esc(t.title) + '</strong><div style="font-size:.8125rem;color:#888;margin-top:.2rem">当前有 ' + Number(t.count||0) + ' 项 · 下一步：' + esc(t.cta||'去处理') + '</div></div><button class="btn btn-sm btn-outline" onclick="go(\\'' + esc(t.page) + '\\')">查看</button></div>').join('')
      : '<p class="empty">今天没有优先待办，辛苦了。</p>';
    document.getElementById('content').innerHTML =
      '<div class="todo-hero"><h2>' + greet + ' 👋</h2><p>WeFinally 管理后台 · 今天还有 <strong style="color:#ff6b8a">' + total + '</strong> 项需要处理</p></div>' +
      '<div class="todo-grid">' + cards + '</div>' +
      '<div class="card"><div class="card-hd"><strong>优先处理</strong></div><div class="card-bd">' + queueHtml + '</div></div>' +
      '<div class="card"><div class="card-hd"><strong>系统状态 · AI 服务</strong></div><div class="card-bd">' +
      '<div class="ai-ops-grid">' +
      '<div class="ai-ops-item"><div class="k">AI服务</div><div class="v">' + esc(ai.status) + '</div></div>' +
      '<div class="ai-ops-item"><div class="k">服务提供方</div><div class="v">' + esc(ai.provider||'CloudBase') + '</div></div>' +
      '<div class="ai-ops-item"><div class="k">模型</div><div class="v">' + esc(ai.model||'HY3') + '</div></div>' +
      '<div class="ai-ops-item"><div class="k">今日失败</div><div class="v">' + Number(ai.failed_today||0) + '</div></div>' +
      '</div><p style="margin-top:.75rem;font-size:.8125rem;color:#888">' + esc(ai.note||'暂无运行统计') + '</p>' +
      '<details class="tech-details"><summary>技术详情</summary><p style="font-size:.75rem;color:#999;margin-top:.5rem">正式用户 ' + (dash.users||'-') + ' · VIP ' + (dash.vip_users||'-') + ' · 合伙人 ' + (dash.partners||'-') + ' · 已付订单 ' + (dash.paid_orders||'-') + '</p></details>' +
      '</div></div>';
  }
  `

h = h.slice(0, start) + newDash + h.slice(end)

// OpenID under tech details for non-super: already gated. Force collapse label.
h = h.replace(
  "memberDetailItem('OpenID', adminRole() === 'super_admin' ? user.openid : '-', true)",
  "memberDetailItem('OpenID（技术信息）', adminRole() === 'super_admin' ? (user.openid || '-') : '仅超级管理员可见', true)"
)

// Dangerous withdraw confirm if procW exists
if (h.includes('async function procW') || h.includes('function procW') || h.includes('window.procW')) {
  h = h.replace(/window\.procW\s*=\s*async\s*function\s*\(([^)]*)\)\s*\{/, (m, args) => {
    return `window.procW = async function (${args}) {
    if (!window.confirm('确认处理这笔提现？此操作涉及资金，请核对金额与合伙人信息。')) return;`
  })
}

fs.writeFileSync(p, h)
console.log('OK admin', p, h.length)

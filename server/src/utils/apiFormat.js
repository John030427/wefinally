/** 管理后台 / 合伙人后台 API 字段别名（兼容 SPA 前端） */

function genderLabel(g) {
  if (g === 1 || g === '1') return '男';
  if (g === 2 || g === '2') return '女';
  return '';
}

function formatUserForAdmin(row) {
  if (!row) return row;
  const g = genderLabel(row.gender);
  const nickname = row.nickname || [row.city, g, row.birth_year ? `${row.birth_year}年` : ''].filter(Boolean).join('·') || `用户${row.id}`;
  return {
    ...row,
    nickname,
    phone: row.phone || row.openid ? `${String(row.openid || '').slice(0, 8)}…` : '-',
    vip_expire_at: row.vip_expire_time || row.vip_expire_at || null,
    is_divorced: row.marry_status === '离异' ? 1 : 0,
    created_at: row.create_time || row.created_at,
  };
}

function formatPartnerForAdmin(row) {
  if (!row) return row;
  return {
    ...row,
    username: row.phone || row.username,
    real_name: row.name || row.real_name,
    created_at: row.create_time || row.created_at,
  };
}

function formatOrderForAdmin(row) {
  if (!row) return row;
  return {
    ...row,
    amount: Number(row.price ?? row.amount ?? 0),
    status: row.pay_status ?? row.status,
    settled: row.settle_status === 1 || row.settled === true,
    paid_at: row.pay_time || row.paid_at || null,
    created_at: row.create_time || row.created_at,
    partner_commission: Number(row.partner_commission ?? 0),
  };
}

function formatWithdrawForAdmin(row) {
  if (!row) return row;
  return {
    ...row,
    partner_username: row.partner_name || row.partner_phone || row.partner_username,
    remark: row.remark || '',
    created_at: row.create_time || row.created_at,
  };
}

function formatPartnerUser(row) {
  if (!row) return row;
  const g = genderLabel(row.gender);
  return {
    ...formatUserForAdmin(row),
    vip_expire_at: row.vip_expire_time,
  };
}

function formatPartnerOrder(row) {
  if (!row) return row;
  return {
    ...row,
    amount: Number(row.price ?? 0),
    status: row.pay_status,
    settled: row.settle_status === 1,
    paid_at: row.pay_time || null,
    created_at: row.create_time,
  };
}

function formatChatSession(row) {
  if (!row) return row;
  const g = genderLabel(row.gender);
  return {
    id: row.user_id || row.id,
    user_id: row.user_id,
    nickname: row.nickname || [row.city, g].filter(Boolean).join('·') || `用户${row.user_id}`,
    phone: row.phone || '-',
    updated_at: row.last_time || row.updated_at,
    last_log_id: row.last_log_id,
  };
}

function privacyAuthToAgreements(log) {
  if (!log) return [];
  const list = [];
  if (log.auth_service) list.push({ agreement_type: 'user_service' });
  if (log.auth_privacy) list.push({ agreement_type: 'privacy' });
  if (log.auth_data) list.push({ agreement_type: 'data_auth' });
  return list;
}

module.exports = {
  formatUserForAdmin,
  formatPartnerForAdmin,
  formatOrderForAdmin,
  formatWithdrawForAdmin,
  formatPartnerUser,
  formatPartnerOrder,
  formatChatSession,
  privacyAuthToAgreements,
};

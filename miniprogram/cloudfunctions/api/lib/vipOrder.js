const VIP_PRICE_YUAN = 188
const VIP_DAYS = 30
const PARTNER_COMMISSION = 94
const PLATFORM_INCOME = 94

function cloudDeps() {
  return require('./db')
}

function orderNo() {
  return `WF${Date.now()}${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
}

function paidAtFrom(transaction, now) {
  if (transaction && transaction.success_time) {
    const parsed = new Date(transaction.success_time)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return now()
}

function nextVipExpire(currentExpire, paidAt, days = VIP_DAYS) {
  const current = currentExpire ? new Date(currentExpire) : null
  const base = current && current.getTime() > paidAt.getTime() ? current : paidAt
  return new Date(base.getTime() + days * 86400000)
}

function validatePaidTransaction(order, transaction, config) {
  if (!order) throw new Error('订单不存在')
  if (!transaction) throw new Error('支付通知为空')
  if (transaction.appid !== config.appId) throw new Error('微信支付 appid 不匹配')
  if (transaction.mchid !== config.mchId) throw new Error('微信支付商户号不匹配')
  if (transaction.out_trade_no !== order.order_no) throw new Error('微信支付订单号不匹配')
  if (transaction.trade_state !== 'SUCCESS') throw new Error('微信支付状态不是成功')
  const amount = transaction.amount || {}
  if (Number(amount.total) !== Number(order.amount_total || config.amountTotal)) throw new Error('微信支付金额不匹配')
  if ((amount.currency || 'CNY') !== 'CNY') throw new Error('微信支付币种不匹配')
}

function isUpdated(res) {
  return Number(res && res.stats && res.stats.updated) > 0
}

function normalizeInvoiceInput(input = {}) {
  const invoiceType = String(input.invoice_type || '').trim().toLowerCase()
  const title = String(input.title || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const taxNo = String(input.tax_no || '').replace(/\s+/g, '').toUpperCase()
  if (!['personal', 'company'].includes(invoiceType)) throw new Error('请选择发票类型')
  if (!title || title.length > 100) throw new Error('请填写正确的发票抬头')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Error('请填写正确的接收邮箱')
  if (invoiceType === 'company' && !/^[0-9A-Z]{15,20}$/.test(taxNo)) throw new Error('请填写正确的纳税人识别号')
  return {
    invoice_type: invoiceType,
    invoice_title: title,
    invoice_tax_no: invoiceType === 'company' ? taxNo : '',
    invoice_email: email
  }
}

function publicOrder(order) {
  const payStatus = Number(order && order.pay_status || 0)
  const invoiceStatus = String(order && order.invoice_status || '')
  return {
    order_no: String(order && order.order_no || ''),
    price: Number(order && order.price || VIP_PRICE_YUAN),
    amount_total: Number(order && order.amount_total || 0),
    currency: String(order && order.currency || 'CNY'),
    vip_days: Number(order && order.vip_days || VIP_DAYS),
    pay_status: payStatus,
    is_paid: payStatus === 1,
    trade_state: String(order && order.trade_state || ''),
    pay_time: order && order.pay_time || null,
    create_time: order && order.create_time || null,
    invoice_status: invoiceStatus,
    invoice_requested_at: order && order.invoice_requested_at || null,
    invoice_eligible: payStatus === 1 && !['pending', 'issued'].includes(invoiceStatus)
  }
}

function createVipOrderService(deps = cloudDeps()) {
  const { first, list, addWithId, updateByDoc, col, _, now } = deps

  async function createPendingVipOrder(user, options = {}) {
    return addWithId('user_order', {
      user_id: user.id,
      openid: user.openid,
      order_no: options.orderNo || orderNo(),
      price: VIP_PRICE_YUAN,
      amount_total: Number(options.amountTotal),
      currency: 'CNY',
      vip_days: VIP_DAYS,
      partner_commission: PARTNER_COMMISSION,
      platform_income: PLATFORM_INCOME,
      circle_id: user.circle_id || 0,
      partner_id: user.promote_partner_id || 0,
      pay_status: 0,
      trade_state: 'NOTPAY',
      prepay_id: '',
      transaction_id: '',
      pay_time: null,
      notify_received_at: null,
      pay_error: '',
      vip_granted: 0,
      settle_status: 0
    }, 'order')
  }

  async function savePrepay(order, prepay) {
    return updateByDoc('user_order', order, {
      prepay_id: prepay.prepay_id || '',
      trade_state: 'PREPAY_CREATED',
      pay_error: ''
    })
  }

  async function grantDemoVip(user) {
    return updateByDoc('user', user, {
      is_vip: 1,
      vip_expire_time: nextVipExpire(user.vip_expire_time, now(), VIP_DAYS),
      status: 1
    })
  }

  async function getStatusForUser(user, orderNoValue) {
    const order = await first('user_order', { order_no: orderNoValue, user_id: user.id })
    if (!order) throw new Error('订单不存在')
    return {
      order_no: order.order_no,
      pay_status: Number(order.pay_status || 0),
      is_paid: Number(order.pay_status || 0) === 1,
      trade_state: order.trade_state || '',
      transaction_id: order.transaction_id || '',
      pay_time: order.pay_time || null,
      vip_expire_time: order.vip_expire_time || null
    }
  }

  async function listForUser(user, limit = 20) {
    const rows = await list('user_order', { user_id: Number(user.id) }, Math.max(1, Math.min(Number(limit || 20), 50)))
    return rows
      .slice()
      .sort((a, b) => new Date(b.create_time || 0).getTime() - new Date(a.create_time || 0).getTime())
      .map(publicOrder)
  }

  async function requestInvoiceForUser(user, orderNoValue, input) {
    const order = await first('user_order', {
      order_no: String(orderNoValue || '').trim(),
      user_id: Number(user.id)
    })
    if (!order) throw new Error('订单不存在')
    if (Number(order.pay_status || 0) !== 1) throw new Error('订单支付成功后才能申请发票')
    const currentStatus = String(order.invoice_status || '')
    if (['pending', 'issued'].includes(currentStatus)) {
      return {
        order_no: order.order_no,
        invoice_status: currentStatus,
        invoice_type: order.invoice_type || '',
        invoice_requested_at: order.invoice_requested_at || null,
        idempotent: true
      }
    }
    const normalized = normalizeInvoiceInput(input)
    const requestedAt = now()
    await updateByDoc('user_order', order, Object.assign({}, normalized, {
      invoice_status: 'pending',
      invoice_requested_at: requestedAt,
      invoice_issued_at: null,
      invoice_reject_reason: ''
    }))
    return {
      order_no: order.order_no,
      invoice_status: 'pending',
      invoice_type: normalized.invoice_type,
      invoice_requested_at: requestedAt,
      idempotent: false
    }
  }

  async function finalizePaidVipOrder(transaction, config) {
    const order = await first('user_order', { order_no: transaction.out_trade_no })
    validatePaidTransaction(order, transaction, config)
    const paidAt = paidAtFrom(transaction, now)

    if (Number(order.pay_status || 0) !== 1) {
      await col('user_order').where({ _id: order._id, pay_status: 0 }).update({
        data: {
          pay_status: 1,
          trade_state: 'SUCCESS',
          transaction_id: transaction.transaction_id || '',
          pay_time: paidAt,
          notify_received_at: now(),
          pay_error: ''
        }
      })
    }

    const latestOrder = await first('user_order', { order_no: transaction.out_trade_no })
    if (Number(latestOrder.vip_granted || 0) === 1) {
      return { paid: true, idempotent: true, order: latestOrder }
    }

    const user = await first('user', { id: latestOrder.user_id })
    if (!user) throw new Error('订单用户不存在')
    const expire = nextVipExpire(user.vip_expire_time, paidAt, Number(latestOrder.vip_days || VIP_DAYS))
    const userUpdate = await col('user').where({
      _id: user._id,
      last_vip_order_no: _.neq(latestOrder.order_no)
    }).update({
      data: {
        is_vip: 1,
        vip_expire_time: expire,
        last_vip_order_no: latestOrder.order_no,
        status: 1
      }
    })

    await updateByDoc('user_order', latestOrder, {
      vip_granted: 1,
      vip_expire_time: expire,
      vip_grant_skipped: isUpdated(userUpdate) ? 0 : 1
    })

    return { paid: true, idempotent: !isUpdated(userUpdate), order: latestOrder, vip_expire_time: expire }
  }

  return {
    createPendingVipOrder,
    savePrepay,
    grantDemoVip,
    getStatusForUser,
    listForUser,
    requestInvoiceForUser,
    finalizePaidVipOrder
  }
}

module.exports = {
  createVipOrderService,
  nextVipExpire,
  validatePaidTransaction,
  publicOrder,
  normalizeInvoiceInput
}

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

function createVipOrderService(deps = cloudDeps()) {
  const { first, addWithId, updateByDoc, col, _, now } = deps

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
    finalizePaidVipOrder
  }
}

module.exports = {
  createVipOrderService,
  nextVipExpire,
  validatePaidTransaction
}

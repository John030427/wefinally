const { isVipActive } = require('../lib/format')
const { memberStatus, canPurchaseVip } = require('../lib/memberPolicy')

function defaultDeps() {
  const wechatpay = require('../lib/wechatpay')
  const { createVipOrderService } = require('../lib/vipOrder')
  const user = require('./user')
  const flags = require('../lib/flags')
  return {
    currentUser: user.currentUser,
    flagEnabled: flags.flagEnabled,
    readWechatPayConfig: wechatpay.readWechatPayConfig,
    requestJsapiPrepay: wechatpay.requestJsapiPrepay,
    buildMiniProgramPayParams: wechatpay.buildMiniProgramPayParams,
    orderService: createVipOrderService()
  }
}

function createVipHandlers(overrides = {}) {
  let defaults = null
  function dep(name) {
    if (overrides[name]) return overrides[name]
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }
  const currentUser = dep('currentUser')
  const flagEnabled = dep('flagEnabled')
  const readWechatPayConfig = dep('readWechatPayConfig')
  const requestJsapiPrepay = dep('requestJsapiPrepay')
  const buildMiniProgramPayParams = dep('buildMiniProgramPayParams')
  const orderService = dep('orderService')

  async function info(data, wxContext) {
    const user = await currentUser(wxContext)
    const active = isVipActive(user)
    const demoGrant = await flagEnabled('cloud_demo_vip_grant_enabled')
    return {
      is_vip: active ? 1 : 0,
      isVip: active,
      free_member: Number(user.free_member || 0),
      free_source: user.free_source || '',
      vip_expire_time: user.vip_expire_time,
      expireDate: user.vip_expire_time,
      demo_vip_grant_enabled: demoGrant
    }
  }

  async function purchase(data, wxContext) {
    const user = await currentUser(wxContext)
    if (!canPurchaseVip(memberStatus(user))) {
      throw new Error('会员申请审核通过后才能购买 VIP')
    }
    const config = readWechatPayConfig()
    const demoGrant = await flagEnabled('cloud_demo_vip_grant_enabled')

    if (!config.ready) {
      if (demoGrant && !config.enabled) {
        await orderService.grantDemoVip(user)
        return {
          order_no: '',
          price: 188,
          pay_status: 1,
          payment: null,
          demo_granted: true,
          message: '演示环境已开通 VIP'
        }
      }
      if (config.enabled) throw new Error(`微信支付配置未完成：${config.missing.join(', ')}`)
      return {
        order_no: '',
        price: 188,
        pay_status: 0,
        payment: null,
        demo_granted: false,
        message: '微信支付暂未开启'
      }
    }

    const order = await orderService.createPendingVipOrder(user, {
      amountTotal: config.amountTotal
    })
    const prepay = await requestJsapiPrepay({
      config,
      openid: user.openid,
      orderNo: order.order_no,
      amountTotal: order.amount_total
    })
    await orderService.savePrepay(order, prepay)
    return {
      order_no: order.order_no,
      price: order.price,
      amount_total: order.amount_total,
      pay_status: 0,
      payment: buildMiniProgramPayParams({
        appId: config.appId,
        prepayId: prepay.prepay_id,
        privateKeyPem: config.merchantPrivateKeyPem
      }),
      demo_granted: false,
      message: '订单已创建'
    }
  }

  async function status(data, wxContext) {
    const user = await currentUser(wxContext)
    const orderNo = String(data.order_no || data.orderNo || '').trim()
    if (!orderNo) throw new Error('缺少订单号')
    return orderService.getStatusForUser(user, orderNo)
  }

  return { info, purchase, status }
}

const handlers = {}

async function info(data, wxContext) {
  if (!handlers.instance) handlers.instance = createVipHandlers()
  return handlers.instance.info(data, wxContext)
}

async function purchase(data, wxContext) {
  if (!handlers.instance) handlers.instance = createVipHandlers()
  return handlers.instance.purchase(data, wxContext)
}

async function status(data, wxContext) {
  if (!handlers.instance) handlers.instance = createVipHandlers()
  return handlers.instance.status(data, wxContext)
}

module.exports = {
  info,
  purchase,
  status,
  createVipHandlers
}

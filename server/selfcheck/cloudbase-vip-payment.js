const assert = require('assert')

const {
  createVipOrderService,
  nextVipExpire,
  validatePaidTransaction,
  buildCommissionLedgerEntry
} = require('../../miniprogram/cloudfunctions/api/lib/vipOrder')

function makeFakeDeps() {
  const state = {
    orders: [],
    users: [{
      _id: 'user_1',
      id: 1,
      openid: 'openid_1',
      is_vip: 0,
      vip_expire_time: null,
      status: 1,
      promote_partner_id: 7
    }],
    now: new Date('2026-07-09T00:00:00.000Z'),
    partner_commission_ledger: []
  }
  const collections = {
    user_order: state.orders,
    user: state.users,
    partner_commission_ledger: state.partner_commission_ledger
  }
  function matches(row, query) {
    return Object.keys(query || {}).every((key) => {
      const expected = query[key]
      if (expected && expected.__op === 'neq') return row[key] !== expected.value
      return row[key] === expected
    })
  }
  return {
    state,
    now: () => new Date(state.now),
    _: {
      neq: (value) => ({ __op: 'neq', value })
    },
    first: async (name, query) => (collections[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query, limit) => (collections[name] || [])
      .filter((row) => matches(row, query))
      .slice(0, Number(limit || 100)),
    addWithId: async (name, data, prefix) => {
      const row = Object.assign({}, data, {
        _id: `${prefix || name}_${collections[name].length + 1}`,
        id: collections[name].length + 1,
        create_time: new Date(state.now),
        update_time: new Date(state.now)
      })
      collections[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => {
      const rows = collections[name] || []
      const row = rows.find((item) => item._id === doc._id)
      if (!row) throw new Error('missing doc')
      Object.assign(row, data, { update_time: new Date(state.now) })
      return row
    },
    withCollection: async (name, operation) => operation(),
    col: (name) => ({
      doc: (id) => ({
        set: async ({ data }) => {
          const rows = collections[name] || []
          const existing = rows.find((row) => row._id === id)
          if (existing) Object.assign(existing, data, { _id: id })
          else rows.push(Object.assign({}, data, { _id: id }))
          return { stats: { updated: existing ? 1 : 0 } }
        }
      }),
      where: (query) => ({
        update: async ({ data }) => {
          let updated = 0
          ;(collections[name] || []).forEach((row) => {
            if (matches(row, query)) {
              Object.assign(row, data, { update_time: new Date(state.now) })
              updated += 1
            }
          })
          return { stats: { updated } }
        }
      })
    })
  }
}

async function main() {
  const deps = makeFakeDeps()
  const service = createVipOrderService(deps)
  const user = deps.state.users[0]
  const config = {
    appId: 'wx91c6559ea4490a29',
    mchId: '1747991634',
    amountTotal: 18800
  }

  assert.strictEqual(nextVipExpire(null, new Date('2026-07-09T00:00:00.000Z'), 30).toISOString(), '2026-08-08T00:00:00.000Z')
  assert.strictEqual(nextVipExpire('2026-08-01T00:00:00.000Z', new Date('2026-07-09T00:00:00.000Z'), 30).toISOString(), '2026-08-31T00:00:00.000Z')

  const paidLedger = buildCommissionLedgerEntry({
    partner_id: 7,
    user_id: 1,
    order_no: 'WF_LEDGER_1',
    partner_commission: 94
  }, { eventTime: new Date('2026-07-09T00:00:00.000Z') })
  const refundLedger = buildCommissionLedgerEntry({
    partner_id: 7,
    user_id: 1,
    order_no: 'WF_LEDGER_1',
    partner_commission: 94
  }, { direction: 'debit', reference: 'refund-1' })
  assert.strictEqual(paidLedger.idempotency_key, 'credit:WF_LEDGER_1')
  assert.strictEqual(refundLedger.entry_type, 'refund_reversal')
  assert.notStrictEqual(paidLedger._id, refundLedger._id)

  const order = await service.createPendingVipOrder(user, {
    orderNo: 'WF_TEST_ORDER_1',
    amountTotal: 18800
  })
  assert.strictEqual(order.order_no, 'WF_TEST_ORDER_1')
  assert.strictEqual(order.price, 188)
  assert.strictEqual(order.amount_total, 18800)
  assert.strictEqual(order.pay_status, 0)
  assert.strictEqual(order.vip_granted, 0)

  await service.savePrepay(order, { prepay_id: 'wx_pre_pay_id' })
  assert.strictEqual(deps.state.orders[0].prepay_id, 'wx_pre_pay_id')

  assert.throws(() => validatePaidTransaction(order, {
    appid: config.appId,
    mchid: config.mchId,
    out_trade_no: order.order_no,
    trade_state: 'SUCCESS',
    amount: { total: 1, currency: 'CNY' }
  }, config), /金额/)

  const paid = await service.finalizePaidVipOrder({
    appid: config.appId,
    mchid: config.mchId,
    out_trade_no: order.order_no,
    transaction_id: 'TX_TEST_1',
    trade_state: 'SUCCESS',
    success_time: '2026-07-09T00:00:00+08:00',
    amount: { total: 18800, currency: 'CNY' }
  }, config)

  assert.strictEqual(paid.paid, true)
  assert.strictEqual(deps.state.orders[0].pay_status, 1)
  assert.strictEqual(deps.state.orders[0].vip_granted, 1)
  assert.strictEqual(deps.state.users[0].is_vip, 1)
  assert.strictEqual(deps.state.partner_commission_ledger.length, 1)
  assert.strictEqual(deps.state.partner_commission_ledger[0].direction, 'credit')
  const firstExpire = String(deps.state.users[0].vip_expire_time)

  const duplicate = await service.finalizePaidVipOrder({
    appid: config.appId,
    mchid: config.mchId,
    out_trade_no: order.order_no,
    transaction_id: 'TX_TEST_1',
    trade_state: 'SUCCESS',
    success_time: '2026-07-09T00:00:00+08:00',
    amount: { total: 18800, currency: 'CNY' }
  }, config)

  assert.strictEqual(duplicate.idempotent, true)
  assert.strictEqual(String(deps.state.users[0].vip_expire_time), firstExpire)
  assert.strictEqual(deps.state.partner_commission_ledger.length, 1)

  const status = await service.getStatusForUser(user, order.order_no)
  assert.strictEqual(status.order_no, order.order_no)
  assert.strictEqual(status.pay_status, 1)
  assert.strictEqual(status.is_paid, true)

  deps.state.now = new Date('2026-07-09T00:05:00.000Z')
  await service.createPendingVipOrder(user, {
    orderNo: 'WF_TEST_ORDER_PENDING',
    amountTotal: 18800
  })
  deps.state.orders.push({
    _id: 'order_other_user',
    id: 99,
    user_id: 2,
    order_no: 'WF_OTHER_USER',
    amount_total: 18800,
    price: 188,
    pay_status: 1,
    create_time: new Date('2026-07-09T00:06:00.000Z')
  })
  const orderList = await service.listForUser(user)
  assert.deepStrictEqual(orderList.map((item) => item.order_no), [
    'WF_TEST_ORDER_PENDING',
    'WF_TEST_ORDER_1'
  ])
  assert.strictEqual(orderList[1].invoice_eligible, true)
  assert.strictEqual(orderList[0].invoice_eligible, false)
  assert.strictEqual(orderList.some((item) => item.order_no === 'WF_OTHER_USER'), false)

  const invoice = await service.requestInvoiceForUser(user, order.order_no, {
    invoice_type: 'company',
    title: 'WeFinally 测试有限公司',
    tax_no: '91440300TEST123456',
    email: 'finance@example.com'
  })
  assert.strictEqual(invoice.order_no, order.order_no)
  assert.strictEqual(invoice.invoice_status, 'pending')
  assert.strictEqual(invoice.idempotent, false)
  assert.strictEqual(deps.state.orders[0].invoice_title, 'WeFinally 测试有限公司')
  const duplicateInvoice = await service.requestInvoiceForUser(user, order.order_no, {
    invoice_type: 'company',
    title: '不应覆盖',
    tax_no: '91440300CHANGED1234',
    email: 'changed@example.com'
  })
  assert.strictEqual(duplicateInvoice.idempotent, true)
  assert.strictEqual(deps.state.orders[0].invoice_title, 'WeFinally 测试有限公司')
  await assert.rejects(
    service.requestInvoiceForUser(user, 'WF_TEST_ORDER_PENDING', {
      invoice_type: 'personal', title: '测试用户', email: 'test@example.com'
    }),
    /支付成功/
  )
  await assert.rejects(
    service.requestInvoiceForUser(user, 'WF_OTHER_USER', {
      invoice_type: 'personal', title: '测试用户', email: 'test@example.com'
    }),
    /订单不存在/
  )

  const { createVipHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/vip')
  const fakeUser = Object.assign({}, user, { is_vip: 0, vip_expire_time: null })
  let createdOrder = null
  const handlers = createVipHandlers({
    currentUser: async () => fakeUser,
    flagEnabled: async () => false,
    readWechatPayConfig: () => Object.assign({}, config, {
      enabled: true,
      ready: true,
      merchantPrivateKeyPem: 'PRIVATE_KEY'
    }),
    requestJsapiPrepay: async ({ orderNo, amountTotal }) => {
      assert.strictEqual(orderNo, 'WF_TEST_ORDER_2')
      assert.strictEqual(amountTotal, 18800)
      return { prepay_id: 'wx_prepay_2' }
    },
    requestTransactionByOrderNo: async () => {
      throw new Error('paid status must not query WeChat Pay')
    },
    buildMiniProgramPayParams: () => ({
      timeStamp: '123',
      nonceStr: 'nonce',
      package: 'prepay_id=wx_prepay_2',
      signType: 'RSA',
      paySign: 'pay-sign'
    }),
    orderService: {
      createPendingVipOrder: async () => {
        createdOrder = {
          order_no: 'WF_TEST_ORDER_2',
          price: 188,
          amount_total: 18800,
          pay_status: 0
        }
        return createdOrder
      },
      savePrepay: async (order, prepay) => Object.assign(order, { prepay_id: prepay.prepay_id }),
      getStatusForUser: async () => ({ order_no: 'WF_TEST_ORDER_2', pay_status: 1, is_paid: true }),
      listForUser: async () => [{ order_no: 'WF_TEST_ORDER_2', pay_status: 1, is_paid: true }],
      requestInvoiceForUser: async (invoiceUser, orderNo, input) => ({
        order_no: orderNo,
        invoice_status: 'pending',
        invoice_type: input.invoice_type,
        idempotent: false
      })
    }
  })
  const purchase = await handlers.purchase({}, {})
  assert.strictEqual(createdOrder.order_no, 'WF_TEST_ORDER_2')
  assert.strictEqual(purchase.order_no, 'WF_TEST_ORDER_2')
  assert.strictEqual(purchase.payment.package, 'prepay_id=wx_prepay_2')
  assert.strictEqual(purchase.demo_granted, false)
  const routeStatus = await handlers.status({ order_no: 'WF_TEST_ORDER_2' }, {})
  assert.strictEqual(routeStatus.is_paid, true)
  const routeList = await handlers.list({}, {})
  assert.strictEqual(routeList[0].order_no, 'WF_TEST_ORDER_2')
  const routeInvoice = await handlers.invoice({
    order_no: 'WF_TEST_ORDER_2',
    invoice_type: 'personal',
    title: '测试用户',
    email: 'test@example.com'
  }, {})
  assert.strictEqual(routeInvoice.invoice_status, 'pending')

  let statusReads = 0
  let queriedOrderNo = ''
  let finalizedTransaction = null
  const recoveryHandlers = createVipHandlers({
    currentUser: async () => fakeUser,
    flagEnabled: async () => false,
    readWechatPayConfig: () => Object.assign({}, config, { enabled: true, ready: true }),
    requestJsapiPrepay: async () => ({ prepay_id: 'unused' }),
    buildMiniProgramPayParams: () => ({}),
    requestTransactionByOrderNo: async ({ orderNo }) => {
      queriedOrderNo = orderNo
      return {
        appid: config.appId,
        mchid: config.mchId,
        out_trade_no: orderNo,
        transaction_id: 'TX_QUERY_1',
        trade_state: 'SUCCESS',
        amount: { total: 18800, currency: 'CNY' }
      }
    },
    orderService: {
      getStatusForUser: async () => {
        statusReads += 1
        return statusReads === 1
          ? { order_no: 'WF_QUERY_1', pay_status: 0, is_paid: false }
          : { order_no: 'WF_QUERY_1', pay_status: 1, is_paid: true }
      },
      finalizePaidVipOrder: async (transaction) => {
        finalizedTransaction = transaction
        return { paid: true }
      }
    }
  })
  const recoveredStatus = await recoveryHandlers.status({ order_no: 'WF_QUERY_1' }, {})
  assert.strictEqual(queriedOrderNo, 'WF_QUERY_1')
  assert.strictEqual(finalizedTransaction.transaction_id, 'TX_QUERY_1')
  assert.strictEqual(recoveredStatus.is_paid, true)
  assert.strictEqual(statusReads, 2)

  console.log('PASS - cloudbase vip payment order service')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

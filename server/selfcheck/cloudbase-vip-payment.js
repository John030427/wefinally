const assert = require('assert')

const {
  createVipOrderService,
  nextVipExpire,
  validatePaidTransaction
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
      status: 1
    }],
    now: new Date('2026-07-09T00:00:00.000Z')
  }
  const collections = {
    user_order: state.orders,
    user: state.users
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
    col: (name) => ({
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

  const status = await service.getStatusForUser(user, order.order_no)
  assert.strictEqual(status.order_no, order.order_no)
  assert.strictEqual(status.pay_status, 1)
  assert.strictEqual(status.is_paid, true)

  console.log('PASS - cloudbase vip payment order service')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

const assert = require('assert')
const collections = require('../../miniprogram/cloudfunctions/api/lib/collections')
const {
  canBootstrapCollection
} = require('../../miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy')

assert.strictEqual(collections.partner_referral_attribution, 'partner_referral_attributions')
assert.strictEqual(collections.partner_share_event, 'partner_share_events')
assert.strictEqual(canBootstrapCollection('partner_referral_attribution'), true)
assert.strictEqual(canBootstrapCollection('partner_share_event'), true)
assert.strictEqual(canBootstrapCollection('partner'), false)

console.log('PASS partner attribution and share-event collections use explicit safe bootstrap policy')

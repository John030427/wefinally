'use strict'

const assert = require('assert')
const { STATUS } = require('../../../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')

function assertStatus(coordination, expected) {
  assert.strictEqual(coordination.status, expected)
  return true
}

function assertDirectAccept(coordination) {
  return assertStatus(coordination, STATUS.ARRANGED)
}

function assertDeclined(coordination) {
  return assertStatus(coordination, STATUS.INVITATION_DECLINED)
}

function assertExpired(coordination) {
  return assertStatus(coordination, STATUS.EXPIRED)
}

function assertInviting(coordination) {
  return assertStatus(coordination, STATUS.INVITING_PARTNER)
}

function assertPatchPending(preview) {
  assert.ok(preview)
  assert.ok(['pending_confirmation', 'pending_primary_selection'].includes(preview.status))
  return true
}

function assertNoDirectDbBeforeConfirm(db, coordinationId, versionBefore) {
  const row = (db.tables.date_coordination || []).find((r) => Number(r.id) === Number(coordinationId))
  assert.strictEqual(Number(row.coordination_version || 1), Number(versionBefore))
  return true
}

module.exports = {
  assertStatus,
  assertDirectAccept,
  assertDeclined,
  assertExpired,
  assertInviting,
  assertPatchPending,
  assertNoDirectDbBeforeConfirm
}

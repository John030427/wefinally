'use strict'

const assert = require('assert')

function assertReportGenerated(report) {
  assert.ok(report)
  assert.ok(report.sections && report.sections.length)
  return true
}

function assertAiDisclosure(report) {
  assert.ok(report.disclaimer && report.disclaimer.includes('AI'))
  return true
}

module.exports = {
  assertReportGenerated,
  assertAiDisclosure
}

'use strict'

const path = require('path')
const fs = require('fs')

function formatResult(result) {
  const status = result.pass ? 'PASS' : 'FAIL'
  const lines = [
    `[${status}] ${result.name}`,
    `PERSONAS: ${result.personas || '-'}`,
    `EXPECTED: ${result.expected || '-'}`,
    `ACTUAL: ${result.actual || '-'}`
  ]
  if (result.error) lines.push(`ERROR: ${result.error}`)
  return lines.join('\n')
}

function printSummary(results) {
  const passed = results.filter((r) => r.pass).length
  const failed = results.length - passed
  console.log('\n=== WeFinally E2E Summary ===')
  console.log(`Total: ${results.length}  PASS: ${passed}  FAIL: ${failed}`)
  for (const result of results) {
    console.log('\n' + formatResult(result))
  }
  if (failed > 0) process.exitCode = 1
}

module.exports = {
  formatResult,
  printSummary
}

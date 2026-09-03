'use strict'

/**
 * Truthful AI operations health for admin dashboard.
 * Query failure / missing data => unknown (never fake "正常").
 */

function buildAiOps(input) {
  const data = input || {}
  const expectedProvider = data.expected_provider || process.env.AI_EXPECTED_PROVIDER || 'CloudBase'
  const expectedModel = data.expected_model || process.env.AI_EXPECTED_MODEL || 'HY3'

  if (data.query_failed === true || data.data_available === false) {
    return {
      status: 'unknown',
      status_text: '状态未知',
      provider: null,
      model: null,
      expected_provider: expectedProvider,
      expected_model: expectedModel,
      failed_today: null,
      data_available: false,
      last_run_at: null,
      note: '暂无运行统计'
    }
  }

  const failedToday = Number(data.failed_today || 0)
  const provider = data.provider || null
  const model = data.model || null
  const hasRun = Boolean(data.last_run_at || provider || model || data.has_any_run)

  if (!hasRun && failedToday === 0) {
    return {
      status: 'unknown',
      status_text: '状态未知',
      provider: null,
      model: null,
      expected_provider: expectedProvider,
      expected_model: expectedModel,
      failed_today: 0,
      data_available: true,
      last_run_at: null,
      note: '暂无运行统计'
    }
  }

  if (failedToday > 0) {
    return {
      status: 'degraded',
      status_text: '异常',
      provider,
      model,
      expected_provider: expectedProvider,
      expected_model: expectedModel,
      failed_today: failedToday,
      data_available: true,
      last_run_at: data.last_run_at || null,
      note: '今日存在失败运行，请在客服工作台查看'
    }
  }

  return {
    status: 'normal',
    status_text: '正常',
    provider,
    model,
    expected_provider: expectedProvider,
    expected_model: expectedModel,
    failed_today: 0,
    data_available: true,
    last_run_at: data.last_run_at || null,
    note: '最近运行正常'
  }
}

module.exports = { buildAiOps }

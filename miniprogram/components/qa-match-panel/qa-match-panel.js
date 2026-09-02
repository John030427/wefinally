const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const {
  QA_SCENARIOS,
  buildRequestId,
  sleep,
  refreshQaAccess
} = require('../../utils/qaMatchSimulator')

Component({
  properties: {
    title: {
      type: String,
      value: '匹配模拟'
    }
  },

  data: {
    visible: false,
    resetVisible: false,
    scenarioPickerVisible: false,
    scenario: 'coordinate',
    scenarios: QA_SCENARIOS,
    running: false,
    realMatchCompleted: false,
    countdown: 0,
    statusText: ''
  },

  lifetimes: {
    attached() {
      this.loadAccess()
    },
    detached() {
      this.clearTimers()
    }
  },

  pageLifetimes: {
    show() {
      this.loadAccess(true)
    },
    hide() {
      this.clearTimers()
    }
  },

  methods: {
    clearTimers() {
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer)
        this._countdownTimer = null
      }
    },

    async loadAccess(force = false) {
      const access = await refreshQaAccess({ force })
      this.setData({
        visible: access.enabled,
        resetVisible: access.registrationReplayEnabled,
        realMatchCompleted: String(access.profile && access.profile.match_status || '') === 'matched'
      })
    },

    onToggleScenario() {
      if (!this.data.visible || this.data.running) return
      this.setData({ scenarioPickerVisible: true })
    },

    onScenarioChange(e) {
      const value = e.detail.value
      if (value) this.setData({ scenario: value })
    },

    startCountdown(seconds) {
      this.clearTimers()
      return new Promise((resolve) => {
        let remaining = seconds
        this.setData({ countdown: remaining })
        this._countdownTimer = setInterval(() => {
          remaining -= 1
          if (remaining <= 0) {
            this.clearTimers()
            this.setData({ countdown: 0 })
            resolve()
          } else {
            this.setData({ countdown: remaining })
          }
        }, 1000)
      })
    },

    async pollUntilExecutable(runId, executeAfter) {
      const deadline = new Date(executeAfter).getTime()
      while (Date.now() < deadline) {
        await sleep(500)
        try {
          await get(`${API_PATHS.MATCH_TEST_RUNS}/${runId}`, {}, { showError: false })
        } catch (err) { /* keep polling */ }
      }
      return get(`${API_PATHS.MATCH_TEST_RUNS}/${runId}`, {}, { showError: false })
    },

    async onSimulateMatch() {
      if (!this.data.visible || this.data.running || !this.data.scenarioPickerVisible) return

      this.setData({ running: true, statusText: '创建测试运行…' })
      try {
        const created = await post(API_PATHS.MATCH_TEST_RUNS, {
          request_id: buildRequestId(),
          fixture_journey: this.data.scenario
        }, { showLoading: false, showError: true })

        const runId = created && (created.id || created.run_id)
        const executeAfter = created && created.execute_after
        if (!runId || !executeAfter) throw new Error('测试运行创建失败')

        const waitMs = Math.max(0, new Date(executeAfter).getTime() - Date.now())
        const countdownSec = Math.max(1, Math.ceil(waitMs / 1000))
        this.setData({ statusText: '模拟匹配倒计时…' })
        await this.startCountdown(countdownSec)

        this.setData({ statusText: '等待执行窗口…' })
        await this.pollUntilExecutable(runId, executeAfter)

        this.setData({ statusText: '执行测试匹配…' })
        const executed = await post(`${API_PATHS.MATCH_TEST_RUN_EXECUTE}/${runId}/execute`, {}, {
          showLoading: false,
          showError: true
        })

        const status = executed && executed.status
        const message = (executed && executed.message) || ''
        if (status === 'completed_matched') {
          wx.showToast({ title: '测试匹配成功', icon: 'success' })
          this.setData({ statusText: message || '测试匹配成功' })
          this.triggerEvent('completed', { status, runId, executed })
        } else if (status === 'completed_no_match') {
          wx.showToast({ title: '本轮无匹配', icon: 'none' })
          this.setData({ statusText: message || '本轮无匹配结果' })
          this.triggerEvent('completed', { status, runId, executed })
        } else {
          wx.showToast({ title: message || '测试匹配未成功', icon: 'none' })
          this.setData({ statusText: message || '测试匹配未成功' })
          this.triggerEvent('completed', { status, runId, executed })
        }
      } catch (err) {
        this.setData({ statusText: (err && err.message) || '测试匹配失败' })
      } finally {
        this.setData({ running: false, countdown: 0 })
      }
    },

    async onRealDeviceMatch() {
      if (!this.data.visible || this.data.running) return
      this.setData({ running: true, statusText: '正在检查两台真机资料…' })
      try {
        const result = await post(API_PATHS.MATCH_QA_REAL_DEVICE_START, {
          request_id: buildRequestId(),
          restart_round: this.data.realMatchCompleted
        }, { showLoading: true, loadingText: '正在检查…' })
        const message = (result && result.message) || ''
        if (result && Number(result.matched) === 1) {
          wx.showToast({ title: '双机匹配成功', icon: 'success' })
          this.setData({ statusText: '双机匹配成功，可在匹配记录中查看' })
          this.setData({ realMatchCompleted: true })
          this.triggerEvent('completed', { status: 'matched', runId: '', executed: result })
          return
        }
        if (result && result.status === 'waiting_partner' && this.data.realMatchCompleted) {
          this.setData({ realMatchCompleted: false })
        }
        wx.showToast({ title: message || '暂未匹配', icon: 'none' })
        this.setData({ statusText: message || '暂未匹配' })
      } catch (err) {
        this.setData({ statusText: (err && err.message) || '双机匹配检查失败' })
      } finally {
        this.setData({ running: false })
      }
    },

    onResetRegistration() {
      if (!this.data.resetVisible || this.data.running) return
      wx.showModal({
        title: '重新录入测试资料？',
        content: '仅重置注册资料与择偶配置，不删除账号、会员权益、订单或推广归属。确认后需要重新完成注册。',
        confirmText: '确认重录',
        confirmColor: '#D14D6B',
        success: async (modal) => {
          if (!modal.confirm) return
          this.setData({ running: true, statusText: '正在开启资料重录…' })
          try {
            await post(API_PATHS.QA_REGISTRATION_RESET, {
              request_id: buildRequestId(),
              confirm_text: '重新注册测试资料'
            }, { showLoading: true, loadingText: '正在重置…' })
            getApp().resetLocalForRegistration()
          } catch (err) {
            this.setData({ statusText: (err && err.message) || '开启资料重录失败' })
          } finally {
            this.setData({ running: false })
          }
        }
      })
    }
  }
})

Component({
  options: { addGlobalClass: true },
  properties: {
    type: { type: String, value: 'empty' },        // loading | network | error | empty
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    actionText: { type: String, value: '' },
    icon: { type: String, value: '' }              // 可覆盖默认图标（wf-icon-xxx）
  },
  data: {
    defaultTitle: {
      loading: '正在加载…',
      network: '网络不太顺畅',
      error: '加载失败了',
      empty: '这里还是空的'
    },
    defaultAction: {
      loading: '',
      network: '重新加载',
      error: '重试',
      empty: ''
    },
    defaultIcon: {
      loading: 'wf-icon-clock',
      network: 'wf-icon-refresh',
      error: 'wf-icon-warn',
      empty: 'wf-icon-heart'
    }
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})

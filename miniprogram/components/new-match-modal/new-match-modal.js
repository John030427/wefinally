Component({
  options: { addGlobalClass: true },
  properties: {
    visible: { type: Boolean, value: false },
    match: { type: Object, value: null },          // { gender, ageText, city, matchDate, scoreText }
    showDateCta: { type: Boolean, value: false }   // 业务适合时展示"发起第一次约会建议"
  },
  methods: {
    onView() {
      this.triggerEvent('view')
    },
    onLater() {
      this.triggerEvent('later')
    },
    onDate() {
      this.triggerEvent('date')
    },
    noop() {} // 拦截卡片内点击冒泡，避免误触遮罩
  }
})

Page({
  data: {
    topics: [
      { title: '健康恋爱', desc: '从尊重、坦诚与边界开始，慢慢建立信任。' },
      { title: '初次见面', desc: '提前确认公共场所、时间和彼此舒适的节奏。' },
      { title: '沟通分歧', desc: '先表达感受，再讨论需求，把问题留在问题本身。' }
    ],
    knowledgeNotice: '信息有限时，我会明确说明知识不足，不把猜测当成建议。'
  },

  openConversation() {
    wx.navigateTo({ url: '/pages/chat/chat?agentType=love_advisor' })
  },

  askTopic(e) {
    const topic = e.currentTarget.dataset.topic || ''
    wx.navigateTo({
      url: `/pages/chat/chat?agentType=love_advisor&prompt=${encodeURIComponent(`想聊聊${topic}`)}`
    })
  }
})

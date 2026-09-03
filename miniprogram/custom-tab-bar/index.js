const { TAB_ITEMS, tabIndexForRoute } = require('../utils/tabBarState')

Component({
  data: {
    selected: 0,
    items: TAB_ITEMS
  },

  methods: {
    syncForRoute(route) {
      const selected = tabIndexForRoute(route)
      if (selected >= 0 && selected !== this.data.selected) this.setData({ selected })
    },

    onSwitch(e) {
      const route = String(e.currentTarget.dataset.route || '')
      const selected = tabIndexForRoute(route)
      if (selected < 0 || selected === this.data.selected) return
      this.setData({ selected })
      wx.switchTab({ url: TAB_ITEMS[selected].route })
    }
  }
})

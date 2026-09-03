Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    match: {
      type: Object,
      value: null
    }
  },

  methods: {
    onView() {
      this.triggerEvent('view')
    },

    onDismiss() {
      this.triggerEvent('dismiss')
    },

    preventMove() {}
  }
})

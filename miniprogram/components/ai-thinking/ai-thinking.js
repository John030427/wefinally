Component({
  options: { addGlobalClass: true },
  properties: {
    text: { type: String, value: 'AI 正在整理回复…' },
    label: { type: String, value: 'AI 生成中' },
    compact: { type: Boolean, value: false }   // 行内小尺寸（用于卡片内嵌）
  }
})

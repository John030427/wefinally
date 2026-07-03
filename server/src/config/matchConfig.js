// 匹配可调参数：软分权重 / 软分门槛 / 硬条件开关。按用户池大小在这里调，不要写死在 service 里。
module.exports = {
  avoidRematch: true,       // 跨批次去重：同一对已匹配过则不再配
  smallPoolFallback: false, // 小池兜底：无人过软分门槛时，放宽软分(硬条件仍守)，默认关，早期由运营开
  useAppearanceInMatch: false, // 丙启用且有标签时才计入；默认关
  // 各维度满分（软分，命中给满分）
  weights: {
    baby: 30,      // 婚育节奏一致
    view: 25,      // 三观文本契合度
    psych: 18,     // 轻量心理/关系偏好
    appearance: 10, // 外貌（我方期待 vs 对方实际 标签重合）
    age: 15,       // 年龄落在区间
    height: 12,    // 身高落在区间
    education: 8,  // 学历达标
    circle: 6,     // 偏好圈层命中
    city: 4,       // 同城
  },
  minSideScore: 20, // 双向各自最低软分，低于则不配（次级质量线）
  qualityGate: {
    enabled: true,              // 严格上线口径：默认宁可少配，也不输出低质量匹配
    minSideScore: 90,           // 双方各自分都要过线
    minViewSimilarity: 40,      // 三观文本明显不合直接拒绝
    minPsychScore: 50,          // 心理/关系偏好充分比较后低于此值拒绝
    minPsychCompared: 3,        // 至少比较 3 项后才启用心理硬门槛，避免误杀老用户
    allowSmallPoolFallback: true,
  },
  // 硬条件：开启后不满足直接一票否决（仅当用户设了对应偏好才校验）
  hard: {
    age: true,           // 已确认：年龄区间硬过滤
    height: false,       // 待身高改区间稳定后再开
    minEducation: false, // 待定：是否设最低学历硬门槛
  },
  // 学历层级（低→高），用于"达标/最低门槛"比较：大专 < 本科 < 硕士 < 博士
  educationRank: { 高中及以下: 0, 大专: 1, 本科: 2, 硕士: 3, 博士: 4 },
};

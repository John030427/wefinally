const FIXTURE_BATCH_KEY = 'wf_match_realism_20260812_v1'

const PSYCH = {
  stable: { marriage_pace: '稳定推进', conflict_style: '及时沟通', security_space: '亲密也独立', family_boundary: '边界清晰', money_view: '共同规划', career_family: '动态平衡' },
  steady: { marriage_pace: '先磨合再定', conflict_style: '冷静后沟通', security_space: '亲密也独立', family_boundary: '小家庭优先', money_view: '稳健储蓄', career_family: '动态平衡' },
  independent: { marriage_pace: '顺其自然', conflict_style: '需要空间', security_space: '重视个人空间', family_boundary: '边界清晰', money_view: '相对独立', career_family: '事业优先' },
  family: { marriage_pace: '稳定推进', conflict_style: '及时沟通', security_space: '高陪伴感', family_boundary: '大家庭融合', money_view: '共同规划', career_family: '家庭优先' }
}

function profile(fixtureKey, data) {
  const row = Object.assign({
    fixture_key: fixtureKey,
    fixture_batch_key: FIXTURE_BATCH_KEY,
    fixture_scope: 'matching_only',
    fixture_access_mode: 'public_test_pool',
    profile_origin: 'synthetic_fixture',
    fixture_notice: '纯虚构测试画像，仅用于匹配效果评估，禁止消息、约会、支付、分润及真实运营',
    is_test_fixture: 1,
    is_match_effect_fixture: 1,
    member_status: 'approved',
    status: 1,
    match_eligible: 1,
    allow_messaging: 0,
    allow_date_coordination: 0,
    allow_meet_safety: 0,
    allow_payment: 0,
    allow_commission: 0,
    allow_referral_metrics: 0,
    appearance_description: '',
    appearance_want: '',
    smoking_status: '不吸烟',
    drinking_status: '基本不饮酒'
  }, data)
  if (!row.height_range) row.height_range = row.gender === 1 ? '175-180cm' : '160-165cm'
  if (!row.education) row.education = '本科'
  if (!row.circle_id) row.circle_id = 1
  if (row.setting) {
    row.setting = Object.assign({
      age_min: 24,
      age_max: 42,
      height_min: 155,
      height_max: 190,
      min_education: '大专',
      like_circle_ids: '',
      like_baby_plan: row.baby_plan || ''
    }, row.setting)
  }
  return row
}

function setting(selfView, targetView, otherRequirements, psych, extra) {
  const sharedValues = psych ? '真诚责任稳定沟通共同规划尊重边界' : ''
  return Object.assign({
    self_view_text: sharedValues || selfView,
    target_view_text: sharedValues || targetView,
    values_context: `${selfView}；${targetView}`,
    other_requirements: otherRequirements,
    psych_profile_json: psych ? JSON.stringify(psych) : null
  }, extra || {})
}

const REALISTIC_MATCH_PROFILES = [
  profile('wf_real_01_m_st_shenzhen_product', { gender: 1, age: 31, city: '深圳', hometown: '汕头', occupation: '互联网产品经理', marry_status: '未婚', baby_plan: '2-3年内', appearance_description: '清爽匀称，短发，日常穿搭简洁', appearance_want: '自然大方、亲和、穿搭简洁', setting: setting('重承诺与财务透明，愿意共同承担家务和照顾双方父母', '希望对方情绪稳定，愿意认真进入婚姻并共同规划生活', '希望对方是汕头人或长期认同潮汕生活；计划两年内回汕头发展，可接受先异地后落地', PSYCH.stable) }),
  profile('wf_real_02_f_st_teacher', { gender: 2, age: 29, city: '汕头', occupation: '职业教育教师', marry_status: '未婚', baby_plan: '2-3年内', appearance_description: '自然白净，亲和，长发，穿着朴素', appearance_want: '干净清爽、匀称、有运动习惯', setting: setting('工作稳定，重视家庭也重视两个人共同决定', '希望对方工作稳定，愿意共同承担家务和育儿', '希望对方是汕头人或愿意长期在汕头周边生活；重要节日公平协调双方家庭', PSYCH.stable) }),
  profile('wf_real_03_m_gz_finops', { gender: 1, age: 34, city: '广州', occupation: '金融运营管理', marry_status: '未婚', baby_plan: '2-3年内', drinking_status: '商务场合少量饮酒', appearance_description: '成熟整洁，戴眼镜，商务休闲', appearance_want: '自然、有气质、整洁', setting: setting('重视直接沟通和稳定生活，也尊重双方职业选择', '希望对方不冷战，愿意保留固定共同时间', '未来五年留广州；可接受对方工作忙，但希望每周有固定共同时间', PSYCH.steady) }),
  profile('wf_real_04_f_gz_medadmin', { gender: 2, age: 32, city: '广州', occupation: '医疗机构行政', marry_status: '未婚', baby_plan: '2-3年内', drinking_status: '偶尔饮酒', appearance_description: '温柔自然，匀称，日常简洁', appearance_want: '成熟稳重、整洁，戴眼镜也可', setting: setting('尊重职业边界，遇事冷静后沟通', '希望对方稳健负责，并与父母保持健康边界', '不接受长期异地；双方父母可以关心，但不介入日常决定', PSYCH.steady) }),
  profile('wf_real_05_m_sz_chaoshan_hardware', { gender: 1, age: 30, city: '深圳', hometown: '潮汕', occupation: '硬件工程师', marry_status: '未婚', baby_plan: '3-5年内', drinking_status: '偶尔饮酒', appearance_description: '清爽偏瘦，短发，休闲穿搭', appearance_want: '自然、温柔、有亲和力', setting: setting('独立务实，愿意协商长期城市安排', '希望对方理解项目期加班，并认真讨论未来', '偏好汕头人；愿意最终回潮汕，但至少三年内需留深圳积累职业经验', PSYCH.steady) }),
  profile('wf_real_06_f_st_civil_design', { gender: 2, age: 28, city: '汕头', occupation: '建筑设计', marry_status: '未婚', baby_plan: '3-5年内', appearance_description: '白净长发，温柔，穿搭简洁', appearance_want: '干净稳重、不过度应酬', setting: setting('重家庭联系，也希望伴侣认真经营婚姻', '希望对方重家庭并能在汕头稳定生活', '希望对方是汕头人；一年内能回汕头或已在汕头，不考虑连续三年以上异地', PSYCH.family) }),
  profile('wf_real_07_m_st_foodops', { gender: 1, age: 35, city: '汕头', occupation: '餐饮供应链管理', marry_status: '未婚', baby_plan: '2-3年内', drinking_status: '工作应酬偶尔饮酒', appearance_description: '稳重偏壮，短发，商务休闲', appearance_want: '大方自然、健康匀称', setting: setting('认可家庭参与，但日常小事由两个人决定', '希望对方理解餐饮行业周末忙与平日调休', '希望对方能接受周末工作；优先汕头或揭阳人，婚后常住汕头', PSYCH.family) }),
  profile('wf_real_08_f_jy_remote_ecom', { gender: 2, age: 31, city: '揭阳', occupation: '远程电商运营', marry_status: '未婚', baby_plan: '2-3年内', drinking_status: '偶尔饮酒', appearance_description: '自然微胖，亲和，长发', appearance_want: '成熟整洁，体型不限但重健康', setting: setting('重视个人空间，也愿意共同规划财务', '希望对方可靠并公平分担家务照护', '可迁往汕头，但希望保留远程工作；不能默认女方承担全部家务和照护', PSYCH.steady) }),
  profile('wf_real_09_m_gz_business40', { gender: 1, age: 40, city: '广州', occupation: '小型企业经营', marry_status: '未婚', baby_plan: '尽快', drinking_status: '商务饮酒较多', appearance_description: '成熟稳重，偏商务', appearance_want: '自然温柔，年龄感偏年轻', setting: setting('希望快速建立家庭，家庭参与度较高', '仅接受27-34岁、生活稳定的对象', '两年内结婚生育，不接受长期观察关系', PSYCH.family, { age_min: 27, age_max: 34 }) }),
  profile('wf_real_10_f_sz_visual26', { gender: 2, age: 26, city: '深圳', occupation: '视觉设计师', marry_status: '未婚', baby_plan: '5年后', drinking_status: '偶尔饮酒', appearance_description: '时尚短发，偏瘦', appearance_want: '清爽、有审美、不过度商务', setting: setting('事业发展优先，希望充分相处后再决定婚姻', '希望对方尊重个人空间与职业成长', '事业发展优先，不接受一年内催婚催育', PSYCH.independent, { age_min: 27, age_max: 35 }) }),
  profile('wf_real_11_m_st_architect', { gender: 1, age: 32, city: '汕头', occupation: '建筑项目管理', marry_status: '未婚', baby_plan: '2-3年内', appearance_description: '干净匀称，穿搭简洁', appearance_want: '自然亲和、有气质', setting: setting('重视共同规划和清晰家庭边界', '希望对方愿意长期在汕头生活', '汕头常住是不可协商条件', PSYCH.stable, { must_city: '汕头' }) }),
  profile('wf_real_12_f_sh_biomed', { gender: 2, age: 30, city: '上海', occupation: '生物医药研发', marry_status: '未婚', baby_plan: '3-5年内', appearance_description: '白净戴眼镜，自然简洁', appearance_want: '清爽稳重、有阅读习惯', setting: setting('职业路径明确，重视长期规划与平等沟通', '希望对方尊重科研职业', '未来五年以上留上海，不考虑迁往潮汕；可接受对方来自汕头，但不能要求回乡定居', PSYCH.stable) }),
  profile('wf_real_13_m_sz_sales', { gender: 1, age: 33, city: '深圳', occupation: '企业销售', marry_status: '未婚', baby_plan: '1-2年内', smoking_status: '偶尔吸烟', drinking_status: '社交饮酒', appearance_description: '阳光偏高，商务休闲', appearance_want: '温柔自然、亲和', setting: setting('重家庭，希望较高陪伴感', '希望对方接受应酬并愿意较快进入婚育计划', '希望对方能接受应酬和较高联系频率', PSYCH.family, { age_min: 27, age_max: 33 }) }),
  profile('wf_real_14_f_sz_accountant', { gender: 2, age: 30, city: '深圳', occupation: '财务分析', marry_status: '未婚', baby_plan: '倾向不生育', appearance_description: '整洁自然，匀称，戴眼镜', appearance_want: '干净稳重、生活规律', setting: setting('独立生活，重视个人空间与规律作息', '希望对方少应酬、不吸烟并尊重不生育立场', '吸烟和频繁酒局是明确减分项；不接受以结婚为前提要求改变不生育立场', PSYCH.independent) }),
  profile('wf_real_15_m_fs_technician_missing', { gender: 1, age: 29, city: '佛山', occupation: '自动化设备技术员', marry_status: '未婚', baby_plan: '', drinking_status: '', appearance_description: '', appearance_want: '', setting: setting('认真、踏实', '合得来', '', null) }),
  profile('wf_real_16_f_gz_finassist_missing', { gender: 2, age: 27, city: '广州', occupation: '财务助理', marry_status: '未婚', baby_plan: '', smoking_status: '', drinking_status: '', appearance_description: '', appearance_want: '', setting: setting('', '人好', '以后可能去其他城市，但尚未决定', null) }),
  profile('wf_real_17_m_st_hospital_admin', { gender: 1, age: 36, city: '汕头', occupation: '医院行政', marry_status: '未婚', baby_plan: '2-3年内', appearance_description: '清爽成熟，匀称，戴眼镜', appearance_want: '自然有气质、整洁成熟', setting: setting('生活规律，重视共同承担家庭事务', '希望对方沟通直接、生活规律', '希望留汕头；双方照顾父母时按实际需要分工，不默认由女方承担', PSYCH.stable) }),
  profile('wf_real_18_f_st_legal', { gender: 2, age: 33, city: '汕头', occupation: '法务', marry_status: '未婚', baby_plan: '2-3年内', drinking_status: '偶尔饮酒', appearance_description: '自然有气质，匀称简洁', appearance_want: '成熟清爽、戴眼镜、健康', setting: setting('工作和家庭边界清晰，责任明确', '希望对方情绪稳定并共同承担家庭事务', '希望汕头常住；不接受把所有家务与父母照护视为女性责任', PSYCH.stable, { age_min: 33, age_max: 40 }) }),
  profile('wf_real_19_m_sz_game_artist', { gender: 1, age: 28, city: '深圳', occupation: '游戏美术', marry_status: '未婚', baby_plan: '不考虑', drinking_status: '偶尔饮酒', appearance_description: '文艺长发，偏瘦休闲', appearance_want: '时尚、有个性、不拘传统', setting: setting('事业与个人空间优先，接受夜间工作节奏', '希望对方独立、接受夜猫子和宠物', '必须接受猫；不考虑回潮汕定居；希望保持相对独立的生活空间', PSYCH.independent, { age_min: 24, age_max: 31 }) }),
  profile('wf_real_20_f_st_preschool', { gender: 2, age: 27, city: '汕头', occupation: '幼儿教育', marry_status: '未婚', baby_plan: '1-2年内', appearance_description: '温柔自然，长发', appearance_want: '阳光清爽、短发、生活健康', setting: setting('早睡早起，重家庭陪伴并喜欢孩子', '希望对方生活规律、喜欢孩子并愿意回汕头', '对猫严重不适，无法共同养宠物；希望婚后在汕头，不能接受长期昼夜颠倒', PSYCH.family, { age_min: 27, age_max: 33 }) })
]

const REALISTIC_MATCH_PAIRS = [
  { a: 'wf_real_01_m_st_shenzhen_product', b: 'wf_real_02_f_st_teacher', expected_tier: 'high_fit', reason: '汕头落地、婚育节奏、三观与外貌偏好双向契合' },
  { a: 'wf_real_03_m_gz_finops', b: 'wf_real_04_f_gz_medadmin', expected_tier: 'high_fit', reason: '广州同城、职业与家庭边界高度一致' },
  { a: 'wf_real_05_m_sz_chaoshan_hardware', b: 'wf_real_06_f_st_civil_design', expected_tier: 'medium_fit', reason: '身份偏好契合，但回汕头时间表冲突' },
  { a: 'wf_real_07_m_st_foodops', b: 'wf_real_08_f_jy_remote_ecom', expected_tier: 'edge_pass', reason: '潮汕落地可行，周末工作和家务分配需确认' },
  { a: 'wf_real_09_m_gz_business40', b: 'wf_real_10_f_sz_visual26', expected_tier: 'hard_reject', reason: '年龄硬筛及婚育节奏冲突' },
  { a: 'wf_real_11_m_st_architect', b: 'wf_real_12_f_sh_biomed', expected_tier: 'hard_reject', reason: '汕头常住与上海长期规划硬冲突' },
  { a: 'wf_real_13_m_sz_sales', b: 'wf_real_14_f_sz_accountant', expected_tier: 'one_way_high', reason: '吸烟酒局、陪伴强度与生育立场导致双向显著不对称' },
  { a: 'wf_real_15_m_fs_technician_missing', b: 'wf_real_16_f_gz_finassist_missing', expected_tier: 'missing_data', reason: '婚育、关系六维和外貌证据大量缺失' },
  { a: 'wf_real_17_m_st_hospital_admin', b: 'wf_real_18_f_st_legal', expected_tier: 'high_fit_appearance', reason: '同城、作息、家庭边界与外貌气质双向覆盖' },
  { a: 'wf_real_19_m_sz_game_artist', b: 'wf_real_20_f_st_preschool', expected_tier: 'supplement_conflict', reason: '宠物、生育、作息和定居城市直接冲突' }
]

function buildOwnedRealismProfiles(ownerUserId, options = {}) {
  const ownerId = Number(ownerUserId || 0)
  if (!Number.isInteger(ownerId) || ownerId <= 0) throw new Error('测试发起者 user_id 无效')
  const referenceYear = Number(options.referenceYear || 2026)
  const expiresAt = options.expiresAt || '2026-08-19T00:00:00.000Z'
  return REALISTIC_MATCH_PROFILES.map((row, index) => {
    const userId = Number(options.startUserId || 900001) + index
    return Object.assign({}, row, {
      id: userId,
      birth_year: referenceYear - Number(row.age),
      fixture_owner_user_id: ownerId,
      ab_test_owner_user_id: ownerId,
      fixture_expires_at: expiresAt,
      ab_test_expires_at: expiresAt,
      setting: Object.assign({}, row.setting, { user_id: userId })
    })
  })
}

module.exports = {
  FIXTURE_BATCH_KEY,
  REALISTIC_MATCH_PROFILES,
  REALISTIC_MATCH_PAIRS,
  buildOwnedRealismProfiles
}

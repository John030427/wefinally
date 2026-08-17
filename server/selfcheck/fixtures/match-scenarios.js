const MATCH_SCENARIO_NAMES = [
  'high_fit',
  'medium_fit',
  'edge_pass',
  'hard_reject',
  'missing_data'
]

const PSYCH_STABLE = {
  marriage_pace: '稳定推进',
  conflict_style: '及时沟通',
  security_space: '亲密也独立',
  family_boundary: '边界清晰',
  money_view: '共同规划',
  career_family: '动态平衡'
}

const PSYCH_ADJACENT = {
  marriage_pace: '先磨合再定',
  conflict_style: '冷静后沟通',
  security_space: '高陪伴感',
  family_boundary: '小家庭优先',
  money_view: '稳健储蓄',
  career_family: '家庭优先'
}

function profileJson(value) {
  return value ? JSON.stringify(value) : null
}

function baseScenario() {
  const year = new Date().getFullYear()
  const owner = {
    id: 101,
    gender: 1,
    birth_year: year - 34,
    height_range: '175-180cm',
    education: '本科',
    circle_id: 1,
    city: '深圳',
    baby_plan: '3-5年内',
    appearance_description: '清爽简洁，喜欢运动',
    appearance_want: '干净简洁，喜欢运动'
  }
  const candidate = {
    id: 202,
    gender: 2,
    birth_year: year - 31,
    height_range: '160-165cm',
    education: '本科',
    circle_id: 1,
    city: '深圳',
    baby_plan: '3-5年内',
    appearance_description: '干净简洁，自然大方',
    appearance_want: '清爽简洁，喜欢运动'
  }
  const ownerSetting = {
    user_id: owner.id,
    age_min: 28,
    age_max: 38,
    height_min: 158,
    height_max: 170,
    min_education: '本科',
    like_circle_ids: '1',
    like_baby_plan: '3-5年内',
    self_view_text: '真诚责任稳定沟通共同规划',
    target_view_text: '温柔独立热爱生活彼此尊重',
    psych_profile_json: profileJson(PSYCH_STABLE)
  }
  const candidateSetting = {
    user_id: candidate.id,
    age_min: 30,
    age_max: 40,
    height_min: 172,
    height_max: 185,
    min_education: '本科',
    like_circle_ids: '1',
    like_baby_plan: '3-5年内',
    self_view_text: ownerSetting.target_view_text,
    target_view_text: ownerSetting.self_view_text,
    psych_profile_json: profileJson(Object.assign({}, PSYCH_STABLE, {
      conflict_style: '冷静后沟通'
    }))
  }
  return { owner, candidate, ownerSetting, candidateSetting }
}

function scenarioDefinition(name) {
  if (name === 'high_fit') {
    return {
      expected: {
        hardReject: false,
        qualityPass: true,
        normalizedRange: [90, 99],
        viewRange: [90, 100],
        qualityReasons: []
      }
    }
  }

  if (name === 'medium_fit') {
    return {
      mutate({ owner, candidate, ownerSetting, candidateSetting }) {
        ownerSetting.like_circle_ids = '9'
        candidateSetting.like_circle_ids = '9'
        ownerSetting.psych_profile_json = profileJson(PSYCH_STABLE)
        candidateSetting.psych_profile_json = profileJson(PSYCH_ADJACENT)
        owner.appearance_description = ''
        owner.appearance_want = ''
        candidate.appearance_description = ''
        candidate.appearance_want = ''
        candidate.city = '广州'
      },
      expected: {
        hardReject: false,
        qualityPass: true,
        normalizedRange: [80, 90],
        viewRange: [90, 100],
        qualityReasons: []
      }
    }
  }

  if (name === 'edge_pass') {
    return {
      mutate({ owner, candidate, ownerSetting, candidateSetting }) {
        ownerSetting.height_min = null
        ownerSetting.height_max = null
        candidateSetting.height_min = null
        candidateSetting.height_max = null
        ownerSetting.min_education = ''
        candidateSetting.min_education = ''
        ownerSetting.like_circle_ids = ''
        candidateSetting.like_circle_ids = ''
        ownerSetting.psych_profile_json = null
        candidateSetting.psych_profile_json = null
        owner.appearance_description = '清爽休闲'
        owner.appearance_want = '干净运动'
        candidate.appearance_description = '干净自然'
        candidate.appearance_want = '清爽简洁'
      },
      expected: {
        hardReject: false,
        qualityPass: true,
        normalizedRange: [90, 99],
        viewRange: [90, 100],
        qualityReasons: []
      }
    }
  }

  if (name === 'hard_reject') {
    return {
      mutate({ candidate, ownerSetting }) {
        candidate.birth_year = new Date().getFullYear() - 24
        ownerSetting.age_min = 30
        ownerSetting.age_max = 40
      },
      expected: {
        hardReject: true
      }
    }
  }

  if (name === 'missing_data') {
    return {
      mutate({ owner, candidate, ownerSetting, candidateSetting }) {
        owner.baby_plan = ''
        candidate.baby_plan = ''
        owner.height_range = ''
        candidate.height_range = ''
        owner.education = ''
        candidate.education = ''
        owner.appearance_description = ''
        owner.appearance_want = ''
        candidate.appearance_description = ''
        candidate.appearance_want = ''
        ownerSetting.like_baby_plan = '3-5年内'
        candidateSetting.like_baby_plan = '3-5年内'
        ownerSetting.height_min = null
        ownerSetting.height_max = null
        candidateSetting.height_min = null
        candidateSetting.height_max = null
        ownerSetting.min_education = ''
        candidateSetting.min_education = ''
        ownerSetting.psych_profile_json = null
        candidateSetting.psych_profile_json = null
      },
      expected: {
        hardReject: false,
        qualityPass: false,
        normalizedRange: [60, 70],
        viewRange: [90, 100],
        qualityReasons: ['side_score']
      }
    }
  }

  throw new Error(`未知匹配测试场景：${name}`)
}

function buildMatchScenario(name) {
  const definition = scenarioDefinition(name)
  const fixture = baseScenario()
  if (definition.mutate) definition.mutate(fixture)
  return {
    name,
    owner: fixture.owner,
    candidate: fixture.candidate,
    settingsByUserId: {
      [String(fixture.owner.id)]: fixture.ownerSetting,
      [String(fixture.candidate.id)]: fixture.candidateSetting
    },
    expected: definition.expected
  }
}

module.exports = {
  MATCH_SCENARIO_NAMES,
  buildMatchScenario
}

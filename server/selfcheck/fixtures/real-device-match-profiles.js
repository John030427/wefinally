const VALUES = '真诚沟通共同规划稳定生活尊重边界一起成长经营家庭'

function user(id, fields) {
  return Object.assign({
    id,
    status: 1,
    member_status: 'approved',
    is_vip: 1,
    match_status: 'idle',
    matched_partner_id: 0,
    city: '深圳',
    city_name: '深圳',
    province_code: '440000',
    education: '本科',
    baby_plan: '2-3年内',
    circle_id: 1,
    appearance_description: '清爽自然健康',
    appearance_want: '清爽自然健康'
  }, fields)
}

function setting(userId, fields) {
  return Object.assign({
    user_id: userId,
    age_min: 30,
    age_max: 35,
    min_education: '本科',
    like_circle_ids: '1',
    like_baby_plan: '2-3年内',
    self_view_text: VALUES,
    target_view_text: VALUES,
    psych_profile_json: null
  }, fields)
}

const mutualMatchPair = {
  male: {
    user: user(91001, { gender: 1, birth_year: 1992, height_range: '170-180cm' }),
    setting: setting(91001, { height_min: 160, height_max: 170 })
  },
  female: {
    user: user(91002, { gender: 2, birth_year: 1994, height_range: '160-170cm' }),
    setting: setting(91002, { height_min: 170, height_max: 180 })
  }
}

const hardRejectPair = {
  male: {
    user: user(92001, { gender: 1, birth_year: 1978, height_range: '170-180cm' }),
    setting: setting(92001, { age_min: 45, age_max: 65, height_min: 160, height_max: 170 })
  },
  female: {
    user: user(92002, { gender: 2, birth_year: 2001, height_range: '160-170cm' }),
    setting: setting(92002, { age_min: 20, age_max: 25, height_min: 170, height_max: 180 })
  }
}

module.exports = { mutualMatchPair, hardRejectPair }

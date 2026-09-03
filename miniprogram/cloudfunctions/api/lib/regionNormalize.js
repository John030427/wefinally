/**
 * Region normalize for CloudBase / Node selfcheck.
 * Mirrors miniprogram/utils/chinaRegions.js — keep catalogs in sync.
 * No GPS APIs.
 */

const REGION_CATALOG = [
  { province_code: '110000', province_name: '北京市', cities: [{ city_code: '110100', city_name: '北京' }] },
  { province_code: '120000', province_name: '天津市', cities: [{ city_code: '120100', city_name: '天津' }] },
  { province_code: '310000', province_name: '上海市', cities: [{ city_code: '310100', city_name: '上海' }] },
  { province_code: '500000', province_name: '重庆市', cities: [{ city_code: '500100', city_name: '重庆' }] },
  {
    province_code: '440000',
    province_name: '广东省',
    cities: [
      { city_code: '440100', city_name: '广州' },
      { city_code: '440300', city_name: '深圳' },
      { city_code: '440400', city_name: '珠海' },
      { city_code: '440600', city_name: '佛山' },
      { city_code: '441900', city_name: '东莞' },
      { city_code: '442000', city_name: '中山' }
    ]
  },
  {
    province_code: '330000',
    province_name: '浙江省',
    cities: [
      { city_code: '330100', city_name: '杭州' },
      { city_code: '330200', city_name: '宁波' },
      { city_code: '330300', city_name: '温州' },
      { city_code: '330600', city_name: '绍兴' }
    ]
  },
  {
    province_code: '320000',
    province_name: '江苏省',
    cities: [
      { city_code: '320100', city_name: '南京' },
      { city_code: '320500', city_name: '苏州' },
      { city_code: '320200', city_name: '无锡' },
      { city_code: '320400', city_name: '常州' }
    ]
  },
  {
    province_code: '510000',
    province_name: '四川省',
    cities: [
      { city_code: '510100', city_name: '成都' },
      { city_code: '510700', city_name: '绵阳' }
    ]
  },
  { province_code: '420000', province_name: '湖北省', cities: [{ city_code: '420100', city_name: '武汉' }] },
  { province_code: '610000', province_name: '陕西省', cities: [{ city_code: '610100', city_name: '西安' }] },
  { province_code: '430000', province_name: '湖南省', cities: [{ city_code: '430100', city_name: '长沙' }] },
  { province_code: '410000', province_name: '河南省', cities: [{ city_code: '410100', city_name: '郑州' }] },
  {
    province_code: '370000',
    province_name: '山东省',
    cities: [
      { city_code: '370200', city_name: '青岛' },
      { city_code: '370100', city_name: '济南' }
    ]
  },
  {
    province_code: '350000',
    province_name: '福建省',
    cities: [
      { city_code: '350200', city_name: '厦门' },
      { city_code: '350100', city_name: '福州' }
    ]
  }
]

const CITY_ALIAS = {
  北京市: '北京', 天津市: '天津', 上海市: '上海', 重庆市: '重庆',
  广州市: '广州', 深圳市: '深圳', 杭州市: '杭州', 成都市: '成都',
  武汉市: '武汉', 南京市: '南京', 西安市: '西安', 苏州市: '苏州',
  长沙市: '长沙', 郑州市: '郑州', 青岛市: '青岛', 厦门市: '厦门'
}

function normalizeCityLabel(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (CITY_ALIAS[raw]) return CITY_ALIAS[raw]
  return raw.replace(/市$/, '')
}

function resolveRegion(input = {}) {
  const provinceCode = String(input.province_code || input.provinceCode || '').trim()
  const cityCode = String(input.city_code || input.cityCode || '').trim()
  const declaredProvinceName = String(input.province_name || input.provinceName || '').trim()
  const declaredCityName = normalizeCityLabel(input.city_name || input.cityName || input.city)
  const legacyCity = normalizeCityLabel(input.city || input.city_name || input.cityName)

  if (provinceCode && cityCode) {
    const province = REGION_CATALOG.find((item) => item.province_code === provinceCode)
    const city = province && province.cities.find((item) => item.city_code === cityCode)
    if (province && city) {
      return {
        country_code: 'CN',
        country_name: '中国',
        province_code: province.province_code,
        province_name: province.province_name,
        city_code: city.city_code,
        city_name: city.city_name,
        city: city.city_name,
        normalized: true,
        source: 'codes'
      }
    }
  }

  const declaredCodesValid = /^\d{2}0000$/.test(provinceCode)
    && /^\d{4}00$/.test(cityCode)
    && provinceCode.slice(0, 2) === cityCode.slice(0, 2)
  if (declaredCodesValid && declaredProvinceName && declaredCityName) {
    return {
      country_code: 'CN',
      country_name: '中国',
      province_code: provinceCode,
      province_name: declaredProvinceName,
      city_code: cityCode,
      city_name: declaredCityName,
      city: declaredCityName,
      normalized: true,
      source: 'declared_codes'
    }
  }

  if (legacyCity) {
    for (const province of REGION_CATALOG) {
      const city = province.cities.find((item) => item.city_name === legacyCity)
      if (city) {
        return {
          country_code: 'CN',
          country_name: '中国',
          province_code: province.province_code,
          province_name: province.province_name,
          city_code: city.city_code,
          city_name: city.city_name,
          city: city.city_name,
          normalized: true,
          source: 'legacy_city'
        }
      }
    }
    return {
      country_code: 'CN',
      country_name: '中国',
      province_code: '',
      province_name: '',
      city_code: '',
      city_name: legacyCity,
      city: legacyCity,
      normalized: false,
      source: 'legacy_unmapped'
    }
  }

  return {
    country_code: 'CN',
    country_name: '中国',
    province_code: '',
    province_name: '',
    city_code: '',
    city_name: '',
    city: '',
    normalized: false,
    source: 'empty'
  }
}

function listProvinces() {
  return REGION_CATALOG.map((item) => ({
    province_code: item.province_code,
    province_name: item.province_name
  }))
}

function listCities(provinceCode) {
  const province = REGION_CATALOG.find((item) => item.province_code === String(provinceCode || ''))
  return province ? province.cities.slice() : []
}

function legacyCityOptions() {
  const names = []
  for (const province of REGION_CATALOG) {
    for (const city of province.cities) {
      if (!names.includes(city.city_name)) names.push(city.city_name)
    }
  }
  return names
}

module.exports = {
  REGION_CATALOG,
  normalizeCityLabel,
  resolveRegion,
  listProvinces,
  listCities,
  legacyCityOptions,
  CITY_ALIAS
}

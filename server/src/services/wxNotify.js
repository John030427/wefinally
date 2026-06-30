const axios = require('axios');
const cfg = require('../config/notifyConfig');

let _token = { value: '', exp: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (_token.value && now < _token.exp) return _token.value;
  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  if (!appid || !secret) return '';
  const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: { grant_type: 'client_credential', appid, secret },
  });
  if (!data.access_token) return '';
  _token = { value: data.access_token, exp: now + (data.expires_in - 300) * 1000 };
  return _token.value;
}

/** 发匹配通知；任何前提缺失都安静跳过，绝不抛错影响匹配主流程 */
async function sendMatchNotice(openid, { date = '', type = '' } = {}) {
  try {
    if (!cfg.enabled || !cfg.matchTemplateId || !openid) return;
    const token = await getAccessToken();
    if (!token) return;
    await axios.post(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      {
        touser: openid,
        template_id: cfg.matchTemplateId,
        page: cfg.matchPage,
        // data 的字段名(thing1/time2...)要按后台实际模板字段改
        data: { thing1: { value: '你有新的匹配对象' }, time2: { value: date || type } },
      }
    );
  } catch (e) {
    console.error('[wxNotify] send fail:', e.message);
  }
}

module.exports = { sendMatchNotice };

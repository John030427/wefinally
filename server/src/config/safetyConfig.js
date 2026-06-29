module.exports = {
  meetSafetyEnabled: true,
  meetNoteMaxLen: 500,
  emergencyContactRequired: true,
  sosPhone: '110',
  safetyTipsText: '见面请选白天公共场所，提前告知亲友，保管财物，勿轻信任何转账要求。',
  // 拿到「广东110」官方小程序跳转授权后：enabled:true + 填 appId/path 即启用，不改其它代码
  guangdong110: { enabled: false, appId: '', path: '' },
  cardValidHours: 24,
};

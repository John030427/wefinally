/** Hard-coded business constants — do not override via env */
module.exports = {
  VIP_PRICE: 188,
  VIP_DAYS: 30,
  COMMISSION_RATE: 0.5,
  MATCH_COOLDOWN_DAYS: 7,
  /** Wednesday=3, Friday=5 (node-cron: 0=Sun) */
  MATCH_DAYS: [3, 5],

  USER_STATUS: {
    PENDING: 0,
    NORMAL: 1,
    BANNED: 2,
    MARRIED: 3,
  },

  PARTNER_STATUS: {
    FROZEN: 0,
    ACTIVE: 1,
    DISABLED: 2,
  },

  ORDER_STATUS: {
    PENDING: 0,
    PAID: 1,
    REFUNDED: 2,
    CLOSED: 3,
  },

  AGREEMENT_TYPES: ['user_service', 'privacy', 'data_auth'],

  VIEW_TEXT_MIN: 20,
  VIEW_TEXT_MAX: 300,

  SETTLE_DAYS: 7,

  ROLES: {
    USER: 'user',
    PARTNER: 'partner',
    ADMIN: 'admin',
  },
};

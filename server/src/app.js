require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { startMatchCron } = require('./cron/matchCron');
const { startVipExpireCron } = require('./cron/vipExpireCron');
const { startSettleCron } = require('./cron/settleCron');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const matchRoutes = require('./routes/match');
const orderRoutes = require('./routes/order');
const chatRoutes = require('./routes/chat');
const reportRoutes = require('./routes/report');
const commonRoutes = require('./routes/common');
const partnerRoutes = require('./routes/partner');
const adminRoutes = require('./routes/admin');
const wxpayRoutes = require('./routes/wxpay');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.use('/api/wxpay/notify', express.raw({ type: '*/*' }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁', data: null },
});
app.use('/api/', limiter);

// ─── Static admin panels ────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.use('/partner', express.static(path.join(__dirname, '../public/partner')));

// ─── Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/vip', orderRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/common', commonRoutes);
app.use('/api/platform', commonRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wxpay', wxpayRoutes);

// ─── 404 ─────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在', data: null });
});

// ─── Error handler ───────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (err.stack && process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  res.status(500).json({
    code: 500,
    message: process.env.NODE_ENV === 'production' ? '服务器错误' : err.message,
    data: null,
  });
});

// ─── Cron jobs ───────────────────────────────────────────────
startMatchCron();
startVipExpireCron();
startSettleCron();

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`WeFinally server running on port ${PORT}`);
  console.log(`Admin static: http://localhost:${PORT}/admin`);
  console.log(`Health check: http://localhost:${PORT}/api/common/health`);
});

module.exports = app;

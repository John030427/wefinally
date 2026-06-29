const express = require('express');
const { userAuth } = require('../middleware/auth');
const { requireActiveUser, debounceMiddleware } = require('../middleware/guard');
const { success, fail } = require('../utils/response');
const { processMessage, getChatHistory, getSessionMessages } = require('../services/aiChatService');

const router = express.Router();

router.use(userAuth, requireActiveUser);

/** POST /api/chat/send */
router.post(
  '/send',
  debounceMiddleware((req) => `chat:${req.auth.id}`),
  async (req, res, next) => {
    try {
      const content = (req.body.content || req.body.message || '').trim();
      if (!content) return fail(res, '消息不能为空');

      const result = await processMessage(req.auth.id, content);
      return success(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/chat/history */
router.get('/history', async (req, res, next) => {
  try {
    const messages = await getChatHistory(req.auth.id);
    return success(res, { messages, list: messages });
  } catch (err) {
    next(err);
  }
});

/** GET /api/chat/messages/:sessionId */
router.get('/messages/:sessionId', async (req, res, next) => {
  try {
    const data = await getSessionMessages(req.auth.id, Number(req.params.sessionId));
    if (!data) return fail(res, '会话不存在', 404, 404);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const pool = require('../config/db');

function tokenizeForMatch(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[\s\u3000,.，。！？!?\n\r]/g, '')
    .split('')
    .filter(Boolean);
}

function matchScore(question, userText) {
  const qTokens = new Set(tokenizeForMatch(question));
  const uTokens = tokenizeForMatch(userText);
  let score = 0;

  for (const t of uTokens) {
    if (qTokens.has(t)) score += 2;
  }

  if (question && userText.includes(question.slice(0, Math.min(10, question.length)))) {
    score += 5;
  }

  return score;
}

async function findBestKnowledge(userMessage) {
  const [rows] = await pool.query(
    'SELECT * FROM ai_knowledge WHERE status = 1 ORDER BY id DESC'
  );
  if (rows.length === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const row of rows) {
    const s = matchScore(row.question, userMessage);
    if (s > bestScore) {
      bestScore = s;
      best = row;
    }
  }

  return bestScore >= 3 ? best : null;
}

async function saveChatLog(userId, userContent, aiContent, isManualTransfer) {
  await pool.query(
    `INSERT INTO ai_chat_log (user_id, user_content, ai_content, is_manual_transfer)
     VALUES (?, ?, ?, ?)`,
    [userId, userContent, aiContent, isManualTransfer ? 1 : 0]
  );
}

/**
 * Process user message — knowledge base match; auto transfer to manual on miss.
 */
async function processMessage(userId, content) {
  const [recentManual] = await pool.query(
    `SELECT id FROM ai_chat_log
     WHERE user_id = ? AND is_manual_transfer = 1
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );

  if (recentManual.length > 0) {
    const reply = '您的问题已转人工客服，请耐心等待回复。';
    await saveChatLog(userId, content, reply, true);
    return {
      sessionId: userId,
      mode: 'manual',
      reply,
      content: reply,
      transferred: true,
    };
  }

  try {
    const kb = await findBestKnowledge(content);
    if (kb) {
      await saveChatLog(userId, content, kb.answer, false);
      return {
        sessionId: userId,
        mode: 'ai',
        reply: kb.answer,
        content: kb.answer,
        knowledgeId: kb.id,
        transferred: false,
      };
    }

    const fallback =
      '抱歉，暂未找到相关解答，已为您转接人工客服，工作人员将尽快回复。';
    await saveChatLog(userId, content, fallback, true);
    return {
      sessionId: userId,
      mode: 'manual',
      reply: fallback,
      content: fallback,
      transferred: true,
    };
  } catch (err) {
    console.error('[aiChatService] error, transferring to manual:', err.message);
    const fallback = '系统繁忙，已为您转接人工客服。';
    await saveChatLog(userId, content, fallback, true);
    return {
      sessionId: userId,
      mode: 'manual',
      reply: fallback,
      content: fallback,
      transferred: true,
    };
  }
}

async function getChatHistory(userId, limit = 50) {
  const [rows] = await pool.query(
    `SELECT id, user_content, ai_content, is_manual_transfer, create_time
     FROM ai_chat_log WHERE user_id = ?
     ORDER BY id DESC LIMIT ?`,
    [userId, limit]
  );

  const messages = [];
  for (const row of rows.reverse()) {
    messages.push({
      id: `${row.id}-u`,
      role: 'user',
      content: row.user_content,
      createdAt: row.create_time,
      time: row.create_time,
      isBot: false,
    });
    messages.push({
      id: `${row.id}-a`,
      role: 'assistant',
      content: row.ai_content,
      createdAt: row.create_time,
      time: row.create_time,
      isBot: true,
    });
  }
  return messages;
}

async function getSessionMessages(userId, sessionId) {
  if (Number(sessionId) !== Number(userId)) return null;
  const messages = await getChatHistory(userId);
  return { session: { id: userId, user_id: userId }, messages };
}

module.exports = {
  processMessage,
  getSessionMessages,
  getChatHistory,
  findBestKnowledge,
};

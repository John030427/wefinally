/**
 * Lightweight Chinese text semantic similarity (0-100).
 * Uses character n-gram Jaccard + keyword overlap — no external ML deps.
 */

const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '那', '他', '她', '它', '我们', '你们', '他们', '可以', '希望',
]);

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const cleaned = text.replace(/[\s\u3000,.，。！？!?\n\r\t]/g, '');
  const tokens = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (ch && !STOP_WORDS.has(ch)) tokens.push(ch);
  }
  // bigrams for slightly better semantic capture
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    tokens.push(cleaned.slice(i, i + 2));
  }
  return tokens;
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) {
    if (setB.has(x)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Compare user's self_view_text with candidate's target_view_text (and vice versa).
 * @returns {number} 0-100 integer
 */
function computeViewSimilarity(selfA, targetA, selfB, targetB) {
  const score1 = jaccard(tokenize(selfA), tokenize(targetB));
  const score2 = jaccard(tokenize(selfB), tokenize(targetA));
  const avg = (score1 + score2) / 2;
  return Math.round(Math.min(100, Math.max(0, avg * 100)));
}

module.exports = { computeViewSimilarity, tokenize, jaccard };

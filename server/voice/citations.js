/** Memory citations: [mN] tags in model output, and a fallback attribution when the model forgot them. */
const groq = require('../groq');
const { wordSet } = require('./recall');

const COMMON_WORDS = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'about', 'there', 'their', 'would', 'could', 'should', 'thank', 'thanks', 'today', 'time', 'call', 'calling', 'agency', 'late', 'arrivals', 'arrival', 'recent', 'recently', 'weeks', 'couple', 'good', 'talk', 'minutes', 'household', 'family', 'message', 'check', 'again', 'okay', 'what', 'when', 'where', 'which', 'while', 'into', 'just', 'like', 'more', 'than', 'then', 'them', 'they', 'were', 'also', 'some', 'past', 'happening', 'understand']);

/** Cheap gate: does the reply share a distinctive word with any remembered fact? */
function mayUseMemory(replyText, facts, helperName) {
  const skip = new Set(String(helperName || '').toLowerCase().split(/\s+/));
  const words = String(replyText).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 5 && !COMMON_WORDS.has(w) && !skip.has(w));
  if (!words.length) return false;
  return facts.some(f => { const ws = wordSet(f.text); return words.some(w => ws.has(w)); });
}

function knownTags(tags, facts) {
  const valid = new Set(facts.map(f => f.tag));
  return tags.filter(t => valid.has(t));
}

/** If the model used memory but forgot to tag it, ask a small model which facts the sentence drew on. */
async function attributeCitations(replyText, facts) {
  if (!facts.length || !replyText) return [];
  const list = facts.map(f => f.tag + ': ' + String(f.text).split(' | ')[0].slice(0, 200)).join('\n');
  const prompt = 'Reply text:\n"' + replyText + '"\n\nRemembered facts:\n' + list + '\n\nWhich facts (if any) does the reply draw on? Answer with the tags only, comma-separated (e.g. m2,m5), or NONE.';
  try {
    // Reasoning models spend tokens thinking first; leave room for the short answer.
    const out = await groq.chat([{ role: 'user', content: prompt }], { temperature: 0, maxTokens: 300, model: groq.FALLBACK_MODEL });
    return [...new Set((out.match(/m\d+/g) || []).filter(t => facts.some(f => f.tag === t)))];
  } catch { return []; }
}

function splitCitations(text) {
  const cited = [];
  const clean = String(text || '').replace(/\s*\[(m\d+)\]/g, (m, tag) => { cited.push(tag); return ''; }).replace(/\s{2,}/g, ' ').trim();
  return { text: clean, cited: [...new Set(cited)] };
}

module.exports = { COMMON_WORDS, mayUseMemory, knownTags, attributeCitations, splitCitations };

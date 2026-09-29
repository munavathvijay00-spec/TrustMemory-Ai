/**
 * A WhatsApp follow-up draft for the coordinator after a completed call: a short, warm message to
 * the helper in the call's language, built only from what the call actually produced. Nothing is
 * sent and nothing is retained; the coordinator edits it and sends it from their own phone.
 */
const groq = require('../groq');
const { LANGUAGES, firstName } = require('./util');

const MAX_CHARS = 400;
const SCRIPT = { en: 'English', hi: 'simple spoken Hindi written in Devanagari script', te: 'simple spoken Telugu written in Telugu script' };

class FollowupError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

/** The facts the draft may use: the helper's name, what she agreed, the check-in date, what she said. */
function draftFacts(s) {
  const o = (s.result && s.result.outcome) || {};
  const helperLines = (s.transcript || []).filter(t => t.who !== 'Agent').map(t => String(t.text || '')).slice(-4);
  return {
    name: firstName(s.helper && s.helper.name),
    agreed: o.specific_commitment || null,
    check_in: o.follow_up_date || null,
    she_said: helperLines,
  };
}

function buildPrompt(s) {
  const lang = LANGUAGES[s.language] ? s.language : 'en';
  const f = draftFacts(s);
  return [
    `Write a short WhatsApp message from the home-care agency coordinator to ${f.name}, a helper, after a phone call with her.`,
    `Language: write it in ${SCRIPT[lang]}. Keep common English words people mix in (salary, leave, bus) as they are.`,
    `Length: at most ${MAX_CHARS} characters, two to four short sentences, warm and respectful, no emoji.`,
    'Content: thank her for the call; if she agreed something, restate it in plain words; if there is a check-in date, mention it; add one practical line taken from what she said.',
    'Rules: never mention scores, ratings, risk, safety checks or coordinator notes. Use nothing she did not say. Do not promise anything on the agency\'s behalf (no pay, leave or changes).',
    'Return JSON: {"text": "<the message>"}',
    '',
    'FACTS FROM THE CALL:',
    JSON.stringify(f),
  ].join('\n');
}

/** Returns { text, lang }. Throws 404 for an unknown session and 409 for one that is not finished. */
async function draftFollowup(s) {
  if (!s) throw new FollowupError('Session not found.', 404, 'NOT_FOUND');
  if (!s.result) throw new FollowupError('The call is not finished yet.', 409, 'NOT_COMPLETED');
  const lang = LANGUAGES[s.language] ? s.language : 'en';
  const out = await groq.chatJson([{ role: 'user', content: buildPrompt(s) }], { maxTokens: 500, temperature: 0.4 });
  let text = String((out && out.text) || '').replace(/\s+\n/g, '\n').trim();
  if (!text) throw new FollowupError('Could not write a draft.', 502, 'DRAFT_FAILED');
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS - 1).replace(/\s+\S*$/, '') + '…';
  return { text, lang };
}

module.exports = { MAX_CHARS, FollowupError, draftFacts, buildPrompt, draftFollowup };

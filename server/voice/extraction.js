/** Structured outcome extraction from the real call transcript (Groq JSON mode). */
const groq = require('../groq');
const commitments = require('../commitments');
const { firstName } = require('./util');

async function extractOutcome(s) {
  const dialogue = s.transcript.map(t => t.who + ': ' + t.text).join('\n');
  const callDate = new Date().toISOString().slice(0, 10);
  const open = (s.ledger && s.ledger.open) || [];
  const openBlock = open.length
    ? ['', 'OPEN COMMITMENTS she made on earlier calls (id: text):'].concat(open.map(c => c.id + ': ' + c.text)).join('\n')
    : '';
  const prompt = [
    'You are the agency coordinator\'s assistant. Read this coaching call transcript between the agency\'s voice agent ("Agent") and helper ' + s.helper.name + ' and extract what actually happened on this call, dated ' + callDate + '. Do not invent details that are not in the transcript. If something was not discussed, use null or false.',
    '',
    'IMPORTANT: the Agent\'s lines often repeat what the agency remembered from EARLIER calls. They are not new evidence. Take facts only from what ' + firstName(s.helper.name) + ' herself said on this call. If the Agent mentioned something and she did not confirm it in her own words, do not record it. Write circumstances (health, family, travel) as dated statements, e.g. "On ' + callDate + ', ' + firstName(s.helper.name) + ' said she was unwell", never as "is currently".',
    '',
    'Return JSON with exactly these keys:',
    '{',
    '  "sentiment": one of "cooperative" | "neutral" | "defensive" | "distressed",',
    '  "root_cause": string or null,',
    '  "specific_commitment": string or null,',
    '  "notification_commitment": boolean,',
    '  "follow_up_days": integer (14 if a two-week check-in was agreed, otherwise your best reading, otherwise 14),',
    '  "escalation_required": boolean,',
    '  "call_completed": boolean (false if the helper asked to be called back later),',
    '  "coordinator_note": one or two plain sentences for the coordinator about what she said on THIS call,',
    '  "memory_facts": array of 0 to 5 short third-person facts she stated herself on this call, dated where they describe a circumstance (empty array if she said nothing new)',
    '  "commitment_checks": array of {"id": commitment id from the list below, "status": "kept" | "broken" | "unclear", "evidence": her own words, quoted or closely paraphrased}. Only "kept" or "broken" when SHE said so on this call; otherwise "unclear". Empty array if there are no open commitments.',
    '  "approach_used": which approach the Agent took on this call, one of ' + Object.keys(commitments.APPROACHES).map(k => '"' + k + '" (' + commitments.APPROACHES[k] + ')').join(', '),
    '}',
    '',
    openBlock,
    '',
    'TRANSCRIPT:',
    dialogue,
  ].join('\n');
  return groq.chatJson([{ role: 'user', content: prompt }], { maxTokens: 900 });
}

module.exports = { extractOutcome };

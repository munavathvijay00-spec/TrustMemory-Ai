/** Small shared helpers for the voice agent modules. */
const END_TOKEN = '[END_CALL]';

function nowSql() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function firstName(name) {
  return String(name || '').split(' ')[0] || 'there';
}

/** Call languages: the agent speaks this language; memory, extraction and retain stay in English. */
const LANGUAGES = {
  en: { name: 'English', speech: 'en-IN' },
  hi: { name: 'Hindi', speech: 'hi-IN' },
  te: { name: 'Telugu', speech: 'te-IN' },
};
const PURPOSE_MAX = 300;

/** Validated call language (default English); throws a 400 for anything else. */
function callLanguage(value) {
  if (value === undefined || value === null || value === '') return 'en';
  const v = String(value).trim().toLowerCase();
  if (!LANGUAGES[v]) throw Object.assign(new Error('language must be one of: ' + Object.keys(LANGUAGES).join(', ') + '.'), { status: 400, code: 'VALIDATION' });
  return v;
}

/** Validated optional reason for the call, shown to the agent; throws a 400 when too long. */
function callPurpose(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).replace(/\s+/g, ' ').trim();
  if (!v) return null;
  if (v.length > PURPOSE_MAX) throw Object.assign(new Error('purpose must be at most ' + PURPOSE_MAX + ' characters.'), { status: 400, code: 'VALIDATION' });
  return v;
}

function helperTags(helperId) {
  return ['helper:' + helperId];
}

function daysBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

module.exports = { END_TOKEN, LANGUAGES, PURPOSE_MAX, nowSql, firstName, helperTags, daysBetween, callLanguage, callPurpose };

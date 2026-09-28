/** Small shared helpers for the voice agent modules. */
const END_TOKEN = '[END_CALL]';

function nowSql() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function firstName(name) {
  return String(name || '').split(' ')[0] || 'there';
}

function helperTags(helperId) {
  return ['helper:' + helperId];
}

function daysBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

module.exports = { END_TOKEN, nowSql, firstName, helperTags, daysBetween };

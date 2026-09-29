/**
 * Azure AI Speech neural voices for the helper phone screen.
 *
 * Browsers rarely ship a Telugu voice and not always a Hindi one, so a Telugu call used to show
 * text only. With AZURE_SPEECH_KEY and AZURE_SPEECH_REGION set, the phone screen asks this module
 * for an mp3 of each agent line instead. Without them nothing changes: the browser voice (or text)
 * is used exactly as before. Nothing is cached or written to disk.
 */
const VOICES = { en: 'en-IN-NeerjaNeural', hi: 'hi-IN-SwaraNeural', te: 'te-IN-ShrutiNeural' };
const LOCALES = { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' };
const MAX_CHARS = 600;
const TIMEOUT_MS = 15000;

class TtsError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

function config() {
  const key = String(process.env.AZURE_SPEECH_KEY || '').trim();
  const region = String(process.env.AZURE_SPEECH_REGION || '').trim().toLowerCase();
  return { key, region, configured: Boolean(key && /^[a-z0-9]+$/.test(region)) };
}

function isConfigured() { return config().configured; }

function status() {
  return { azure: isConfigured(), voices: Object.assign({}, VOICES) };
}

function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

/** Validate input; returns { text, lang } or throws a 400. */
function checkInput(text, lang) {
  const l = String(lang || '').trim();
  if (!VOICES[l]) throw new TtsError('lang must be one of: ' + Object.keys(VOICES).join(', ') + '.', 400, 'VALIDATION');
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!t) throw new TtsError('text is required.', 400, 'VALIDATION');
  if (t.length > MAX_CHARS) throw new TtsError(`text must be at most ${MAX_CHARS} characters.`, 400, 'VALIDATION');
  return { text: t, lang: l };
}

function buildSsml(text, lang) {
  return `<speak version="1.0" xml:lang="${LOCALES[lang]}"><voice xml:lang="${LOCALES[lang]}" name="${VOICES[lang]}">` +
    `<prosody rate="-5%">${xmlEscape(text)}</prosody></voice></speak>`;
}

/** Returns a Buffer with mp3 audio for the line. */
async function synthesize(rawText, rawLang) {
  const { text, lang } = checkInput(rawText, rawLang);
  const { key, region, configured } = config();
  if (!configured) throw new TtsError('Azure Speech is not configured.', 503, 'TTS_NOT_CONFIGURED');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'TrustMemoryAI',
      },
      body: buildSsml(text, lang),
      signal: ctrl.signal,
    });
  } catch {
    throw new TtsError('Azure Speech could not be reached.', 502, 'TTS_FAILED');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new TtsError(`Azure Speech answered ${res.status}.`, 502, 'TTS_FAILED');
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { VOICES, MAX_CHARS, TtsError, isConfigured, status, xmlEscape, checkInput, buildSsml, synthesize };

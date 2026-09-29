/* =========================================================================
   js/helper-phone.js — the helper's phone screen (helper.html)

   The coordinator rings this screen from the Voice Agent page. This screen:
     1. polls GET  /api/voice/incoming?helper=<id>      for a ringing call
     2. POST /api/voice/answer                           accept or decline
     3. speaks the agent's lines (speechSynthesis) and listens to the helper
        (Web Speech API, typed fallback); each reply goes through
        POST /api/voice/turn, the same Groq + Hindsight brain as the console
     4. POST /api/voice/hangup                           when either side ends
   The coordinator console mirrors the same session, so recall, citations,
   extraction and retain all happen exactly as in a console call.

   The helper never sees memory, scores or other helpers: only the call.
   Ring tone and layout adapted from the team's voice-agent feature.
   ========================================================================= */
(function(){
  const params = new URLSearchParams(location.search);
  const HELPER_ID = (params.get('helper') || 'radha').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const $ = id => document.getElementById(id);
  const state = { phase: 'off', call: null, sessionId: null, lines: [], timerStart: 0, timer: null, poll: null, ring: null, audio: null, rec: null, listenTries: 0, busy: false, lang: 'en-IN', azure: false, player: null };

  // What the helper sees in her call language. The agent's lines arrive already in that language.
  const TEXT = {
    'en-IN': { consent: 'This call is recorded and remembered so the agency can support you. You can ask the agency what it has on record about you at any time.', speak: '🎤 Speak', end: 'End call', typed: 'Or type your reply', listening: 'Listening… speak now', you: 'You', agency: 'Agency' },
    'hi-IN': { consent: 'यह कॉल रिकॉर्ड की जाती है और याद रखी जाती है ताकि एजेंसी आपकी मदद कर सके। आप कभी भी एजेंसी से पूछ सकती हैं कि आपके बारे में क्या लिखा है।', speak: '🎤 बोलिए · Speak', end: 'कॉल खत्म · End', typed: 'या यहाँ लिखिए', listening: 'सुन रहे हैं… बोलिए', you: 'आप', agency: 'एजेंसी' },
    'te-IN': { consent: 'ఈ కాల్ రికార్డ్ చేయబడుతుంది, ఏజెన్సీ మీకు సహాయం చేయడానికి గుర్తుంచుకుంటుంది. మీ గురించి ఏమి రాసి ఉందో ఎప్పుడైనా ఏజెన్సీని అడగవచ్చు.', speak: '🎤 మాట్లాడండి · Speak', end: 'కాల్ ముగించు · End', typed: 'లేదా ఇక్కడ టైప్ చేయండి', listening: 'వింటున్నాం… మాట్లాడండి', you: 'మీరు', agency: 'ఏజెన్సీ' },
  };
  function t(key){ return (TEXT[state.lang] || TEXT['en-IN'])[key]; }

  /** Switch the screen to the call's language: labels, consent line, listening and speaking. */
  function setLanguage(speechLang){
    state.lang = TEXT[speechLang] ? speechLang : 'en-IN';
    document.documentElement.lang = state.lang.slice(0, 2);
    $('hpConsent').textContent = t('consent');
    $('btnSpeak').textContent = t('speak');
    $('btnHangup').textContent = t('end');
    $('hpTyped').placeholder = t('typed');
    $('hpListen').textContent = t('listening');
    $('hpVoiceNote').textContent = '';
    // With the agency's neural voices (Azure) switched on, Hindi and Telugu are spoken even without a device voice.
    if(state.lang !== 'en-IN' && !state.azure && 'speechSynthesis' in window && !voiceFor(state.lang)){
      $('hpVoiceNote').textContent = 'No ' + (state.lang === 'hi-IN' ? 'Hindi' : 'Telugu') + ' voice is installed on this device, so the agency words are shown here to read instead of spoken.';
    }
  }

  /* ---------------------------------------------------------------- helpers */

  function show(phase){
    state.phase = phase;
    ['ctlActivate','ctlIdle','ctlRinging','ctlConnected','ctlEnded'].forEach(id => { $(id).style.display = 'none'; });
    const map = {off:'ctlActivate', idle:'ctlIdle', ringing:'ctlRinging', connected:'ctlConnected', ended:'ctlEnded'};
    const el = $(map[phase]);
    if(el) el.style.display = phase === 'ringing' ? 'flex' : 'block';
    $('hpLive').style.display = phase === 'connected' ? 'block' : 'none';
    $('hpConsent').style.display = (phase === 'ringing' || phase === 'connected') ? 'block' : 'none';
    $('hpLines').style.display = (phase === 'connected' || phase === 'ended') && state.lines.length ? 'flex' : 'none';
    const status = {off:'Tap below to switch the line on', idle:'Standby', ringing:'Incoming call…', connected:'Connected', ended:'Call ended'}[phase];
    $('hpStatus').textContent = status;
    $('lineDot').className = 'status-dot' + (phase === 'off' ? '' : phase === 'connected' || phase === 'ringing' ? ' busy' : ' active');
    $('lineText').textContent = phase === 'off' ? 'Line off' : phase === 'connected' ? 'On a call' : phase === 'ringing' ? 'Ringing' : 'Line on';
  }

  function hint(t){ $('hpHint').textContent = t || ''; }

  function esc(t){ return String(t || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function renderLines(){
    const recent = state.lines.slice(-4);
    $('hpLines').innerHTML = recent.map(l => `<div class="hp-line ${l.me ? 'me' : ''}"><div class="who">${l.me ? t('you') : t('agency')}</div>${esc(l.text)}</div>`).join('');
    $('hpLines').style.display = recent.length ? 'flex' : 'none';
  }

  async function api(path, body){
    const res = await fetch(path, body ? {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)} : undefined);
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ const err = new Error(data.error || ('HTTP ' + res.status)); err.status = res.status; throw err; }
    return data;
  }

  /* ---------------------------------------------------------------- ring tone (Web Audio, no assets) */

  function startRing(){
    stopRing();
    try {
      if(!state.audio) state.audio = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = state.audio;
      const tone = () => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(480, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 1.2);
      };
      tone();
      state.ring = setInterval(tone, 2800);
    } catch(e){}
  }
  function stopRing(){ if(state.ring){ clearInterval(state.ring); state.ring = null; } }

  /* ---------------------------------------------------------------- speech */

  /** An installed voice for the language (hi-IN / te-IN), or null. */
  function voiceFor(lang){
    const v = speechSynthesis.getVoices();
    const base = lang.slice(0, 2);
    return v.find(x => x.lang && x.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
      || v.find(x => x.lang && x.lang.toLowerCase().startsWith(base + '-')) || null;
  }

  function pickVoice(){
    const v = speechSynthesis.getVoices();
    if(state.lang !== 'en-IN'){ const own = voiceFor(state.lang); if(own) return own; }
    return v.find(x => /en-IN/i.test(x.lang)) || v.find(x => /en-GB/i.test(x.lang) && /female/i.test(x.name)) || v.find(x => /^en/i.test(x.lang)) || null;
  }

  /** Play the line in the agency's neural voice (Azure). Resolves when playback ends; rejects to fall back. */
  async function neuralSpeak(text){
    const res = await fetch('/api/voice/tts', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: text.slice(0, 600), lang: state.lang.slice(0, 2), session_id: state.sessionId})});
    if(!res.ok) throw new Error('tts ' + res.status);
    const url = URL.createObjectURL(await res.blob());
    try {
      await new Promise((resolve, reject) => {
        const a = new Audio(url);
        state.player = a;
        a.onended = resolve; a.onerror = reject;
        setTimeout(resolve, Math.min(30000, 3000 + text.length * 90));
        a.play().catch(reject);
      });
    } finally {
      state.player = null;
      URL.revokeObjectURL(url);
    }
  }

  /** Which voice speaks this line: neural for Hindi/Telugu (or when the device has no voice at all). */
  function useNeural(){
    if(!state.azure) return false;
    if(state.lang !== 'en-IN') return true;
    return !('speechSynthesis' in window) || !speechSynthesis.getVoices().length;
  }

  function speak(text, done){
    $('hpWave').classList.add('active');
    const finish = () => { $('hpWave').classList.remove('active'); if(done) done(); };
    if(useNeural()){
      let settled = false;
      neuralSpeak(text).then(() => { if(!settled){ settled = true; finish(); } })
        .catch(() => { if(!settled){ settled = true; state.azure = false; setLanguage(state.lang); $('hpWave').classList.remove('active'); speak(text, done); } });
      return;
    }
    if(!('speechSynthesis' in window)){ finish(); return; }
    // No voice for Hindi or Telugu on this device: an English voice cannot read that script,
    // so the line stays on screen and the call carries on after a short reading pause.
    if(state.lang !== 'en-IN' && !voiceFor(state.lang)){ setTimeout(finish, Math.min(6000, 1200 + text.length * 40)); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(); if(v) u.voice = v;
    u.lang = v ? v.lang : state.lang;
    u.rate = 0.95;
    let fired = false;
    const once = () => { if(fired) return; fired = true; finish(); };
    u.onend = once; u.onerror = once;
    setTimeout(once, Math.min(20000, 1500 + text.length * 70));
    speechSynthesis.speak(u);
  }

  function listen(){
    if(state.phase !== 'connected' || state.busy) return;
    if(!SR){ hint('This browser cannot listen. Type your reply below.'); return; }
    try { if(state.rec) state.rec.abort(); } catch(e){}
    const r = new SR();
    state.rec = r;
    r.lang = state.lang; r.continuous = false; r.interimResults = true;
    let finalText = '';
    r.onstart = () => { $('hpListen').style.display = 'block'; $('hpInterim').textContent = ''; hint(''); };
    r.onresult = ev => {
      let interim = '';
      for(let i = ev.resultIndex; i < ev.results.length; i++){
        if(ev.results[i].isFinal) finalText += ev.results[i][0].transcript; else interim += ev.results[i][0].transcript;
      }
      $('hpInterim').textContent = finalText || interim;
    };
    r.onerror = ev => {
      if(ev.error === 'not-allowed' || ev.error === 'service-not-allowed') hint('Microphone is blocked. Allow it in the address bar, or type below.');
      else if(ev.error === 'network') hint('Listening needs an internet connection. Type your reply below instead.');
    };
    r.onend = () => {
      $('hpListen').style.display = 'none';
      const text = finalText.trim();
      if(text){ state.listenTries = 0; sendTurn(text); return; }
      if(state.phase === 'connected' && !state.busy){
        state.listenTries += 1;
        if(state.listenTries <= 2) listen(); else { state.listenTries = 0; hint('Tap Speak when you are ready.'); }
      }
    };
    try { r.start(); } catch(e){ hint('Could not start the microphone.'); }
  }
  function stopListening(){ try { if(state.rec) state.rec.abort(); } catch(e){} $('hpListen').style.display = 'none'; }

  /* ---------------------------------------------------------------- call flow */

  function startTimer(){
    state.timerStart = Date.now();
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      const s = Math.floor((Date.now() - state.timerStart) / 1000);
      $('hpTimer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 500);
  }

  function pollIncoming(){
    clearInterval(state.poll);
    state.poll = setInterval(async () => {
      if(state.phase === 'idle'){
        try {
          const d = await api('/api/voice/incoming?helper=' + encodeURIComponent(HELPER_ID));
          if(d.call && state.phase === 'idle'){
            state.call = d.call; state.sessionId = d.call.session_id;
            setLanguage(d.call.speech_lang || 'en-IN');
            $('hpCaller').textContent = d.call.caller || 'Home-Care Agency';
            show('ringing'); startRing();
          }
        } catch(e){}
      } else if(state.phase === 'connected' && state.sessionId){
        // Coordinator may end the call from the console.
        try {
          const s = await api('/api/voice/session/' + encodeURIComponent(state.sessionId));
          if(s.call_state === 'ended' || s.result || s.status === 'cancelled') endLocal('The agency ended the call.');
        } catch(e){ endLocal('The call was closed.'); }
      } else if(state.phase === 'ringing' && state.sessionId){
        const sid = state.sessionId;
        try {
          const s = await api('/api/voice/session/' + encodeURIComponent(sid));
          if(state.phase !== 'ringing' || state.sessionId !== sid) return;   // she answered meanwhile
          if(s.call_state !== 'ringing'){ stopRing(); show('idle'); hint('Missed call.'); }
        } catch(e){ if(state.phase === 'ringing' && state.sessionId === sid){ stopRing(); show('idle'); } }
      }
    }, 1500);
  }

  async function accept(){
    stopRing();
    try {
      const d = await api('/api/voice/answer', {session_id: state.sessionId, accept: true});
      if(d.speech_lang) setLanguage(d.speech_lang);
      state.lines = [];
      show('connected'); startTimer();
      const greeting = d.greeting || (state.call && state.call.greeting) || '';
      if(greeting){ state.lines.push({me:false, text: greeting}); renderLines(); }
      speak(greeting, () => listen());
    } catch(e){ hint(e.message); show('idle'); }
  }

  async function decline(){
    stopRing();
    try { await api('/api/voice/answer', {session_id: state.sessionId, accept: false}); } catch(e){}
    state.sessionId = null; state.call = null;
    show('idle'); hint('Call declined.');
  }

  async function sendTurn(text){
    if(state.phase !== 'connected' || state.busy) return;
    state.busy = true;
    stopListening();
    state.lines.push({me:true, text}); renderLines();
    $('hpInterim').textContent = '';
    hint('…');
    const sid = state.sessionId;
    try {
      const d = await api('/api/voice/turn', {session_id: sid, text});
      if(state.sessionId !== sid || state.phase !== 'connected'){ state.busy = false; return; }
      hint('');
      state.lines.push({me:false, text: d.reply}); renderLines();
      state.busy = false;
      speak(d.reply, () => {
        if(d.ending){ setTimeout(() => hangup('helper', 'Call completed.'), 1200); }
        else listen();
      });
    } catch(e){
      state.busy = false;
      state.lines.pop(); renderLines();
      hint(e.message + ' Tap Speak to try again.');
    }
  }

  async function hangup(by, message){
    stopListening();
    if(state.sessionId){
      try { await api('/api/voice/hangup', {session_id: state.sessionId, by: by || 'helper'}); } catch(e){}
    }
    endLocal(message || 'Call ended.');
  }

  function endLocal(message){
    stopRing(); stopListening();
    if('speechSynthesis' in window) speechSynthesis.cancel();
    if(state.player){ try { state.player.pause(); } catch(e){} state.player = null; }
    clearInterval(state.timer);
    state.sessionId = null; state.call = null; state.busy = false;
    show('ended'); hint(message || '');
    setTimeout(() => { if(state.phase === 'ended'){ show('idle'); hint(''); } }, 4000);
  }

  /* ---------------------------------------------------------------- boot */

  async function boot(){
    show('off');
    // Are the agency's neural voices (Azure AI Speech) available? Checked once; failures keep the browser voice.
    try { const st = await api('/api/voice/tts/status'); state.azure = Boolean(st && st.azure); } catch(e){ state.azure = false; }
    try {
      const helpers = await api('/api/helpers');
      const h = helpers.find(x => x.id === HELPER_ID);
      $('hpHelperName').textContent = h ? h.name : HELPER_ID;
      $('hpInitials').textContent = h ? h.name.split(' ').map(p => p[0]).join('').slice(0, 2) : '?';
      if(!h){ hint('Unknown helper "' + HELPER_ID + '". Open this page as helper.html?helper=radha'); $('btnActivate').disabled = true; }
    } catch(e){
      // Signed out (or signed in as someone else): say so instead of blaming the network.
      if(e.status === 401 || e.status === 403){
        $('hpStatus').innerHTML = 'Please <a href="/" style="color:inherit; font-weight:600;">sign in</a> first, then open your call screen again.';
        hint('Sign in with your helper account (or the coordinator account for a demo).');
        $('btnActivate').disabled = true;
      } else hint('Cannot reach the agency server.');
    }

    $('btnActivate').onclick = () => {
      // A user gesture unlocks audio playback and speech synthesis for the rest of the session.
      try { state.audio = new (window.AudioContext || window.webkitAudioContext)(); state.audio.resume(); } catch(e){}
      if('speechSynthesis' in window){ const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
      show('idle'); pollIncoming();
    };
    $('btnAccept').onclick = accept;
    $('btnDecline').onclick = decline;
    $('btnHangup').onclick = () => hangup('helper', 'You ended the call.');
    $('btnSpeak').onclick = () => { state.listenTries = 0; listen(); };
    $('hpTypedForm').onsubmit = ev => { ev.preventDefault(); const t = $('hpTyped').value.trim(); if(t){ $('hpTyped').value = ''; sendTurn(t); } };
    // Voices load asynchronously; re-check the "no voice installed" note when they arrive.
    if('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { if(state.lang !== 'en-IN') setLanguage(state.lang); };
  }

  boot();
})();

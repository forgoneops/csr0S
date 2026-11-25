/* Voice: reading aloud (plan 3.5, ported from the old line). window.xSpeak(text) reads text with the local Piper voice through /api/tts, a sentence at a
   time (the next sentence is fetched while the current one plays); where the local voice is not installed it falls back to the browser's own voice.
   window.xSpeakStop() stops at once. The choice (on/off, which voice) is per browser. Nothing leaves the machine: text goes to the core, the core to a local process. */
(() => {
  if (typeof document === 'undefined' || !document.body || typeof fetch === 'undefined') return;
  const K = { on: 'caesaros-speak', voice: 'caesaros-voice' }, V = { info: null, gen: 0, audio: null };
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private window */ } return null; };
  const lang = () => (document.documentElement.lang === 'pl' ? 'pl' : 'en');
  async function info() { if (V.info) return V.info; try { const r = await fetch('/api/tts/status'); V.info = r.ok ? await r.json() : { ready: false, voices: [] }; } catch { V.info = { ready: false, voices: [] }; } return V.info; }
  const voiceFor = i => { const own = ls(K.voice); const all = i.voices || []; return (all.find(v => v.id === own) || all.find(v => v.lang === lang()) || all[0] || {}).id; };
  /** what is worth saying: no code blocks, links as their words, markdown marks gone */
  const clean = t => String(t).replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_#>~|]+/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = t => (t.match(/[^.!?…]+[.!?…]*\s*/g) || [t]).map(x => x.trim()).filter(Boolean).reduce((a, x) => { const l = a[a.length - 1]; if (l && l.length < 40) a[a.length - 1] = l + ' ' + x; else a.push(x); return a; }, []);

  function stop() { V.gen++; if (V.audio) { try { V.audio.pause(); } catch { /* gone */ } V.audio = null; } if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch { /* none */ } } }
  const play = blob => new Promise(res => { const u = URL.createObjectURL(blob), a = new Audio(u); V.audio = a; const end = () => { URL.revokeObjectURL(u); if (V.audio === a) V.audio = null; res(); }; a.onended = end; a.onerror = end; a.play().catch(end); });
  async function speak(text, opts = {}) {
    const t = clean(text).slice(0, 4000); if (!t) return false;
    stop(); const gen = V.gen, i = await info(), parts = sentences(t);
    if (i.ready) {
      const voice = opts.voice || voiceFor(i), get = s => fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: s, voice }) }).then(r => (r.ok ? r.blob() : null)).catch(() => null);
      let next = get(parts[0]);
      for (let k = 0; k < parts.length; k++) { const blob = await next; if (gen !== V.gen) return true; next = k + 1 < parts.length ? get(parts[k + 1]) : null; if (!blob) break; await play(blob); if (gen !== V.gen) return true; if (k + 1 === parts.length) return true; }
    }
    if (gen === V.gen && 'speechSynthesis' in window) { try { const u = new SpeechSynthesisUtterance(t.slice(0, 1500)); u.lang = lang() === 'pl' ? 'pl-PL' : 'en-US'; speechSynthesis.speak(u); return true; } catch { /* no voice here */ } }
    return false;
  }
  window.xSpeak = speak; window.xSpeakStop = stop;
  window.xVoice = { on: () => ls(K.on) === 'on', setOn(v) { ls(K.on, v ? 'on' : 'off'); if (!v) stop(); }, info, voice: () => ls(K.voice) || '', setVoice(id) { ls(K.voice, id || ''); }, voiceFor };
})();

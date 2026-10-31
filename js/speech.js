'use strict';
/* =========================================================
   TIME LAB · сервис озвучивания
   Интерфейс один: Speech.say(text) / Speech.repeat() / Speech.stop().
   Сейчас работает провайдер Web Speech API (speechSynthesis).
   Позже можно зарегистрировать другой провайдер (записанные аудиофайлы,
   внешний TTS) через Speech.use({ id, supported, speak(text, opts) → Promise }),
   не меняя остальной код.
   ========================================================= */
const Speech = (() => {
  const opts = { voiceName:'', accent:'en-GB', rate:1 };
  let last = '', voices = [];
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window ? window.speechSynthesis : null;

  function loadVoices() {
    if (!synth) return;
    try { voices = synth.getVoices().filter(v => /^en([-_]|$)/i.test(v.lang)); } catch (e) { voices = []; }
  }
  if (synth) { loadVoices(); try { synth.addEventListener('voiceschanged', loadVoices); } catch (e) { synth.onvoiceschanged = loadVoices; } }

  function pickVoice() {
    if (!voices.length) loadVoices();
    if (opts.voiceName) { const v = voices.find(x => x.name === opts.voiceName); if (v) return v; }
    const norm = l => l.replace('_', '-').toLowerCase();
    const want = opts.accent.toLowerCase();
    // голос по умолчанию: Google UK English Female (Chrome), для американского — Google US English
    const fav = want === 'en-us' ? ['Google US English'] : ['Google UK English Female'];
    const f = voices.find(v => fav.includes(v.name));
    if (f) return f;
    return voices.find(v => norm(v.lang) === want && v.localService) || voices.find(v => norm(v.lang) === want) || voices.find(v => norm(v.lang).startsWith('en')) || null;
  }

  // В английскую фразу не должны попадать русские пояснения: убираем скобки и куски с кириллицей.
  function englishOnly(text) {
    return String(text || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\([^)]*[а-яё][^)]*\)/gi, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .split(/[—–]\s|\s[—–]/).filter(p => !/[а-яё]/i.test(p)).join(', ')
      .replace(/[а-яё]+/gi, ' ')
      .replace(/_{2,}/g, ' ')
      .replace(/\s*\/\s*/g, ', ')
      .replace(/\s+/g, ' ').trim();
  }

  const web = {
    id:'web',
    get supported() { return !!synth; },
    speak(text) {
      return new Promise((resolve, reject) => {
        try {
          const u = new SpeechSynthesisUtterance(text);
          const v = pickVoice();
          if (v) { u.voice = v; u.lang = v.lang; } else u.lang = opts.accent;
          u.rate = opts.rate * 0.92;
          u.onend = () => resolve(); u.onerror = e => reject(e);
          synth.cancel(); synth.speak(u);
        } catch (e) { reject(e); }
      });
    },
    stop() { try { synth && synth.cancel(); } catch (e) {} }
  };
  let provider = web;

  return {
    get supported() { return !!(provider && provider.supported); },
    get hasEnglishVoice() { if (!voices.length) loadVoices(); return provider !== web || voices.length > 0; },
    voices() { if (!voices.length) loadVoices(); return voices.slice(); },
    configure(o) { Object.assign(opts, o || {}); },
    use(p) { if (p && typeof p.speak === 'function') provider = p; },
    englishOnly,
    say(text) {
      const t = englishOnly(text);
      if (!t) return Promise.resolve(false);
      last = t;
      if (!this.supported) return Promise.reject(new Error('unsupported'));
      return provider.speak(t, opts).then(() => true);
    },
    repeat() { return last ? this.say(last) : Promise.resolve(false); },
    stop() { provider.stop && provider.stop(); },
    get last() { return last; }
  };
})();

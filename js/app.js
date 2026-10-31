'use strict';
/* =========================================================
   TIME LAB · интерфейс, прогресс, сессии, мини-игры
   ========================================================= */

/* ---------- состояние и хранение ----------
   Гость: ключ timelab.v1 (как в первой версии — старый прогресс сохраняется).
   Вошедший пользователь: отдельный ключ timelab.u.<id>, данные разных людей не смешиваются. */
const GUEST_KEY = 'timelab.v1', ACTIVE_KEY = 'timelab.active';
const keyFor = id => id ? 'timelab.u.' + id : GUEST_KEY;
let STORE_KEY = GUEST_KEY;
const DAY = 864e5, INTV = [1, 3, 7, 14, 30];
function defaultPlan() { return { exp:null, method:null, levelSelf:null, levelDiag:null, goal:'tenses', len:'normal', perWeek:null, reviewOld:true, skipKnown:false, start:'ps', set:0 }; }
function defaultState() {
  return { v:2, created:Date.now(), updated:0, onboarded:false, xp:0, streak:0, best:0, unlocked:['ps'], current:'ps', labs:{}, rules:{}, verbs:{},
    verbsActive:START_VERBS.slice(), history:[], errors:[], attempts:[], ach:{},
    settings:{ rm:false, retry:false, gloss:true, voice:true, fxDetail:false, voiceAuto:false, voiceName:'', accent:'en-GB', rate:1 },
    profile:{ name:'', avatar:'a1' }, plan:defaultPlan(),
    starterDone:false, diagDone:false, totals:{ tasks:0, fixed:0, sessions:0 } };
}
const newId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
// Перевод сохранения любой версии в текущую. Ничего из старого прогресса не удаляется.
function upgrade(s) {
  if (!s || (s.v !== 1 && s.v !== 2) || typeof s.rules !== 'object') return null;
  const d = defaultState();
  const o = Object.assign(d, s, { v:2, settings:Object.assign(d.settings, s.settings), totals:Object.assign(d.totals, s.totals),
    profile:Object.assign(d.profile, s.profile), plan:Object.assign(defaultPlan(), s.plan) });
  if (!Array.isArray(o.attempts)) o.attempts = [];
  if (!Array.isArray(o.unlocked) || !o.unlocked.length) o.unlocked = ['ps'];
  o.unlocked = o.unlocked.filter(t => TENSE[t]);
  if (!TENSE[o.current]) o.current = o.unlocked[0];
  o.history.forEach(h => { if (!h.id) h.id = newId(); });
  if (s.v === 1) o.updated = s.updated || Date.now();
  return o;
}
function load(key) {
  try { const s = upgrade(JSON.parse(localStorage.getItem(key || STORE_KEY))); if (s) return s; } catch (e) {}
  return defaultState();
}
let ST = load(GUEST_KEY);
function save() {
  ST.updated = Date.now();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(ST)); } catch (e) {}
  if (typeof Cloud !== 'undefined') Cloud.schedule();
}
function useStore(uid) {
  STORE_KEY = keyFor(uid);
  ST = load(STORE_KEY);
  try { localStorage.setItem(ACTIVE_KEY, uid || ''); } catch (e) {}
  MG = null; VT = null; SES = null;
  applyVoiceSettings();
}

/* ---------- XP, уровни, достижения ---------- */
const LVL_NAMES = ['Стажёр','Лаборант','Ассистент','Исследователь','Хронотехник','Инженер времени','Мастер времени'];
const level = () => Math.floor(Math.sqrt(ST.xp / 60)) + 1;
const lvlFloor = l => 60 * (l - 1) * (l - 1);
function addXP(n) { ST.xp += n; }
const ACH = [
  { id:'first', name:'Первый эксперимент', d:'Заверши первое занятие' },
  { id:'starter', name:'Стартовое испытание', d:'Пройди стартовые 15 вопросов' },
  { id:'s10', name:'Цепная реакция', d:'Серия из 10 верных ответов' },
  { id:'s25', name:'Стабильный изотоп', d:'Серия из 25 верных ответов' },
  { id:'fix5', name:'Работа над ошибками', d:'Исправь 5 своих ошибок со второй попытки' },
  { id:'v10', name:'10 глаголов', d:'Выучи 10 неправильных глаголов' },
  { id:'v25', name:'25 глаголов', d:'Выучи 25 неправильных глаголов' },
  { id:'stage', name:'Этап пройден', d:'Пройди любой этап лаборатории' },
  { id:'boss', name:'Босс повержен', d:'Пройди финальное испытание' },
  { id:'clean', name:'Чистый эксперимент', d:'Пройди босса без ошибок' },
  { id:'badge', name:'Владение временем', d:'Получи первый значок времени' },
  { id:'t100', name:'100 заданий', d:'Выполни 100 заданий' },
  { id:'t500', name:'500 заданий', d:'Выполни 500 заданий' },
  { id:'diag', name:'Диагност', d:'Пройди добровольную диагностику' },
  { id:'murphy', name:'Комната Murphy', d:'Заверши тренировку в комнате Murphy' },
  { id:'review', name:'Возвращение', d:'Заверши занятие-повторение' },
  { id:'dialog', name:'Собеседник', d:'Заверши диалог с персонажем' }
];
function grant(id) { if (ST.ach[id]) return; ST.ach[id] = Date.now(); const a = ACH.find(x => x.id === id); addXP(25); toast('Достижение · ' + a.name, 'acid'); }
function checkAch() {
  if (ST.best >= 10) grant('s10'); if (ST.best >= 25) grant('s25');
  if (ST.totals.fixed >= 5) grant('fix5');
  const lv = srsLearned().length; if (lv >= 10) grant('v10'); if (lv >= 25) grant('v25');
  if (ST.totals.tasks >= 100) grant('t100'); if (ST.totals.tasks >= 500) grant('t500');
}

/* ---------- статистика правил и интервальное повторение ---------- */
function ruleSt(id) { return ST.rules[id] || (ST.rules[id] = { seen:0, ok:0, hist:[], err3:0, step:0, due:0, last:0 }); }
function mastery(id) {
  const r = ST.rules[id]; if (!r || !r.seen) return null;
  const h = r.hist.slice(-12); let w = 0, s = 0;
  h.forEach((x, i) => { const wt = 1 + i / h.length; w += wt; s += x * wt; });
  return s / w;
}
function recordRule(id, ok) {
  const r = ruleSt(id), now = Date.now();
  r.seen++; r.last = now; r.hist.push(ok ? 1 : 0); if (r.hist.length > 20) r.hist.shift();
  if (ok) { r.ok++; if (!r.due || now >= r.due) { const m = mastery(id); if (m >= 0.6 || r.seen < 3) r.step = Math.min(r.step + 1, 5); r.due = now + INTV[Math.max(0, r.step - 1)] * DAY; } }
  else { r.err3++; r.step = Math.max(0, r.step - 2); r.due = now + DAY; }
}
function ruleWeight(id) {
  const r = ST.rules[id]; if (!r || !r.seen) return 2.2;
  let w = 1 + 2.5 * (1 - mastery(id));
  if (r.due && r.due <= Date.now()) w += 1.2;
  if (r.seen < 4) w += 0.8;
  return w;
}
const playableRules = () => RULES_LIST.filter(r => ST.unlocked.includes(r.t) || (ST.rules[r.id] && ST.rules[r.id].seen));
function dueRules() { const now = Date.now(); return playableRules().filter(r => r.cat !== 'fx' && ST.rules[r.id] && ((ST.rules[r.id].due && ST.rules[r.id].due <= now) || (ST.rules[r.id].seen >= 3 && mastery(r.id) < 0.6))); }
function plannedRules() { const now = Date.now(); return playableRules().filter(r => ST.rules[r.id] && ST.rules[r.id].due > now).sort((a, b) => ST.rules[a.id].due - ST.rules[b.id].due); }
function verbSt(id) { return ST.verbs[id] || (ST.verbs[id] = { step:0, due:0, seen:0, ok:0 }); }
function recordVerb(id, ok) {
  const v = verbSt(id), now = Date.now();
  v.seen++;
  if (ok) { v.ok++; if (!v.due || now >= v.due) { v.step = Math.min(v.step + 1, 5); v.due = now + INTV[v.step - 1] * DAY; } }
  else { v.step = Math.max(0, v.step - 1); v.due = now; }
}
// выучен по повторениям (3 удачных интервала) или отмечен вручную
const srsLearned = () => Object.keys(ST.verbs).filter(k => ST.verbs[k].step >= 3);
const learnedVerbs = () => Object.keys(ST.verbs).filter(k => ST.verbs[k].step >= 3 || ST.verbs[k].mark);
const VERB = id => VERB_MAP[id] || VERB(id);
function verbQueue(n) {
  const now = Date.now(), act = ST.verbsActive;
  const due = act.filter(id => ST.verbs[id] && ST.verbs[id].due <= now);
  const fresh = act.filter(id => !ST.verbs[id] || !ST.verbs[id].seen);
  const rest = act.filter(id => !due.includes(id) && !fresh.includes(id));
  let q = [...shuffle(due), ...shuffle(fresh), ...shuffle(rest)];
  if (q.length < n) q = [...q, ...shuffle(VERB_DICT.filter(v => v.f <= 2).map(v => v.v1).filter(id => !q.includes(id)))];
  return q.slice(0, n);
}

/* ---------- кампания ---------- */
function lab(t) { return ST.labs[t] || (ST.labs[t] = { stages:{}, badge:false }); }
function stagePassed(t, s) { const x = lab(t).stages[s]; return !!(x && x.passed); }
const passedCount = t => STAGES.filter(s => stagePassed(t, s.id)).length;
// В режиме «пропускать знакомое» финальное испытание открыто сразу: знакомое время можно закрыть проверкой.
const bossOpen = t => passedCount(t) >= 5 || stagePassed(t, 'boss') || !!ST.plan.skipKnown;
function unlockChecks(t) {
  const L = lab(t), rs = rulesOf(t).filter(r => r.cat !== 'fx');
  const bossBest = (L.stages.boss && L.stages.boss.best) || 0;
  const weak = rs.filter(r => { const st = ST.rules[r.id]; return !st || st.seen < 5 || mastery(r.id) < 0.7; });
  const skip = !!ST.plan.skipKnown;
  const checks = [
    skip ? { label:`Режим «пропускать знакомое»: этапы по желанию (пройдено ${passedCount(t)}/8), решает финальное испытание`, ok:true }
      : { label:`Все 8 этапов пройдены (${passedCount(t)}/8)`, ok:passedCount(t) === 8 },
    { label:`Финальное испытание: не меньше 80% (лучший результат ${bossBest}%)`, ok:bossBest >= 80 },
    { label: weak.length ? `Каждое правило: от 5 попыток и от 70% (пока не готово: ${weak.map(r => r.name).join(', ')})` : 'Каждое правило: от 5 попыток и от 70%', ok:!weak.length }
  ];
  return { ok:checks.every(c => c.ok), checks };
}
const nextTense = t => ORDER[ORDER.indexOf(t) + 1];
function nextStage(t) { return STAGES.find(s => !stagePassed(t, s.id) && (s.id !== 'boss' || bossOpen(t))) || null; }

/* ---------- маршрутизация ---------- */
const app = document.getElementById('app');
let V = { name:'home' };
let SES = null, LAST = null, TIMER = null;
// Адрес экрана хранится в hash (#/verbs/lib) — так страница открывается после обновления
// на любом вложенном маршруте и на GitHub Pages с любым base path.
const ROUTES = ['home','lab','formulas','verbs','murphy','dialogs','profile'];
function go(name, arg, opt) {
  if (name === 'stats') { name = 'profile'; arg = arg || 'tenses'; }
  if (name !== 'session' && TIMER) { clearInterval(TIMER); TIMER = null; }
  V = { name, arg };
  if (ROUTES.includes(name) && !(opt && opt.noHash)) { const h = '#/' + name + (arg ? '/' + arg : ''); if (location.hash !== h) try { history.pushState(null, '', h); } catch (e) {} }
  render(); window.scrollTo(0, 0);
}
function routeFromHash() {
  const m = (location.hash || '').match(/^#\/([a-z]+)(?:\/([\w|-]+))?$/);
  if (!m || !ROUTES.includes(m[1])) return { name:'home' };
  if ((m[1] === 'lab' || m[1] === 'formulas') && m[2] && !TENSE[m[2]]) return { name:'home' };
  if (m[1] === 'lab' && !m[2]) return { name:'home' };
  return { name:m[1], arg:m[2] };
}
window.addEventListener('popstate', () => {
  if (/access_token|error_description/.test(location.hash)) return;
  if (SES && !SES.done) { if (SES.results.length) { finishSession(); return; } SES = null; }
  const r = routeFromHash(); go(r.name, r.arg, { noHash:true });
});
function render() {
  document.documentElement.classList.toggle('rm', !!ST.settings.rm);
  document.documentElement.classList.toggle('nogloss', !ST.settings.gloss);
  let body = '';
  switch (V.name) {
    case 'home': body = vHome(); break;
    case 'lab': body = vLab(V.arg); break;
    case 'session': body = vSession(); break;
    case 'results': body = vResults(); break;
    case 'formulas': body = vFormulas(V.arg || ST.current); break;
    case 'verbs': body = vVerbs(V.arg || 'lib'); break;
    case 'murphy': body = vMurphy(); break;
    case 'profile': body = vProfile(V.arg || 'overview'); break;
    case 'dialogs': body = vDialogs(); break;
    default: body = vHome();
  }
  app.innerHTML = vHeader() + body + vFooter();
  if (V.name === 'session') mountSession();
  if (V.name === 'verbs') mountVerbs(V.arg || 'lib');
  if (V.name === 'profile') mountProfile(V.arg || 'overview');
  if (!ST.onboarded) showOnboarding();
}

/* ---------- мелкие компоненты ---------- */
function toast(msg, tone) {
  const el = document.getElementById('toast');
  const d = document.createElement('div'); d.className = 'toast ' + (tone || ''); d.textContent = msg;
  el.appendChild(d); setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3100);
}
const pct = x => x == null ? '—' : Math.round(x * 100) + '%';
const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
const fmtDT = ts => new Date(ts).toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
function relDue(ts) { const d = Math.ceil((ts - Date.now()) / DAY); return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн. · ${fmtDate(ts)}`; }
const pad2 = n => String(n).padStart(2, '0');
function bar(v, cls) { return `<span class="bar ${cls || ''}"><i style="width:${v == null ? 0 : Math.round(v * 100)}%"></i></span>`; }
function zig(a, b, y) { let d = `M${a} ${y}`, up = true; for (let x = a + 6; x <= b; x += 6) { d += ` L${x} ${y + (up ? -6 : 6)}`; up = !up; } return d + ` L${b} ${y}`; }
function tlSVG(kind, cls) {
  const y = 38;
  const X = x => `<path d="M${x - 6} ${y - 6} L${x + 6} ${y + 6} M${x + 6} ${y - 6} L${x - 6} ${y + 6}" class="tl-x"/>`;
  const B = (a, b) => `<path d="${zig(a, b, y)}" class="tl-bar"/>`;
  const D = (x, c) => `<circle cx="${x}" cy="${y}" r="5" class="${c || 'tl-dot'}"/>`;
  const dl = x => `<line x1="${x}" y1="${y - 20}" x2="${x}" y2="${y + 14}" class="tl-dl"/><text x="${x}" y="${y - 24}" class="tl-t" text-anchor="middle">BY</text>`;
  const arc = (a, b) => `<path d="M${a} ${y - 6} Q${(a + b) / 2} ${y - 34} ${b} ${y - 8}" class="tl-arc"/>`;
  const g = {
    habit:[40,80,120,160,200,240,280].map(x => D(x)).join(''),
    now:B(172, 228), pastpt:X(100), pastproc:B(50, 150) + X(118), perf:D(100) + arc(100, 196), perfc:B(90, 200),
    pastperf:D(70, 'tl-dot hot') + X(140) + arc(70, 138), pastperfc:B(40, 134) + X(140), fut:X(270), futproc:B(244, 296),
    futperf:D(250) + dl(286), futperfc:B(212, 286) + dl(286)
  }[kind] || '';
  return `<svg class="tl ${cls || ''}" viewBox="0 0 320 76" role="img" aria-label="Временная шкала"><line x1="10" y1="${y}" x2="306" y2="${y}" class="tl-axis"/><path d="M304 ${y - 4} L312 ${y} L304 ${y + 4}" class="tl-axis"/><line x1="200" y1="${y - 14}" x2="200" y2="${y + 14}" class="tl-now"/><text x="200" y="${y + 30}" class="tl-t now" text-anchor="middle">NOW</text><text x="12" y="${y + 30}" class="tl-t">PAST</text><text x="306" y="${y + 30}" class="tl-t" text-anchor="end">FUTURE</text>${g}</svg>`;
}

/* ---------- шапка и подвал ---------- */
function vHeader() {
  const l = level(), a = lvlFloor(l), b = lvlFloor(l + 1);
  const nav = [['home','Карта'],['formulas','Формулы'],['verbs','Глаголы'],['dialogs','Диалоги'],['murphy','Murphy'],['profile','Профиль']];
  return `<header class="top"><div class="wrap top-in">
    <button class="logo" data-act="go" data-arg="home" aria-label="TIME LAB — на карту"><span class="logo-mark">TL</span><span class="logo-txt">TIME LAB</span></button>
    <nav class="nav" aria-label="Разделы">${nav.map(([k, n]) => `<button class="nav-b ${V.name === k ? 'on' : ''}" data-act="go" data-arg="${k}">${n}</button>`).join('')}</nav>
    <div class="me">
      <span class="lvl mono" title="${LVL_NAMES[Math.min(l - 1, LVL_NAMES.length - 1)]}">LV.${pad2(l)}</span>
      <span class="xpw"><span class="xpbar"><i style="width:${Math.round((ST.xp - a) / (b - a) * 100)}%"></i></span><span class="mono xp">${ST.xp} XP</span></span>
      <span class="streak mono" title="Серия верных ответов подряд">×${ST.streak}</span>
      ${syncChip()}${meButton()}
    </div></div></header>`;
}
function vFooter() { return `<footer class="foot wrap"><span class="mono">TIME LAB · v2 · ${storageNote()}</span><span class="mono">Essential Grammar in Use · Murphy / Sands</span></footer>`; }

/* ---------- главная: карта ---------- */
function labTile(t) {
  const T = TENSE[t], on = ST.unlocked.includes(t), L = lab(t), cur = ST.current === t;
  const st = L.badge ? 'Значок получен' : on ? `${passedCount(t)}/8 этапов` : 'Закрыто';
  return `<button class="tile ${on ? 'open' : 'locked'} ${cur ? 'cur' : ''} ${L.badge ? 'done' : ''}" data-act="lab" data-arg="${t}">
    <span class="tile-n mono">${pad2(T.n)}</span>
    <span class="tile-name">${T.name}</span>
    <span class="tile-ru">${T.ru}</span>
    ${tlSVG(T.tl, 'mini')}
    <span class="tile-st mono">${on ? '' : '<span class="lock" aria-hidden="true"></span>'}${st}</span>
  </button>`;
}
function vHome() {
  const t = ST.current, T = TENSE[t], ns = nextStage(t), uc = unlockChecks(t), nx = nextTense(t);
  const due = dueRules(), plan = plannedRules().slice(0, 6);
  const rs = rulesOf(t).filter(r => r.cat !== 'fx');
  const banners = [];
  if (!ST.starterDone && t === 'ps') banners.push(`<div class="banner"><div><span class="mono tag-o">СТАРТ</span><b>Стартовое испытание Present Simple</b><p>15 новых вопросов: do/does, have/has, be, отрицания, вопросы и окончания. После него будет видно, какие правила уже получаются.</p></div><button class="btn pri" data-act="starter">Начать испытание</button></div>`);
  if (uc.ok && nx && !ST.unlocked.includes(nx)) banners.push(`<div class="banner acid"><div><span class="mono tag-a">ГОТОВО</span><b>${T.name} пройден. Можно открыть ${TENSE[nx].name}.</b><p>Переход только по твоей кнопке. Пока не нажмёшь, задания по ${T.name} продолжают генерироваться.</p></div><button class="btn acid" data-act="unlock" data-arg="${t}">Открыть следующее время</button></div>`);
  return `<main class="wrap home">
  <section class="hero">
    <div class="hero-l">
      <div class="kicker mono">EN / RU · 12 TENSES · A1 → B2</div>
      <h1 class="mega"><span class="m1">TIME</span><span class="m2">LAB</span></h1>
      <p class="lead">Лаборатория английских времён. Двенадцать времён — двенадцать лабораторий. Формулы доводим до автоматизма, а затем учимся строить предложения без подсказок.</p>
    </div>
    <div class="hero-r now-card">
      <div class="nc-top mono"><span>LAB ${pad2(T.n)}</span><span class="live">ИЗУЧАЕТСЯ</span></div>
      <h2 class="nc-name">${T.name}</h2>
      <p class="nc-mean">${T.meaning}</p>
      ${tlSVG(T.tl, 'big')}
      <div class="stage-dots" aria-label="Этапы">${STAGES.map(s => `<span class="sd ${stagePassed(t, s.id) ? 'ok' : ''} ${ns && ns.id === s.id ? 'next' : ''}" title="${s.name}"></span>`).join('')}</div>
      <div class="row">
        ${ns ? `<button class="btn pri" data-act="stage" data-arg="${t}|${ns.id}">Продолжить: ${ns.name}</button>` : `<button class="btn pri" data-act="mode" data-arg="${t}|test">Тест по ${T.name}</button>`}
        <button class="btn ghost" data-act="lab" data-arg="${t}">Лаборатория</button>
      </div>
    </div>
  </section>
  ${banners.join('')}
  ${vRoutePanel()}
  <section class="block">
    <div class="block-h"><h3>Занятие</h3><span class="mono sub">выбери длительность · задания по ${T.name}${ST.unlocked.length > 1 ? ' + повторение пройденного' : ''}</span></div>
    <div class="modes">
      ${modeBtn(t, 'warm', '5 мин', 'Быстрая разминка', '6 лёгких заданий')}
      ${modeBtn(t, 'normal', '10–15 мин', 'Обычная тренировка', '12 заданий')}
      ${modeBtn(t, 'full', '20–30 мин', 'Полноценное занятие', '20 заданий, перевод и диалоги')}
      ${modeBtn(t, 'free', '∞', 'Свободный режим', 'без ограничения')}
      ${modeBtn(t, 'short', 'ТЕСТ S', 'Короткий тест', '6 вопросов')}
      ${modeBtn(t, 'test', 'ТЕСТ', 'Обычный тест', '12 вопросов')}
    </div>
    <div class="quick">
      <span class="mono sub">Быстрые игры · 2–5 минут</span>
      <button class="chipbtn" data-act="blitz" data-arg="${t}">Блиц 60 секунд</button>
      <button class="chipbtn" data-act="tlgame">Спасение временной линии</button>
      <button class="chipbtn" data-act="go" data-arg="dialogs">Диалоговый симулятор</button>
      <button class="chipbtn" data-act="go" data-arg="verbs|match">Карточки памяти: глаголы</button>
      <button class="chipbtn" data-act="go" data-arg="verbs|type">Спринт форм V2 / V3</button>
      ${due.length ? `<button class="chipbtn hot" data-act="review">Повторение · ${due.length}</button>` : ''}
    </div>
  </section>
  <section class="block">
    <div class="block-h"><h3>Карта лабораторий</h3><span class="mono sub">строки — время, столбцы — аспект · номер — порядок кампании</span></div>
    <div class="map">
      <div class="map-cols mono"><span></span>${COLS.map(c => `<span>${c}</span>`).join('')}</div>
      ${ROWS.map((rw, ri) => `<div class="map-row"><span class="map-rl mono">${rw}</span>${[0,1,2,3].map(ci => labTile(TENSES.find(x => x.row === ri && x.col === ci).id)).join('')}</div>`).join('')}
    </div>
  </section>
  <section class="dash">
    <div class="panel span2">
      <div class="panel-h"><h4>Освоение правил · ${T.name}</h4><span class="mono sub">по последним ответам</span></div>
      <ul class="rules">${rs.map(r => ruleRow(r)).join('')}</ul>
    </div>
    <div class="panel">
      <div class="panel-h"><h4>Требуют повторения</h4></div>
      ${due.length ? `<ul class="plain">${due.slice(0, 6).map(r => `<li><span>${r.name}</span><span class="mono sub">${TENSE[r.t].name}</span></li>`).join('')}</ul><button class="btn sm" data-act="review">Начать повторение</button>` : '<p class="empty">Пока нет. Правила с ошибками появятся здесь.</p>'}
    </div>
    <div class="panel">
      <div class="panel-h"><h4>Запланировано</h4><span class="mono sub">1 · 3 · 7 · 14 · 30 дн.</span></div>
      ${plan.length ? `<ul class="plain">${plan.map(r => `<li><span>${r.name}</span><span class="mono sub">${relDue(ST.rules[r.id].due)}</span></li>`).join('')}</ul>` : '<p class="empty">Расписание появится после первых заданий.</p>'}
    </div>
    <div class="panel">
      <div class="panel-h"><h4>Неправильные глаголы</h4></div>
      <div class="bignum"><b>${learnedVerbs().length}</b><span>выучено из ${VERB_DICT.length}</span></div>
      <p class="sub">В изучении: ${ST.verbsActive.length}. Выученным считается глагол, верно названный на трёх интервальных повторениях.</p>
      <button class="btn sm" data-act="go" data-arg="verbs|match">Тренировать</button>
    </div>
    <div class="panel">
      <div class="panel-h"><h4>Серии</h4></div>
      <div class="bignum"><b>${ST.streak}</b><span>сейчас · лучшая ${ST.best}</span></div>
      <p class="sub">Заданий: ${ST.totals.tasks} · исправлено своих ошибок: ${ST.totals.fixed}</p>
    </div>
    <div class="panel span2">
      <div class="panel-h"><h4>История тестов</h4><button class="link" data-act="go" data-arg="stats">вся статистика</button></div>
      ${ST.history.length ? `<table class="hist"><tbody>${ST.history.slice(-6).reverse().map(h => histRow(h)).join('')}</tbody></table>` : '<p class="empty">Здесь будут результаты занятий и тестов.</p>'}
    </div>
    <div class="panel full">
      <div class="panel-h"><h4>Достижения</h4><span class="mono sub">${Object.keys(ST.ach).length}/${ACH.length}</span></div>
      <div class="ach">${ACH.map(a => `<span class="ach-i ${ST.ach[a.id] ? 'on' : ''}" title="${esc(a.d)}"><b>${a.name}</b><small>${a.d}</small></span>`).join('')}</div>
    </div>
  </section></main>`;
}
function modeBtn(t, m, big, name, d) { return `<button class="mode ${ST.plan.len === m ? 'rec' : ''}" data-act="mode" data-arg="${t}|${m}">${ST.plan.len === m ? '<span class="mode-rec mono">ТВОЙ РИТМ</span>' : ''}<span class="mode-big">${big}</span><span class="mode-n">${name}</span><span class="mode-d mono">${d}</span></button>`; }
function ruleRow(r) {
  const st = ST.rules[r.id], m = mastery(r.id);
  const lbl = !st ? 'нет данных' : st.seen < 4 ? `мало данных · ${st.seen}` : pct(m);
  const cls = !st || st.seen < 4 ? 'na' : m >= 0.8 ? 'good' : m >= 0.6 ? 'mid' : 'low';
  return `<li class="rule ${cls}"><span class="rule-n">${r.name}</span>${bar(st && st.seen >= 4 ? m : st ? m * 0.999 : null, cls)}<span class="mono rule-v">${lbl}</span></li>`;
}
function histRow(h) {
  const p = h.total ? Math.round(h.ok / h.total * 100) : 0;
  return `<tr><td class="mono sub">${fmtDT(h.d)}</td><td>${esc(h.title)}</td><td class="mono">${h.ok}/${h.total}</td><td>${bar(h.total ? h.ok / h.total : 0, p >= 80 ? 'good' : p >= 60 ? 'mid' : 'low')}</td></tr>`;
}

/* ---------- лаборатория ---------- */
function vLab(t) {
  const T = TENSE[t], on = ST.unlocked.includes(t), L = lab(t), uc = unlockChecks(t), nx = nextTense(t);
  const murphyT = ['past','pastc'].includes(t);
  const head = `<button class="back" data-act="go" data-arg="home">← Карта</button>
    <section class="lab-h">
      <div><div class="mono kicker">LAB ${pad2(T.n)} · ${ROWS[T.row]} / ${COLS[T.col]}</div><h1 class="lab-name">${T.name}</h1><p class="lead">${T.ru} — ${T.meaning}.</p>
      ${L.badge ? '<span class="badge-own mono">ЗНАЧОК ВЛАДЕНИЯ ВРЕМЕНЕМ</span>' : ''}${on && L.by && !['start','campaign'].includes(L.by) ? `<span class="mono sub">${L.by === 'manual' ? 'открыто вручную' : L.by === 'diag' ? 'открыто по диагностике' : 'открыто по выбранному уровню'} · освоение — по ответам</span>` : ''}</div>
      <div class="lab-tl">${tlSVG(T.tl, 'big')}</div>
    </section>
    <section class="fx3">${fxBlock('+', 'Утверждение', T.f.pos, T.ex.pos[0])}${fxBlock('−', 'Отрицание', T.f.neg, T.ex.neg[0])}${fxBlock('?', 'Вопрос', T.f.q, T.ex.q[0])}</section>
    <p class="row"><button class="link" data-act="go" data-arg="formulas|${t}">Подробное объяснение и карточки →</button></p>`;
  if (!on) {
    return `<main class="wrap labv">${head}<div class="banner"><div><span class="mono tag-o">ЗАКРЫТО В КАМПАНИИ</span><b>По порядку кампании эта лаборатория откроется позже.</b><p>Обычно её открывает кнопка «Открыть следующее время» после предыдущего времени. Если тема уже знакома, лабораторию можно открыть сейчас — освоенной она от этого не станет, освоение считается только по ответам.${murphyT ? ' Тренировка по этому времени есть и в комнате Murphy.' : ''}</p></div><div class="row"><button class="btn pri" data-act="openLab" data-arg="${t}">Открыть сейчас</button>${murphyT ? '<button class="btn ghost" data-act="go" data-arg="murphy">Комната Murphy</button>' : ''}</div></div></main>`;
  }
  return `<main class="wrap labv">${head}
    <section class="block"><div class="block-h"><h3>Этапы</h3><span class="mono sub">${passedCount(t)}/8 · порог прохождения 75%, у босса — 80%</span></div>
      <ol class="stages">${STAGES.map((s, i) => {
        const x = L.stages[s.id], locked = s.id === 'boss' && !bossOpen(t);
        return `<li class="stage ${x && x.passed ? 'ok' : ''} ${locked ? 'locked' : ''}">
          <span class="st-n mono">${pad2(i + 1)}</span>
          <div class="st-b"><b>${s.name}</b><span class="sub">${s.d}${locked ? ' · откроется после 5 пройденных этапов' : ''}</span></div>
          <span class="st-r mono">${x ? `лучший ${x.best}%` : '—'}</span>
          <button class="btn sm ${x && x.passed ? 'ghost' : 'pri'}" data-act="stage" data-arg="${t}|${s.id}" ${locked ? 'disabled' : ''}>${x && x.passed ? 'Ещё раз' : 'Начать'}</button></li>`;
      }).join('')}</ol></section>
    <section class="block"><div class="block-h"><h3>Тренировки и тесты</h3><span class="mono sub">задания генерируются заново каждый раз</span></div>
      <div class="modes">${modeBtn(t, 'warm', '5 мин', 'Разминка', '6 заданий')}${modeBtn(t, 'normal', '10–15', 'Тренировка', '12 заданий')}${modeBtn(t, 'full', '20–30', 'Занятие', '20 заданий')}${modeBtn(t, 'free', '∞', 'Свободно', 'без лимита')}${modeBtn(t, 'short', 'S', 'Короткий тест', '6 вопросов')}${modeBtn(t, 'test', 'T', 'Тест', '12 вопросов')}</div>
      <div class="quick"><span class="mono sub">Мини-игры</span><button class="chipbtn" data-act="blitz" data-arg="${t}">Блиц 60 секунд</button><button class="chipbtn" data-act="tlgame" data-arg="${t}">Временная линия</button><button class="chipbtn" data-act="go" data-arg="dialogs">Диалоги</button></div>
    </section>
    <section class="dash"><div class="panel span2"><div class="panel-h"><h4>Правила этого времени</h4></div><ul class="rules">${rulesOf(t).map(ruleRow).join('')}</ul></div>
      <div class="panel span2 unlock ${uc.ok ? 'ready' : ''}"><div class="panel-h"><h4>Переход к следующему времени</h4></div>
        <ul class="checks">${uc.checks.map(c => `<li class="${c.ok ? 'ok' : ''}"><span class="ck" aria-hidden="true"></span>${esc(c.label)}</li>`).join('')}</ul>
        ${nx ? (ST.unlocked.includes(nx) ? `<p class="sub">${TENSE[nx].name} уже открыт.</p>` : `<button class="btn acid" data-act="unlock" data-arg="${t}" ${uc.ok ? '' : 'disabled'}>Открыть следующее время · ${TENSE[nx].name}</button>
        <p class="sub">${uc.ok ? 'Готово. Переход произойдёт только после нажатия.' : 'Пока условия не выполнены, тренировки по этому времени бесконечны.'}</p>`) : '<p class="sub">Это последнее время кампании.</p>'}
      </div></section></main>`;
}
function fxBlock(sym, name, f, ex) { return `<div class="fx"><span class="fx-sym">${sym}</span><span class="mono fx-l">${name}</span><code class="fx-f">${esc(f)}</code><span class="fx-ex">${glossText(ex)} ${spk(ex)}</span></div>`; }

/* ---------- конфигурации занятий ---------- */
function reviewTenses(t) { return ST.unlocked.filter(x => ORDER.indexOf(x) < ORDER.indexOf(t)); }
function cfgMode(t, m) {
  const T = TENSE[t];
  const M = { warm:{ n:6, stage:'quick', title:'Разминка' }, normal:{ n:12, title:'Тренировка' }, full:{ n:20, title:'Полноценное занятие' }, free:{ n:Infinity, title:'Свободный режим' },
    short:{ n:6, title:'Короткий тест', test:1 }, test:{ n:12, title:'Тест', test:1 } }[m];
  return { kind:'practice', mode:m, t, tenses:[t], review:reviewTenses(t), stage:M.stage || 'any', n:M.n, title:`${M.title} · ${T.name}` };
}
function cfgStage(t, s) {
  const S = STAGES.find(x => x.id === s);
  const c = { kind:'stage', t, stage:s, tenses:[t], review: s === 'dist' || s === 'boss' ? reviewTenses(t) : [], n:S.n, title:`${TENSE[t].name} · ${S.name}` };
  if (s === 'boss') { c.kind = 'boss'; c.defer = true; c.pre = bossTasks(t, c.review); }
  return c;
}
function bossTasks(t, rev) {
  const pool = [];
  for (let i = 0; i < 60 && pool.length < 40; i++) { const x = pickTask({ tenses:Math.random() < 0.2 && rev.length ? rev : [t], stage:'any' }, pool); if (x) pool.push(x); }
  const by = d => shuffle(pool.filter(x => (d === 2 ? x.diff <= 2 : x.diff === d)));
  let out = [...by(2).slice(0, 5), ...by(3).slice(0, 5), ...by(4).slice(0, 5)];
  for (const x of pool) { if (out.length >= 15) break; if (!out.includes(x)) out.push(x); }
  return out.slice(0, 15).sort((a, b) => a.diff - b.diff);
}
function cfgStarter() {
  const ids = ['ps_dodoes','ps_be','ps_havehas','ps_s','ps_dodoes','ps_neg','ps_be','ps_havehas','ps_q','ps_s','ps_neg','ps_be','ps_havehas','ps_q','ps_dodoes'];
  const pre = ids.map((id, i) => genForRule(id, { maxDiff: i < 6 ? 2 : 3, notMech:'translate' })).filter(Boolean);
  return { kind:'starter', t:'ps', pre, n:pre.length, title:'Стартовое испытание · Present Simple' };
}
// Диагностика: 15 вопросов от Present Simple до Past Perfect и Future Simple — ориентир, а не сертификат.
const DIAG_IDS = ['ps_dodoes','ps_be','ps_q','pc_form','pc_q','past_waswere','past_did_v1','past_irregular','pastc_form','pastc_whenwhile','pp_form','pp_neg_q','ppc_form','pastp_form','fs_form'];
function cfgDiag() {
  const ids = DIAG_IDS.filter(id => RULES[id]);
  const pre = ids.map(id => genForRule(id, { maxDiff:3, notMech:'translate' })).filter(Boolean);
  return { kind:'diag', t:'ps', pre, n:pre.length, title:'Добровольная диагностика' };
}
function cfgReview() {
  const ids = dueRules().map(r => r.id);
  return { kind:'review', t:ST.current, rules: ids.length ? ids : playableRules().filter(r => r.cat !== 'fx').map(r => r.id), stage:'any', n:Math.min(12, Math.max(6, ids.length * 2)), title:'Повторение' };
}
function cfgRules(ids, title) { return { kind:'review', t:ST.current, rules:[...new Set(ids)], stage:'any', n:Math.min(10, Math.max(5, ids.length * 2)), title:title || 'Работа над ошибками' }; }
const MURPHY = {
  waswere:{ name:'was / were', rules:['past_waswere','pastc_waswere','past_was_did'], d:'Be в прошлом, was/were + V-ing и выбор между was/were и did' },
  past:{ name:'Past Simple', rules:['past_fx','past_did_v1','past_irregular','past_q','past_was_did','past_use','past_waswere'], d:'Murphy, разделы 11–13: V2, did/didn\'t + V1, вопросы' },
  pastc:{ name:'Past Continuous', rules:['pastc_fx','pastc_waswere','pastc_form','pastc_neg_q','pastc_whenwhile','pastc_vs_past'], d:'Murphy, разделы 14–15: процесс в прошлом, when / while' },
  mix:{ name:'Смешанная тренировка', rules:['past_waswere','past_did_v1','past_irregular','past_q','past_was_did','pastc_waswere','pastc_form','pastc_neg_q','pastc_whenwhile','pastc_vs_past'], d:'Всё прошедшее вперемешку' }
};
function cfgMurphy(k) { const M = MURPHY[k]; return { kind:'murphy', t:'past', rules:M.rules, stage:'any', n:10, title:'Murphy · ' + M.name }; }
function cfgBlitz(t) { return { kind:'blitz', t, tenses:[t], review:reviewTenses(t), stage:'easy', n:Infinity, blitz:true, limit:60, diff:1, title:`Блиц 60 секунд · ${TENSE[t].name}` }; }
const TL_RULE = { ps:'ps_vs_pc', pc:'pc_use', past:'past_use', pastc:'pastc_vs_past' };
function cfgTimeline(t) {
  const ts = t ? [t] : ST.unlocked;
  const pre = Array.from({ length:8 }, () => { const x = pick(ts); return genTimeline(RULES[TL_RULE[x] || x + '_use'], x); }).filter(Boolean);
  return { kind:'tlgame', t:t || ST.current, pre, n:pre.length, title:'Спасение временной линии' };
}
function cfgDialog(id) {
  const d = DIALOGS.find(x => x.id === id);
  const pre = d.steps.map(s => genChat(RULES[s.rule], s, d)).filter(Boolean);
  return { kind:'dialog', t:d.t, pre, n:pre.length, dialog:d, title:`Диалог · ${d.who}: ${d.title}` };
}
function cfgFormula(t) { return { kind:'practice', mode:'formula', t, tenses:[t], stage:'formula', n:6, title:`Проверь себя · формулы ${TENSE[t].name}` }; }

/* ---------- выбор следующего задания ---------- */
function pickTask(cfg, recentTasks) {
  let rules, stage = cfg.stage || 'any';
  if (cfg.rules) rules = cfg.rules.map(id => RULES[id]).filter(Boolean);
  else {
    let ts = cfg.tenses;
    if (cfg.review && cfg.review.length && stage !== 'formula' && Math.random() < reviewShare()) { ts = cfg.review; if (stage !== 'easy' && stage !== 'quick') stage = 'any'; }
    rules = ts.flatMap(rulesOf);
  }
  let pairs = rules.flatMap(r => { const sp = r.gens.filter(s => specFits(r, s, stage)); return sp.map(s => ({ r, s, w:ruleWeight(r.id) / sp.length })); });
  if (!pairs.length) pairs = rules.flatMap(r => r.gens.filter(s => specFits(r, s, 'any')).map(s => ({ r, s, w:1 })));
  const last = (recentTasks || []).slice(-2);
  pairs.forEach(p => { if (last.some(x => x.rule === p.r.id)) p.w *= 0.35; if (last.length && last[last.length - 1].mech === p.s[0]) p.w *= 0.5; p.w *= goalBoost(p.s[0]); });
  for (let i = 0; i < 12; i++) {
    const tot = pairs.reduce((a, p) => a + p.w, 0); let x = Math.random() * tot, p = pairs[0];
    for (const q of pairs) { x -= q.w; if (x <= 0) { p = q; break; } }
    const t = genSpec(p.r, p.s, cfg.diff);
    if (t) return t;
  }
  return null;
}

/* ---------- сессия ---------- */
function startSession(cfg) {
  if (!cfg || (cfg.pre && !cfg.pre.length)) { toast('Не удалось собрать задания'); return; }
  SES = Object.assign({}, cfg, { cfg, idx:0, results:[], inject:[], later:[], start:Date.now(), cur:null, attempt:0, hint:false, log:[], done:false });
  go('session');
  nextTask();
  TIMER = setInterval(tick, 1000);
}
function tick() {
  const el = document.getElementById('timer'); if (!el || !SES) return;
  const s = Math.floor((Date.now() - SES.start) / 1000);
  if (SES.limit) { const left = Math.max(0, SES.limit - s); el.textContent = `${pad2(Math.floor(left / 60))}:${pad2(left % 60)}`; el.classList.toggle('hot', left <= 10); if (left <= 0) finishSession(); }
  else el.textContent = `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}
function sessionDone() {
  if (SES.limit) return (Date.now() - SES.start) / 1000 >= SES.limit;
  if (SES.n === Infinity) return false;
  if (SES.inject.length) return false;
  if (SES.pre) return SES.idx >= SES.pre.length;
  return SES.results.length >= SES.n;
}
function nextTask() {
  if (!SES) return;
  if (sessionDone()) return finishSession();
  let task = null;
  const li = SES.later.findIndex(l => l.at <= SES.results.length);
  if (SES.inject.length) task = SES.inject.shift();
  else if (li >= 0) { const l = SES.later.splice(li, 1)[0]; task = genForRule(l.rule, {}); if (task) task.back = 1; }
  else if (SES.pre) task = SES.pre[SES.idx++];
  else task = pickTask(SES, SES.results.map(r => r.task));
  if (!task) task = pickTask({ tenses:[SES.t], stage:'any' });
  SES.cur = task; SES.attempt = 0; SES.hint = false; SES.checked = false;
  mountSession();
}
function scored() { return SES.results.length; }
function renderSesTop() {
  const top = document.getElementById('ses-top'); if (!top) return;
  const n = SES.n === Infinity ? null : SES.n;
  const okN = SES.results.filter(r => r.ok).length;
  top.innerHTML = `<button class="back" data-act="quit">← Завершить</button><div class="ses-title">${esc(SES.title)}</div>
    <span class="mono ses-c">${n ? `${Math.min(scored() + (SES.checked ? 0 : 1), n)} / ${n}` : `${scored()} выполнено`}</span><span class="mono ses-ok">✓ ${okN}</span><span class="mono" id="timer">00:00</span>`;
  const pr = document.getElementById('ses-pr');
  if (pr) pr.innerHTML = n && n <= 25 ? Array.from({ length:n }, (_, i) => { const r = SES.results[i]; return `<i class="${r ? (SES.defer ? 'done' : r.ok ? 'ok' : 'bad') : i === scored() ? 'cur' : ''}"></i>`; }).join('') : '';
  tick();
}
function vSession() { return `<main class="wrap ses"><div class="ses-top" id="ses-top"></div><div class="ses-pr" id="ses-pr"></div><div id="task"></div><div id="fb"></div></main>`; }
const MECH_NAME = { choice:'ВЫБЕРИ ФОРМУ', tf:'ВЕРНО / НЕВЕРНО', multi:'НЕСКОЛЬКО ОТВЕТОВ', build:'КОНСТРУКТОР ПРЕДЛОЖЕНИЙ', fix:'НАЙДИ ОШИБКУ', input:'ВПИШИ ФОРМУ',
  translate:'ПЕРЕВЕДИ СИТУАЦИЮ', chat:'ДИАЛОГ', timeline:'СПАСЕНИЕ ВРЕМЕННОЙ ЛИНИИ', lesson:'РАЗБОР ПРАВИЛА' };
let UI = null;
function mountSession() {
  if (!SES || V.name !== 'session') return;
  renderSesTop();
  const box = document.getElementById('task'), fb = document.getElementById('fb');
  if (!box) return;
  fb.innerHTML = '';
  const t = SES.cur; if (!t) return;
  const r = RULES[t.rule];
  if (t.type === 'lesson') {
    box.innerHTML = `<div class="task card lesson"><div class="t-head"><span class="chip warn">${esc(t.chip)}</span><span class="mono t-mech">${MECH_NAME.lesson}</span></div>
      <h3 class="t-instr">Три ошибки подряд в правиле «${esc(r.name)}». Разберём его коротко.</h3>
      <div class="les"><p>${esc(r.explain)}</p><div class="les-f"><span class="lbl">Формула</span><code>${esc(r.formula)}</code></div><div class="les-e"><span class="lbl">Пример</span>${glossText(r.example)} ${spk(r.example)}</div>
      <p class="sub">Дальше: одно простое задание на это правило, затем то же правило в новой ситуации. Через несколько заданий правило вернётся, и оно уже стоит в плане повторения на завтра.</p></div>
      <div class="t-ctrl"><button class="btn pri" data-act="next">Понятно, дальше</button></div></div>`;
    UI = null; return;
  }
  const chip = t.noChip ? '<span class="chip">?</span>' : `<span class="chip">${esc(t.chip)}</span>`;
  box.innerHTML = `<div class="task card ${SES.blitz ? 'blitz' : ''}"><div class="t-head">${chip}<span class="mono t-mech">${MECH_NAME[t.type] || ''}${t.back ? ' · ВОЗВРАТ К ОШИБКЕ' : ''}</span>${SES.defer ? '<span class="mono t-boss">БОСС · разбор в конце</span>' : ''}</div>
    <h3 class="t-instr">${esc(t.instr)}</h3><div class="t-body" id="t-body"></div>
    <div class="t-hint" id="t-hint" hidden></div>
    <div class="t-msg" id="t-msg" hidden></div>
    ${SES.blitz && (t.type === 'tf' || (['choice','chat'].includes(t.type) && t.labels)) ? '' : SES.blitz ? '<div class="t-ctrl"><button class="btn pri" data-act="check">Проверить</button></div>' : `<div class="t-ctrl"><button class="btn ghost" data-act="hint">Подсказка</button><button class="btn pri" data-act="check">Проверить</button></div>`}</div>`;
  UI = mountTask(t, document.getElementById('t-body'));
  const inp = box.querySelector('input[type=text]'); if (inp && !matchMedia('(pointer:coarse)').matches) inp.focus();
}

/* ---------- отрисовка заданий ---------- */
function optList(labels, mono) { return `<div class="opts ${mono ? 'mono-opts' : ''}">${labels.map((l, i) => `<button type="button" class="opt" data-i="${i}" aria-pressed="false"><span class="opt-k mono">${String.fromCharCode(65 + i)}</span><span class="opt-t">${glossText(l)}</span></button>`).join('')}</div>`; }
function chatHead(t) {
  const log = SES && SES.dialog ? SES.log : [];
  return `<div class="chat"><div class="chat-h"><span class="ava">${esc(t.who[0])}</span><b>${esc(t.who)}</b><span class="sub">${esc(t.role)}</span></div>
    <div class="chat-log">${log.map(m => `<div class="bub ${m.me ? 'me' : 'them'}">${glossText(m.text)}${m.me ? '' : ' ' + spk(m.text)}</div>`).join('')}<div class="bub them">${glossText(t.msg)} ${spk(t.msg)}</div></div></div>`;
}
function mountTask(t, el) {
  let sel = null;
  const single = (labels, mono) => {
    el.insertAdjacentHTML('beforeend', optList(labels, mono));
    el.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
      if (SES.checked) return;
      el.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true'); sel = +b.dataset.i;
      if (SES.blitz) doCheck();
    }));
    return { get:() => sel };
  };
  switch (t.type) {
    case 'choice':
      if (t.html) el.innerHTML = `<p class="sent">${t.html}</p>`;
      return single(t.labels, t.mono);
    case 'chat':
      el.innerHTML = chatHead(t);
      if (t.labels) return single(t.labels);
      el.insertAdjacentHTML('beforeend', `<input type="text" id="ans-in" class="ans-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t.placeholder)}">`);
      return { get:() => { const v = el.querySelector('#ans-in').value.trim(); return v || null; } };
    case 'tf': {
      el.innerHTML = `<p class="sent">${t.html}</p><div class="tf"><button type="button" class="opt tfb" data-v="1" aria-pressed="false">Верно</button><button type="button" class="opt tfb" data-v="0" aria-pressed="false">Неверно</button></div>`;
      el.querySelectorAll('.tfb').forEach(b => b.addEventListener('click', () => { if (SES.checked) return; el.querySelectorAll('.tfb').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); sel = b.dataset.v === '1'; if (SES.blitz) doCheck(); }));
      return { get:() => sel };
    }
    case 'multi': {
      const set = new Set();
      el.innerHTML = `<div class="opts">${t.items.map((x, i) => `<button type="button" class="opt chk" data-i="${i}" aria-pressed="false"><span class="opt-k box" aria-hidden="true"></span><span class="opt-t">${glossText(x.text)}</span></button>`).join('')}</div>`;
      el.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => { if (SES.checked) return; const i = +b.dataset.i; set.has(i) ? set.delete(i) : set.add(i); b.setAttribute('aria-pressed', set.has(i)); }));
      return { get:() => set.size ? set : null };
    }
    case 'input':
      el.innerHTML = `<p class="sent">${t.html}</p><input type="text" id="ans-in" class="ans-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t.placeholder)}">`;
      return { get:() => { const v = el.querySelector('#ans-in').value.trim(); return v || null; } };
    case 'translate':
      el.innerHTML = `<p class="ru">${esc(t.ru)}</p><textarea id="ans-in" class="ans-in" rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="${esc(t.placeholder)}"></textarea><p class="sub">Регистр, пунктуация и лишние пробелы не важны. Сокращения (don't, I'm) и полные формы засчитываются одинаково.</p>`;
      el.querySelector('#ans-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); SES.checked ? goNext() : doCheck(); } });
      return { get:() => { const v = el.querySelector('#ans-in').value.trim(); return v || null; } };
    case 'build': return mountBuild(t, el);
    case 'fix': return mountFix(t, el);
    case 'timeline': {
      let a = null, b = null;
      el.innerHTML = `<div class="tl-wrap">${tlSVG(t.tl, 'big')}</div><p class="sent">${t.html}</p>
        <div class="lbl">1 · Форма</div><div class="opts two">${t.opts.map((o, i) => `<button type="button" class="opt oa" data-i="${i}" aria-pressed="false"><span class="opt-t">${esc(o.label)}</span></button>`).join('')}</div>
        <div class="lbl">2 · Что означает это время здесь?</div><div class="opts">${t.mopts.map((o, i) => `<button type="button" class="opt ob" data-i="${i}" aria-pressed="false"><span class="opt-t">${esc(o.label)}</span></button>`).join('')}</div>`;
      el.querySelectorAll('.oa').forEach(x => x.addEventListener('click', () => { if (SES.checked) return; el.querySelectorAll('.oa').forEach(y => y.setAttribute('aria-pressed', 'false')); x.setAttribute('aria-pressed', 'true'); a = +x.dataset.i; }));
      el.querySelectorAll('.ob').forEach(x => x.addEventListener('click', () => { if (SES.checked) return; el.querySelectorAll('.ob').forEach(y => y.setAttribute('aria-pressed', 'false')); x.setAttribute('aria-pressed', 'true'); b = +x.dataset.i; }));
      return { get:() => (a == null || b == null) ? null : { a, b } };
    }
  }
  return { get:() => null };
}
function mountBuild(t, el) {
  let line = [], pool = t.cards.slice();
  el.innerHTML = `<div class="b-line ${t.formula ? 'fx-line' : ''}" aria-label="Твоё предложение"></div><div class="b-pool" aria-label="Карточки"></div>
    <p class="sub">Нажми на карточку, чтобы поставить её в строку, или перетащи. Нажми на карточку в строке, чтобы вернуть её.${t.distract ? ' Одна карточка лишняя.' : ''}</p>`;
  const L = el.querySelector('.b-line'), P = el.querySelector('.b-pool');
  const card = c => `<button type="button" class="bcard" data-id="${c.id}">${esc(c.txt)}</button>`;
  const draw = () => {
    L.innerHTML = line.length ? line.map(card).join('') + (isQ(t.f) ? '<span class="b-end">?</span>' : '') : '<span class="b-ph">Собери здесь</span>';
    P.innerHTML = pool.map(card).join('') || '<span class="b-ph">Все карточки в строке</span>';
  };
  const move = (id, toLine, beforeId) => {
    if (SES.checked) return;
    let c = line.find(x => x.id === id) || pool.find(x => x.id === id); if (!c) return;
    line = line.filter(x => x.id !== id); pool = pool.filter(x => x.id !== id);
    if (toLine) { const i = beforeId ? line.findIndex(x => x.id === beforeId) : -1; i >= 0 ? line.splice(i, 0, c) : line.push(c); } else pool.push(c);
    draw();
  };
  let drag = null;
  el.addEventListener('pointerdown', e => {
    const b = e.target.closest('.bcard'); if (!b || SES.checked) return;
    drag = { id:b.dataset.id, x:e.clientX, y:e.clientY, el:b, on:false, inLine:!!b.closest('.b-line') };
    b.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
      drag.on = true; drag.g = drag.el.cloneNode(true); drag.g.className = 'bcard ghost'; document.body.appendChild(drag.g); drag.el.classList.add('dragging');
    }
    if (drag.on) { drag.g.style.left = e.clientX + 'px'; drag.g.style.top = e.clientY + 'px'; }
  });
  el.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.on) { move(d.id, !d.inLine); return; }
    d.g.remove(); d.el.classList.remove('dragging');
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (under && under.closest('.b-line')) {
      const tc = under.closest('.bcard'); let before = null;
      if (tc && tc.dataset.id !== d.id) { const r = tc.getBoundingClientRect(); before = e.clientX < r.left + r.width / 2 ? tc.dataset.id : (line[line.findIndex(x => x.id === tc.dataset.id) + 1] || {}).id || null; }
      else if (!tc) before = null;
      if (tc && tc.dataset.id === d.id) return;
      move(d.id, true, before);
    } else if (under && under.closest('.b-pool')) move(d.id, false);
  });
  el.addEventListener('pointercancel', () => { if (drag && drag.g) drag.g.remove(); if (drag) drag.el.classList.remove('dragging'); drag = null; });
  el.addEventListener('click', e => { const b = e.target.closest('.bcard'); if (b && e.detail === 0) move(b.dataset.id, !b.closest('.b-line')); });
  draw();
  return { get:() => line.length ? line.map(c => c.txt) : null };
}
function mountFix(t, el) {
  let idx = null, del = false;
  el.innerHTML = `<p class="sent fix-s">${t.toks.map((w, i) => `<button type="button" class="ftok" data-i="${i}">${esc(i === 0 ? cap(w) : w)}</button>`).join(' ')}${isQ(t.f) ? '?' : '.'}</p>
    <div class="fix-ed" hidden><label class="lbl" for="fix-in">Исправь выбранное слово</label><div class="row"><input type="text" id="fix-in" class="ans-in sm" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="btn ghost sm" id="fix-del">Это слово лишнее</button></div><p class="sub" id="fix-pv"></p></div>`;
  const ed = el.querySelector('.fix-ed'), inp = el.querySelector('#fix-in'), pv = el.querySelector('#fix-pv');
  const preview = () => {
    if (idx == null) return;
    const toks = t.toks.slice(); if (del) toks.splice(idx, 1); else toks[idx] = inp.value.trim() || t.toks[idx];
    pv.textContent = 'Получится: ' + toText(toks, t.f);
  };
  el.querySelectorAll('.ftok').forEach(b => b.addEventListener('click', () => {
    if (SES.checked) return;
    el.querySelectorAll('.ftok').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
    idx = +b.dataset.i; del = false; ed.hidden = false; inp.value = t.toks[idx]; inp.focus(); inp.select(); preview();
  }));
  inp.addEventListener('input', () => { del = false; preview(); });
  el.querySelector('#fix-del').addEventListener('click', () => { del = true; preview(); });
  return { get:() => idx == null ? null : { idx, op:del ? 'del' : 'rep', val:inp.value.trim() } };
}

/* ---------- проверка ---------- */
function wordDiff(user, correct) {
  const a = user.replace(/[.,!?]/g, ' ').split(/\s+/).filter(Boolean), b = correct.replace(/[.,!?]/g, ' ').split(/\s+/).filter(Boolean);
  const A = a.map(w => canon(w)), B = b.map(w => canon(w));
  const dp = Array.from({ length:a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0; const out = [];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && A[i] === B[j]) { out.push(esc(b[j])); i++; j++; }
    else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) { out.push(`<ins>${esc(b[j])}</ins>`); j++; }
    else { out.push(`<del>${esc(a[i])}</del>`); i++; }
  }
  return out.join(' ');
}
function closest(list, user) {
  let best = list[0], sc = -1;
  list.forEach(c => { const u = new Set(canon(user).split(' ')); const s = canon(c).split(' ').filter(w => u.has(w)).length - Math.abs(canon(c).split(' ').length - u.size) * 0.3; if (s > sc) { sc = s; best = c; } });
  return best;
}
function checkTask(t, a) {
  const r = RULES[t.rule];
  switch (t.type) {
    case 'choice': return { ok:a === t.ans, user:t.fulls[a], correct:t.fulls[t.ans], reason:a === t.ans ? '' : t.reasons[a] };
    case 'chat':
      if (t.labels) return { ok:a === t.ans, user:t.fulls[a], correct:t.correct, reason:a === t.ans ? '' : t.reasons[a] };
      return { ok:accepted(t.accept, a), user:a, correct:t.correct, diff:wordDiff(a, t.correct) };
    case 'tf': {
      const ok = a === t.isTrue;
      return { ok, user:a ? 'Верно' : 'Неверно', correct:t.isTrue ? `Верно: «${t.shown}» — правильное предложение.` : `Неверно. Правильно: ${t.correct}`,
        reason:ok ? '' : t.isTrue ? `В этом предложении нет ошибки. ${r.formula || ''}` : t.reason, showWrong: !t.isTrue ? t.shown : '' };
    }
    case 'multi': {
      const right = t.items.map((x, i) => x.ok ? i : -1).filter(i => i >= 0);
      const ok = right.length === a.size && right.every(i => a.has(i));
      const why = [];
      t.items.forEach((x, i) => { if (a.has(i) && !x.ok) why.push(`«${x.text}» — ошибка. ${x.reason} Правильно: ${x.fix}`); if (!a.has(i) && x.ok) why.push(`«${x.text}» — правильное, его тоже нужно было отметить.`); });
      return { ok, user:[...a].map(i => t.items[i].text).join(' · '), correct:right.map(i => t.items[i].text).join(' · '), reason:why.join(' ') };
    }
    case 'build': {
      const txt = t.formula ? a.join(' + ') + (isQ(t.f) ? ' ?' : '') : toText(a, t.f);
      const ok = accepted(t.accept, a.join(' ') + (isQ(t.f) ? '?' : ''));
      let reason = '';
      if (!ok) {
        if (t.distract && a.includes(t.distract.txt)) reason = `Лишняя карточка «${t.distract.txt}». ${t.distract.reason}`;
        else if (a.length === t.ctoks.length && [...a].sort().join('|') === [...t.ctoks].sort().join('|')) reason = 'Слова правильные, но порядок другой. ' + (r.formula ? 'Порядок: ' + r.formula : '');
        else reason = 'Не все нужные карточки на месте.';
      }
      return { ok, user:txt, correct:t.correct, reason };
    }
    case 'fix': {
      const toks = t.toks.slice(); if (a.op === 'del') toks.splice(a.idx, 1); else toks[a.idx] = a.val || toks[a.idx];
      const txt = toText(toks, t.f), ok = accepted(t.accept, txt);
      return { ok, user:txt, correct:t.correct, reason:ok ? '' : (a.idx !== t.errIdx ? `Ошибка была в слове «${t.toks[t.errIdx]}». ` : 'Слово найдено верно, но исправление неточное. ') + t.reason, showWrong:t.wrongText };
    }
    case 'input': {
      const ok = accepted(t.accept, a);
      return { ok, user:toText([...t.pre, a, ...t.post], 'pos'), correct:t.correct, reason:ok ? '' : (t.wrongMap[canon(a)] || `Нужна форма: ${t.correctPart}.`) };
    }
    case 'translate': {
      const ok = accepted(t.accept, a);
      const c = closest(t.alts, a);
      return { ok, user:a, correct:ok ? a : c, diff:ok ? '' : wordDiff(a, c), others:t.alts.filter(x => x !== c).slice(0, 2) };
    }
    case 'timeline': {
      const ok = a.a === t.ans && a.b === t.mans; const why = [];
      const pt = TENSE[t.opts[a.a].tense], T = TENSE[t.tense];
      if (a.a !== t.ans) why.push(`Форма «${t.opts[a.a].label}» — это ${pt.name}: ${pt.meaning}. Здесь нужен ${T.name}.`);
      if (a.b !== t.mans) why.push(`Значение ${T.name}: ${T.meaning}.`);
      return { ok, user:`${t.opts[a.a].label} — ${t.mopts[a.b].label}`, correct:`${t.opts[t.ans].label} (${T.name}) — ${T.meaning}`, reason:why.join(' '), full:t.correct };
    }
  }
  return { ok:false, user:'', correct:'' };
}
function exampleFor(t) {
  const r = RULES[t.rule];
  if (t.sim) { for (let i = 0; i < 4; i++) { const S = mkS(t.sim.t, t.sim.f, t.sim.fl || {}); if (S && S.text !== t.correct) return S.text; } }
  return r.example;
}
function doCheck() {
  if (!SES || !SES.cur || SES.checked || !UI) return;
  const t = SES.cur, a = UI.get();
  if (a == null) { toast('Сначала дай ответ'); return; }
  const res = checkTask(t, a);
  SES.attempt++;
  const first = SES.attempt === 1;
  if (first) {
    recordRule(t.rule, res.ok); ST.totals.tasks++;
    // журнал ответов: из него строится история и он уходит в облако (exercise_attempts)
    const at = { id:newId(), d:Date.now(), t:(RULES[t.rule] || {}).t || SES.t, rule:t.rule, mech:t.type, kind:SES.kind, ok:res.ok,
      q:String(t.ru || t.instr || '').slice(0, 300), user:String(res.user == null ? '' : res.user).slice(0, 300), correct:String(res.correct == null ? '' : res.correct).slice(0, 300) };
    ST.attempts.push(at); if (ST.attempts.length > 400) ST.attempts.shift();
    if (res.ok) { ST.streak++; ST.best = Math.max(ST.best, ST.streak); addXP(SES.hint ? 5 : t.diff >= 4 ? 15 : 10); }
    else { ST.streak = 0; ST.errors.push({ id:at.id, d:at.d, rule:t.rule, q:t.ru || t.correct, user:res.user, correct:res.correct }); if (ST.errors.length > 150) ST.errors.shift(); }
  }
  // режим самостоятельных повторных попыток
  if (!res.ok && first && ST.settings.retry && !SES.defer && !SES.blitz && !['tf'].includes(t.type)) {
    const m = document.getElementById('t-msg');
    m.hidden = false; m.className = 't-msg bad';
    m.innerHTML = `<b>Пока неверно.</b> Попробуй ещё раз — правильный ответ покажу после второй попытки. Подумай о правиле «${esc(RULES[t.rule].name)}».`;
    save(); afterRecord(t, false); renderSesTop(); return;
  }
  const finalOk = first && res.ok;
  if (!first && res.ok) { ST.totals.fixed++; addXP(8); }
  SES.results.push({ task:t, res, ok:finalOk, fixed:!first && res.ok });
  SES.checked = true;
  if (first) afterRecord(t, res.ok);
  checkAch(); save();
  if (SES.defer) { renderSesTop(); nextTask(); return; }
  if (SES.blitz) { blitzFlash(t, res); return; }
  el('.task').classList.add(res.ok ? 'is-ok' : 'is-bad');
  const tc = el('.task .t-ctrl'); if (tc) tc.hidden = true;
  markOptions(t, res);
  renderSesTop();
  document.getElementById('fb').innerHTML = fbHTML(t, res, !first && res.ok);
  const nb = document.querySelector('#fb [data-act=next]'); if (nb && !matchMedia('(pointer:coarse)').matches) nb.focus({ preventScroll:true });
  document.getElementById('fb').scrollIntoView({ behavior: ST.settings.rm ? 'auto' : 'smooth', block:'nearest' });
  refreshHeader();
  if (ST.settings.voiceAuto && canSpeak()) { const s = speakable(t, res); if (s) Speech.say(s).catch(() => {}); }
}
// Что озвучивать после проверки: правильное английское предложение (формулы не озвучиваем)
function speakable(t, res) { const r = RULES[t.rule]; if (!r || r.cat === 'fx' || t.formula) return ''; return t.correct || res.full || res.correct || ''; }
const el = s => document.querySelector(s);
function markOptions(t, res) {
  if (['choice','chat'].includes(t.type) && t.labels) document.querySelectorAll('#t-body .opt').forEach(b => { const i = +b.dataset.i; if (i === t.ans) b.classList.add('right'); else if (b.getAttribute('aria-pressed') === 'true') b.classList.add('wrong'); });
  if (t.type === 'timeline') { document.querySelectorAll('#t-body .oa').forEach(b => { if (+b.dataset.i === t.ans) b.classList.add('right'); else if (b.getAttribute('aria-pressed') === 'true') b.classList.add('wrong'); }); document.querySelectorAll('#t-body .ob').forEach(b => { if (+b.dataset.i === t.mans) b.classList.add('right'); else if (b.getAttribute('aria-pressed') === 'true') b.classList.add('wrong'); }); }
  if (t.type === 'multi') document.querySelectorAll('#t-body .opt').forEach(b => { const x = t.items[+b.dataset.i]; b.classList.add(x.ok ? 'right' : (b.getAttribute('aria-pressed') === 'true' ? 'wrong' : 'dim')); });
  if (t.type === 'fix') document.querySelectorAll('#t-body .ftok').forEach(b => { if (+b.dataset.i === t.errIdx) b.classList.add('err'); });
  document.querySelectorAll('#t-body input, #t-body textarea').forEach(x => x.readOnly = true);
}
function afterRecord(t, ok) {
  const st = ST.rules[t.rule];
  if (!ok && st && st.err3 >= 3 && !SES.defer && !SES.blitz && SES.kind !== 'starter' && SES.kind !== 'diag') {
    st.err3 = 0;
    const easy = genForRule(t.rule, { maxDiff:1, diff:1 }), fresh = genForRule(t.rule, { notMech:t.mech });
    SES.inject.unshift(...[genLesson(t.rule), easy, fresh].filter(Boolean));
    SES.later.push({ at:SES.results.length + 5, rule:t.rule });
    toast(`Правило «${RULES[t.rule].name}» требует внимания — короткий разбор`, 'warn');
  }
  if (ok && st) st.err3 = Math.max(0, st.err3 - 1);
}
function fbHTML(t, res, fixed) {
  const r = RULES[t.rule];
  const ex = exampleFor(t);
  return `<div class="fb card ${res.ok ? 'ok' : 'bad'}">
    <div class="fb-h"><b>${res.ok ? (fixed ? 'Исправлено со второй попытки' : 'Верно') : 'Есть ошибка'}</b><span class="mono">${res.ok ? (fixed ? '+8 XP' : '+' + (SES.hint ? 5 : t.diff >= 4 ? 15 : 10) + ' XP') : 'серия обнулилась'}</span></div>
    <div class="fb-grid">
      <div><span class="lbl">Твой ответ</span><p class="${res.ok ? '' : 'strike'}">${glossText(res.user || '—')}</p></div>
      <div><span class="lbl">Правильный ответ</span><p>${glossText(res.correct)} ${spk(speakable(t, res))}</p>${res.others && res.others.length ? `<p class="sub">Тоже подходит: ${res.others.map(esc).join(' · ')}</p>` : ''}${res.full ? `<p class="sub">${esc(res.full)}</p>` : ''}</div>
    </div>
    ${res.diff ? `<div class="fb-row"><span class="lbl">Отличия</span><p class="diff">${res.diff}</p></div>` : ''}
    ${!res.ok && res.reason ? `<div class="fb-row why"><span class="lbl">Причина ошибки</span><p>${esc(cap(res.reason))}</p></div>` : ''}
    <div class="fb-row"><span class="lbl">Объяснение · ${esc(r.name)}</span><p>${esc(r.explain)}</p></div>
    <div class="fb-row"><span class="lbl">Формула</span><code>${esc(r.formula)}</code></div>
    <div class="fb-row"><span class="lbl">Похожий пример</span><p>${glossText(ex)} ${r.cat === 'fx' ? '' : spk(ex)}</p></div>
    <div class="fb-ctrl">${!res.ok ? '<button class="btn ghost" data-act="retryErr">Повторить ошибку</button>' : ''}<button class="btn pri" data-act="next">Дальше →</button></div></div>`;
}
function blitzFlash(t, res) {
  const m = document.getElementById('t-msg'); m.hidden = false;
  m.className = 't-msg ' + (res.ok ? 'ok' : 'bad');
  m.innerHTML = res.ok ? '<b>Верно</b>' : `<b>Неверно.</b> Правильно: ${glossText(res.correct)}`;
  markOptions(t, res); renderSesTop(); refreshHeader();
  setTimeout(() => { if (SES && SES.blitz && SES.cur === t) nextTask(); }, res.ok ? 450 : 1500);
}
function goNext() { if (!SES) return; if (SES.cur && SES.cur.type === 'lesson') { addXP(3); nextTask(); return; } if (!SES.checked) return; if (SES.dialog && SES.cur.type === 'chat') SES.log.push({ text:SES.cur.msg }, { me:1, text:SES.cur.correct }); nextTask(); }
function refreshHeader() { const h = document.querySelector('header.top'); if (h) h.outerHTML = vHeader(); }

/* ---------- завершение занятия ---------- */
function finishSession() {
  if (!SES || SES.done) return;
  SES.done = true;
  if (TIMER) { clearInterval(TIMER); TIMER = null; }
  const total = SES.results.length, ok = SES.results.filter(r => r.ok).length, p = total ? Math.round(ok / total * 100) : 0;
  const byRule = {};
  SES.results.forEach(r => { const b = byRule[r.task.rule] || (byRule[r.task.rule] = [0, 0]); b[1]++; if (r.ok) b[0]++; });
  const notes = [];
  if (total) {
    ST.history.push({ id:newId(), d:Date.now(), title:SES.title, t:SES.t, kind:SES.kind, ok, total, rules:byRule }); if (ST.history.length > 80) ST.history.shift();
    ST.totals.sessions++; grant('first'); addXP(20);
  }
  if (SES.kind === 'stage' || SES.kind === 'boss') {
    const L = lab(SES.t), s = L.stages[SES.stage] || (L.stages[SES.stage] = { best:0, passed:false, runs:0 });
    s.runs++; s.best = Math.max(s.best, p);
    const need = SES.kind === 'boss' ? 80 : 75;
    if (p >= need && total >= Math.min(SES.n, 5)) {
      if (!s.passed) { s.passed = true; addXP(SES.kind === 'boss' ? 60 : 30); notes.push(`Этап «${STAGES.find(x => x.id === SES.stage).name}» пройден.`); }
      grant('stage'); if (SES.kind === 'boss') { grant('boss'); if (ok === total) grant('clean'); }
    } else notes.push(`Для прохождения этапа нужно ${need}%. Можно повторить — задания будут новыми.`);
    const uc = unlockChecks(SES.t);
    if (uc.ok && !L.badge) { L.badge = true; grant('badge'); notes.push(`Значок владения временем ${TENSE[SES.t].name} получен!`); const nx = nextTense(SES.t); if (nx && !ST.unlocked.includes(nx)) notes.push(`Можно перейти к ${TENSE[nx].name} — кнопка «Открыть следующее время» в лаборатории.`); }
  }
  if (SES.kind === 'starter' && total) { ST.starterDone = true; grant('starter'); }
  let diag = null;
  if (SES.kind === 'diag' && total) { ST.diagDone = true; grant('diag'); diag = diagResult(SES.results); ST.plan.levelDiag = diag; }
  if (SES.kind === 'murphy' && total) grant('murphy');
  if (SES.kind === 'review' && total) grant('review');
  if (SES.kind === 'dialog' && total === SES.n) grant('dialog');
  checkAch(); save();
  LAST = { cfg:SES.cfg, results:SES.results, title:SES.title, kind:SES.kind, t:SES.t, ok, total, p, byRule, notes, defer:SES.defer, diag };
  SES = null;
  go('results');
}
function vResults() {
  const R = LAST; if (!R) return vHome();
  const rows = Object.entries(R.byRule).map(([id, [o, n]]) => ({ id, o, n, r:RULES[id] }));
  const good = rows.filter(x => x.o === x.n), bad = rows.filter(x => x.o < x.n);
  const wrong = R.results.filter(x => !x.ok);
  const intro = R.kind === 'starter' ? 'Стартовое испытание завершено. Ниже видно, какие правила уже получаются, а какие нужно потренировать. Это одна проверка — освоенными правила станут после нескольких удачных попыток.' :
    R.kind === 'diag' ? 'Диагностика завершена. Сама по себе она ничего не открывает и не закрывает: ответы попали в статистику правил, а ниже — ориентировочная рекомендация.' :
    R.kind === 'murphy' ? 'Тренировка в комнате Murphy. Она не влияет на кампанию — только на статистику правил и план повторения.' : '';
  return `<main class="wrap res">
    <div class="res-h"><div><div class="mono kicker">РАЗБОР · ${esc(R.title)}</div><h1 class="res-score"><b>${R.ok}</b><span>/ ${R.total}</span></h1><p class="lead">${R.total ? R.p + '% верно с первой попытки.' : 'Нет ответов.'} ${intro}</p>
      ${R.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}${R.diag ? diagBlock(R.diag) : ''}</div>
      <div class="res-actions"><button class="btn pri" data-act="again">Следующий тест</button>${wrong.length ? '<button class="btn ghost" data-act="redoErr">Повторить ошибки</button>' : ''}<button class="btn ghost" data-act="lab" data-arg="${R.t}">К лаборатории</button><button class="link" data-act="go" data-arg="home">На карту</button></div></div>
    <p class="sub">«Следующий тест» соберёт новый набор заданий по той же теме. Следующее время открывается только кнопкой в лаборатории.</p>
    <section class="dash">
      <div class="panel"><div class="panel-h"><h4>Получается</h4></div>${good.length ? `<ul class="plain">${good.map(x => `<li><span>${x.r.name}</span><span class="mono good-t">${x.o}/${x.n}</span></li>`).join('')}</ul>` : '<p class="empty">Пока нет правил без ошибок.</p>'}</div>
      <div class="panel"><div class="panel-h"><h4>Нужна практика</h4></div>${bad.length ? `<ul class="plain">${bad.map(x => `<li><span>${x.r.name}</span><span class="mono bad-t">${x.o}/${x.n}</span></li>`).join('')}</ul>` : '<p class="empty">Ошибок нет.</p>'}</div>
      <div class="panel span2"><div class="panel-h"><h4>Освоение по всем попыткам</h4></div><ul class="rules">${rows.map(x => ruleRow(x.r)).join('')}</ul></div>
    </section>
    ${wrong.length ? `<section class="block"><div class="block-h"><h3>Анализ ошибок</h3><span class="mono sub">${wrong.length}</span></div>
      <div class="errs">${wrong.map(x => { const r = RULES[x.task.rule]; return `<div class="err card">
        <div class="mono sub">${esc(r.name)} · ${esc(TENSE[r.t].name)}${x.fixed ? ' · исправлено со 2-й попытки' : ''}</div>
        ${x.task.ru ? `<p class="ru sm">${esc(x.task.ru)}</p>` : ''}${x.res.showWrong ? `<p class="sub">В задании: ${esc(x.res.showWrong)}</p>` : ''}
        <div class="fb-grid"><div><span class="lbl">Твой ответ</span><p class="strike">${esc(x.res.user)}</p></div><div><span class="lbl">Правильно</span><p>${esc(x.res.correct)}</p></div></div>
        ${x.res.reason ? `<p><span class="lbl">Причина</span> ${esc(x.res.reason)}</p>` : ''}${x.res.diff ? `<p class="diff">${x.res.diff}</p>` : ''}
        <p class="sub"><span class="lbl">Формула</span> <code>${esc(r.formula)}</code></p></div>`; }).join('')}</div></section>` : ''}
  </main>`;
}
function regenCfg(c) {
  if (c.kind === 'boss' || c.kind === 'stage') return cfgStage(c.t, c.stage);
  if (c.kind === 'starter') return Object.assign(cfgStarter(), { title:'Present Simple · новый набор (как стартовое)' });
  if (c.kind === 'diag') return cfgDiag();
  if (c.kind === 'tlgame') return cfgTimeline(c.t === ST.current ? null : c.t);
  if (c.kind === 'dialog') return cfgDialog(c.dialog.id);
  return Object.assign({}, c);
}

/* ---------- формулы ---------- */
function vFormulas(t) {
  const T = TENSE[t], det = ST.settings.fxDetail, on = ST.unlocked.includes(t);
  const cards = [
    ['Как образуется утверждение (+) в ' + T.name + '?', T.f.pos, T.ex.pos.join(' ')],
    ['Как образуется отрицание (−) в ' + T.name + '?', T.f.neg, T.ex.neg.join(' ')],
    ['Как задать вопрос (?) в ' + T.name + '?', T.f.q, T.ex.q.join(' ') + ' ' + T.ex.wh],
    ['Когда используется ' + T.name + '?', T.meaning, 'Маркеры: ' + T.markers.join(', ')]
  ];
  if (T.be) cards.push(['Как работает be в ' + T.name + '?', T.be.pos, T.be.q]);
  return `<main class="wrap fxv">
    <div class="block-h"><h1 class="h1">Формулы</h1><div class="seg" role="group" aria-label="Режим"><button class="${det ? '' : 'on'}" data-act="fxmode" data-arg="0">Шпаргалка</button><button class="${det ? 'on' : ''}" data-act="fxmode" data-arg="1">Подробно</button></div></div>
    <div class="tabs">${TENSES.map(x => `<button class="tab ${x.id === t ? 'on' : ''} ${ST.unlocked.includes(x.id) ? '' : 'dim'}" data-act="go" data-arg="formulas|${x.id}"><span class="mono">${pad2(x.n)}</span> ${x.name}</button>`).join('')}</div>
    <section class="fx-head"><div><h2 class="lab-name">${T.name}</h2><p class="lead">${T.ru} — ${T.meaning}.</p></div>${tlSVG(T.tl, 'big')}</section>
    <section class="fx3">${fxBlock('+', 'Утверждение', T.f.pos, T.ex.pos.join(' '))}${fxBlock('−', 'Отрицание', T.f.neg, T.ex.neg.join(' '))}${fxBlock('?', 'Вопрос', T.f.q, T.ex.q.join(' '))}</section>
    ${T.be ? `<section class="be"><div class="mono kicker">ОТДЕЛЬНАЯ СХЕМА · BE (${t === 'ps' ? 'am / is / are' : 'was / were'})</div><div class="fx3">${fxBlock('+', 'Утверждение', T.be.pos, T.be.ex[0])}${fxBlock('−', 'Отрицание', T.be.neg, T.be.ex[2])}${fxBlock('?', 'Вопрос', T.be.q, T.be.ex[1])}</div>${det ? `<p class="why">${esc(T.be.why)}</p>` : ''}</section>` : ''}
    ${det ? `<section class="detail"><h3>Почему формула работает так</h3><p class="why">${esc(T.why)}</p><ul class="dl">${T.detail.map(d => `<li>${esc(d)}</li>`).join('')}</ul><p class="sub">Маркеры: ${T.markers.map(esc).join(' · ')}</p><p class="sub">Вопрос со словом: ${glossText(T.ex.wh)}</p></section>` : `<p class="sub">Маркеры: ${T.markers.map(esc).join(' · ')}</p>`}
    <section class="block"><div class="block-h"><h3>Карточки с переворотом</h3><span class="mono sub">нажми, чтобы перевернуть · сначала узнать, потом вспомнить, потом применить</span></div>
      <div class="flips">${cards.map(c => `<button class="flip" data-act="flip"><span class="flip-in"><span class="flip-f"><span class="mono sub">ВОПРОС</span><b>${esc(c[0])}</b></span><span class="flip-b"><code>${esc(c[1])}</code><span>${esc(c[2])}</span></span></span></button>`).join('')}</div>
      <div class="row">${on ? `<button class="btn pri" data-act="fxtest" data-arg="${t}">Проверь себя: формулы по памяти</button><button class="btn ghost" data-act="stage" data-arg="${t}|pos">Применить в предложениях</button>` : '<p class="sub">Тренировка формул откроется вместе с лабораторией.</p>'}</div>
    </section></main>`;
}

/* ---------- неправильные глаголы ---------- */
let MG = null, VT = null;
// состояние словаря: поиск, сортировка, фильтры
const DQ = { q:'', sort:'az', show:'all', grp:'' };
const SPK_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.6 5.8a8.6 8.6 0 0 1 0 12.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
function vVerbs(tab) {
  const tabs = [['lib','Словарь A–Z'],['match','Карточки памяти'],['type','Ввод форм'],['cards','Флип-карточки']];
  const fav = Object.keys(ST.verbs).filter(k => ST.verbs[k].fav).length;
  return `<main class="wrap vv"><div class="block-h"><h1 class="h1">Неправильные глаголы</h1><span class="mono sub">${VERB_DICT.length} глаголов · выучено ${learnedVerbs().length} · избранное ${fav} · в изучении ${ST.verbsActive.length}</span></div>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="go" data-arg="verbs|${k}">${n}</button>`).join('')}</div><div id="vbox"></div></main>`;
}
function verbStatus(id) {
  const v = ST.verbs[id];
  if (v && v.step >= 3) return 'выучен';
  if (v && v.mark) return 'отмечен выученным';
  if (!v || !v.seen) return ST.verbsActive.includes(id) ? 'в изучении' : '';
  return `шаг ${v.step}/3`;
}

/* озвучивание — через сервис Speech (js/speech.js) */
const canSpeak = () => Speech.supported && ST.settings.voice;
function applyVoiceSettings() { Speech.configure({ voiceName:ST.settings.voiceName, accent:ST.settings.accent, rate:+ST.settings.rate || 1 }); }
function speak(txt) {
  if (!Speech.supported) { toast('Этот браузер не умеет озвучивать текст. Всё остальное работает.', 'warn'); return; }
  if (!Speech.hasEnglishVoice) toast('Английский голос не найден — браузер прочитает голосом по умолчанию', 'warn');
  Speech.say(txt).catch(() => toast('Не удалось воспроизвести звук', 'warn'));
}
function spk(text, label) {
  if (!canSpeak() || !text || !Speech.englishOnly(text)) return '';
  return `<button type="button" class="spk" data-act="say" data-arg="${esc(text)}" aria-label="${esc(label || 'Прослушать')}" title="Прослушать">${SPK_ICON}</button>`;
}

/* словарь A–Z */
const normQ = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const GROUP_NAME = Object.fromEntries(VERB_GROUPS.map(g => [g.id, g.name]));
function dictList() {
  const q = normQ(DQ.q), learned = new Set(learnedVerbs());
  const rank = v => {
    if (!q) return 0;
    const forms = [v.v1, ...vForms(v.v2), ...vForms(v.v3)], ru = normQ(v.ru);
    if (forms.includes(q)) return 1;
    if (forms.some(f => f.startsWith(q))) return 2;
    if (ru.split(/[,;()\s]+/).some(w => w.startsWith(q))) return 3;
    if (forms.some(f => f.includes(q)) || ru.includes(q)) return 4;
    return 0;
  };
  let list = VERB_DICT.map(v => ({ v, r:rank(v) })).filter(({ v, r }) => {
    if (q && !r) return false;
    const st = ST.verbs[v.v1];
    if (DQ.show === 'fav' && !(st && st.fav)) return false;
    if (DQ.show === 'learned' && !learned.has(v.v1)) return false;
    if (DQ.show === 'study' && !ST.verbsActive.includes(v.v1)) return false;
    if (DQ.grp && vGroupOf(v) !== DQ.grp) return false;
    return true;
  });
  const base = DQ.sort === 'freq' ? (a, b) => a.v.f - b.v.f || a.v.v1.localeCompare(b.v.v1) : (a, b) => a.v.v1.localeCompare(b.v.v1);
  list.sort((a, b) => (a.r - b.r) || base(a, b));
  return list.map(x => x.v);
}
function dictRow(v) {
  const st = ST.verbs[v.v1] || {}, learned = st.step >= 3 || st.mark, say = canSpeak();
  const show = txt => esc(txt).replace(/\//g, '/<wbr>');
  const f = txt => say ? `<button type="button" class="vf mono" data-act="say" data-arg="${esc(txt)}" title="Прослушать ${esc(txt)}">${show(txt)}</button>` : `<span class="vf mono">${show(txt)}</span>`;
  return `<div class="drow" role="row"><span class="dv1" role="cell">${f(v.v1)}</span><span role="cell">${f(v.v2)}</span><span role="cell">${f(v.v3)}</span>
    <button type="button" class="dru" role="cell" data-act="vcard" data-arg="${esc(v.v1)}">${esc(v.ru)}</button>
    <span class="dact" role="cell"><button type="button" class="icon-b sm tgl ${st.fav ? 'on' : ''}" data-act="vfav" data-arg="${esc(v.v1)}" aria-pressed="${!!st.fav}" aria-label="Избранное: ${esc(v.v1)}" title="Избранное">★</button><button type="button" class="icon-b sm tgl ${learned ? 'on' : ''}" data-act="vmark" data-arg="${esc(v.v1)}" aria-pressed="${!!learned}" aria-label="Выучено: ${esc(v.v1)}" title="Отметить выученным">✓</button><button type="button" class="icon-b sm" data-act="vcard" data-arg="${esc(v.v1)}" aria-label="Карточка глагола ${esc(v.v1)}" title="Подробнее">→</button></span></div>`;
}
function drawDict() {
  const box = document.getElementById('dlist'); if (!box) return;
  const list = dictList(), az = DQ.sort === 'az' && !DQ.q;
  let html = '', cur = '';
  for (const v of list) {
    if (az && v.v1[0] !== cur) { cur = v.v1[0]; html += `<div class="dletter mono" id="dl-${cur}">${cur.toUpperCase()}</div>`; }
    html += dictRow(v);
  }
  box.innerHTML = html || `<p class="empty">Ничего не нашлось${DQ.q ? ` по запросу «${esc(DQ.q)}»` : ''}. Поиск работает по V1, V2, V3 и по переводу.</p>`;
  const c = document.getElementById('dcount'); if (c) c.textContent = `найдено ${list.length} из ${VERB_DICT.length}`;
}
function mountDict(box) {
  const letters = [...new Set(VERB_DICT.map(v => v.v1[0]))];
  const sel = (id, opts, val) => `<select id="${id}" class="dsel">${opts.map(([k, n]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  box.innerHTML = `<div class="dict">
    <div class="dict-ctl">
      <input type="search" id="dq" class="ans-in" placeholder="Поиск: go, went, gone или «идти»" value="${esc(DQ.q)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Поиск глагола по V1, V2, V3 или переводу">
      <div class="seg" role="group" aria-label="Сортировка"><button class="${DQ.sort === 'az' ? 'on' : ''}" data-act="dsort" data-arg="az">A–Z</button><button class="${DQ.sort === 'freq' ? 'on' : ''}" data-act="dsort" data-arg="freq">По частоте</button></div>
      ${sel('dshow', [['all','Все глаголы'],['fav','★ Избранное'],['learned','✓ Выученные'],['study','В изучении']], DQ.show)}
      ${sel('dgrp', [['','Формы: любые'], ...VERB_GROUPS.map(g => [g.id, g.ex])], DQ.grp)}
    </div>
    <nav class="az" aria-label="Алфавит">${'abcdefghijklmnopqrstuvwxyz'.split('').map(l => `<button type="button" data-act="dletter" data-arg="${l}" ${letters.includes(l) ? '' : 'disabled'}>${l.toUpperCase()}</button>`).join('')}</nav>
    <div class="dict-bar"><span id="dcount" class="mono sub"></span><span class="row"><button class="btn sm" data-act="vtrain" data-arg="fav">Тренировать избранное</button><button class="btn sm ghost" data-act="vtrain" data-arg="found">Тренировать найденные</button></span></div>
    <div class="dhead mono" aria-hidden="true"><span>V1</span><span>V2</span><span>V3</span><span>Перевод</span><span></span></div>
    <div id="dlist" class="dlist" role="table" aria-label="Неправильные глаголы"></div>
    <p class="sub">Нажми на форму, чтобы её услышать, на перевод — чтобы открыть карточку с транскрипцией и примером. Частотность примерная. ${Speech.supported ? '' : 'Озвучивание в этом браузере недоступно.'}</p></div>`;
  drawDict();
  const q = box.querySelector('#dq');
  let tm = null;
  q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { DQ.q = q.value; drawDict(); }, 90); });
  box.querySelector('#dshow').addEventListener('change', e => { DQ.show = e.target.value; drawDict(); });
  box.querySelector('#dgrp').addEventListener('change', e => { DQ.grp = e.target.value; drawDict(); });
}
function showVerbCard(id) {
  const v = VERB_MAP[id]; if (!v) return;
  document.querySelectorAll('.modal.vcard').forEach(m => m.remove());
  const st = ST.verbs[id] || {}, ipa = v.ipa.split(' · '), learned = st.step >= 3 || st.mark, study = ST.verbsActive.includes(id);
  const forms = [['V1 · инфинитив', v.v1, ipa[0]], ['V2 · Past Simple', v.v2, ipa[1]], ['V3 · Past Participle', v.v3, ipa[2]]];
  const m = modal(`<div class="block-h"><h3 class="vc-title mono">${esc(v.v1)}</h3><button class="icon-b" data-act="close" aria-label="Закрыть">×</button></div>
    <p class="lead">${esc(v.ru)}</p>
    <div class="vc-forms">${forms.map(([l, f, i]) => `<div class="vc-f"><span class="lbl">${l}</span><b class="mono">${esc(f)}</b><span class="mono sub">[${esc(i || '')}]</span>${spk(f, 'Произнести ' + f)}</div>`).join('')}</div>
    ${canSpeak() ? `<p class="row"><button class="btn sm ghost" data-act="say" data-arg="${esc(v.v1 + ' – ' + v.v2 + ' – ' + v.v3)}">${SPK_ICON} Все три формы</button><button class="btn sm ghost" data-act="sayAgain">Повторить</button></p>` : '<p class="sub">Озвучивание недоступно в этом браузере или выключено в настройках.</p>'}
    <div class="vc-ex"><span class="lbl">Пример</span><p>${glossText(v.ex)} ${spk(v.ex)}</p></div>
    ${v.note ? `<div class="vc-ex"><span class="lbl">Варианты и особенности</span><p>${esc(v.note)}</p></div>` : ''}
    <p class="sub mono">Транскрипция — британский вариант · формы: ${esc(GROUP_NAME[vGroupOf(v)] || '')} · ${VFREQ_NAME[v.f]}${verbStatus(id) ? ' · ' + verbStatus(id) : ''}</p>
    <div class="row"><button class="btn sm ${st.fav ? 'acid' : 'ghost'}" data-act="vfav" data-arg="${esc(id)}">★ ${st.fav ? 'В избранном' : 'В избранное'}</button>
      <button class="btn sm ${learned ? 'acid' : 'ghost'}" data-act="vmark" data-arg="${esc(id)}">✓ ${learned ? 'Выучено' : 'Отметить выученным'}</button>
      <button class="btn sm ghost" data-act="vtoggle" data-arg="${esc(id)}">${study ? 'Убрать из изучения' : 'Добавить в изучение'}</button>
      <button class="btn sm pri" data-act="vtrain" data-arg="one|${esc(id)}">Тренировать</button></div>`);
  m.classList.add('vcard');
}
function mountVerbs(tab) {
  const box = document.getElementById('vbox'); if (!box) return;
  if (tab === 'lib') mountDict(box);
  if (tab === 'match') { if (!MG || MG.over) newMatch(); drawMatch(box); }
  if (tab === 'type') { if (!VT || VT.over) newTyping(false); drawTyping(box); }
  if (tab === 'cards') {
    const q = verbQueue(12);
    box.innerHTML = `<p class="sub">Сначала — глаголы, которым пора на повторение. Нажми на карточку, чтобы увидеть формы.</p><div class="flips verbs">${q.map(id => { const r = VERB(id); return `<button class="flip" data-act="flip"><span class="flip-in"><span class="flip-f"><b class="mono big">${id}</b><span>${esc(r.ru)}</span></span><span class="flip-b"><code>${id} – ${r.v2} – ${r.v3}</code><span>${esc(r.ex)}</span></span></span></button>`; }).join('')}</div>
      <div class="row"><button class="btn ghost" data-act="go" data-arg="verbs|type">Проверить себя вводом форм</button></div>`;
  }
}
function newMatch() {
  const ids = verbQueue(5);
  const tiles = [];
  ids.forEach(id => { const r = VERB(id); [['v1', id], ['v2', r.v2], ['v3', r.v3], ['ru', r.ru]].forEach(([k, txt]) => tiles.push({ id:uid(), verb:id, kind:k, txt, done:false })); });
  MG = { ids, tiles:shuffle(tiles), sel:[], miss:{}, moves:0, over:false };
}
function drawMatch(box) {
  const left = MG.ids.filter(id => MG.tiles.some(t => t.verb === id && !t.done)).length;
  box.innerHTML = `<p class="sub">Собери четвёрки: V1, V2, V3 и перевод одного глагола. Выбери четыре плитки — система проверит набор. Ошибки возвращают глагол в повторение.</p>
    <div class="mg-top mono"><span>осталось ${left}/5</span><span>ходов ${MG.moves}</span></div>
    <div class="mg">${MG.tiles.map(t => `<button class="mtile ${t.done ? 'done' : ''} ${MG.sel.includes(t.id) ? 'sel' : ''} ${t.kind === 'ru' ? 'ru' : 'mono'}" data-act="mtile" data-arg="${t.id}" ${t.done ? 'disabled' : ''}>${esc(t.txt)}</button>`).join('')}</div>
    ${MG.over ? `<div class="banner acid"><div><b>Раунд завершён за ${MG.moves} ходов.</b><p>${MG.ids.map(id => `${id}: ${MG.miss[id] ? 'с ошибками' : 'без ошибок'}`).join(' · ')}</p></div><button class="btn acid" data-act="mnew">Новый раунд</button></div>` : ''}`;
}
function tapTile(id) {
  if (MG.over) return;
  const t = MG.tiles.find(x => x.id === id); if (!t || t.done) return;
  MG.sel = MG.sel.includes(id) ? MG.sel.filter(x => x !== id) : [...MG.sel, id];
  if (MG.sel.length === 4) {
    MG.moves++;
    const ts = MG.sel.map(x => MG.tiles.find(y => y.id === x));
    const v = ts[0].verb, r = VERB(v);
    const want = [v, r.v2, r.v3, r.ru].sort().join('|'), got = ts.map(x => x.txt).sort().join('|');
    if (want === got) {
      MG.tiles.filter(x => MG.sel.includes(x.id) || (x.verb === v && ts.some(y => y.txt === x.txt))).forEach(x => { if (x.verb === v) x.done = true; });
      MG.tiles.filter(x => x.verb === v).forEach(x => x.done = true);
      recordVerb(v, !MG.miss[v]); toast(`${v} – ${r.v2} – ${r.v3}`, 'acid');
      if (canSpeak() && ST.settings.voiceAuto) Speech.say(`${v} – ${r.v2} – ${r.v3}`).catch(() => {});
    } else { ts.forEach(x => MG.miss[x.verb] = 1); toast('Не одна четвёрка — попробуй ещё', 'warn'); }
    MG.sel = [];
    if (MG.tiles.every(x => x.done)) { MG.over = true; addXP(15); checkAch(); }
    save();
  }
  drawMatch(document.getElementById('vbox'));
}
function newTyping(timed) { VT = { q:verbQueue(timed ? 40 : 10), i:0, ok:0, res:[], timed, start:Date.now(), over:false, checked:false }; }
function drawTyping(box) {
  if (VT.over || VT.i >= VT.q.length) {
    VT.over = true;
    box.innerHTML = `<div class="banner acid"><div><b>Готово: ${VT.ok}/${VT.res.length} верно.</b><p>${VT.res.filter(r => !r.ok).map(r => `${r.id} – ${VERB(r.id).v2} – ${VERB(r.id).v3}`).join(' · ') || 'Без ошибок.'}</p></div><div class="row"><button class="btn acid" data-act="vtnew" data-arg="0">Ещё 10</button><button class="btn ghost" data-act="vtnew" data-arg="1">Спринт 2 минуты</button></div></div>`;
    return;
  }
  const id = VT.q[VT.i], r = VERB(id);
  const left = VT.timed ? Math.max(0, 120 - Math.floor((Date.now() - VT.start) / 1000)) : null;
  box.innerHTML = `<div class="vt card"><div class="t-head"><span class="chip">${VT.timed ? 'СПРИНТ' : 'ВВОД ФОРМ'}</span><span class="mono">${VT.i + 1}/${VT.timed ? '∞' : VT.q.length}${left != null ? ' · ' + pad2(Math.floor(left / 60)) + ':' + pad2(left % 60) : ''}</span></div>
    <div class="vt-v"><b class="mono">${id}</b><span>${esc(r.ru)}</span>${canSpeak() ? `<button class="icon-b sm" data-act="say" data-arg="${id}" aria-label="Произнести">▶</button>` : ''}</div>
    <div class="vt-in"><label><span class="lbl">V2 · Past Simple</span><input type="text" id="vt2" class="ans-in" autocomplete="off" autocapitalize="off" spellcheck="false"></label><label><span class="lbl">V3 · Past Participle</span><input type="text" id="vt3" class="ans-in" autocomplete="off" autocapitalize="off" spellcheck="false"></label></div>
    <div id="vt-fb"></div><div class="t-ctrl"><button class="btn ghost" data-act="vtend">Закончить</button><button class="btn pri" data-act="vtcheck">Проверить</button></div></div>`;
  const a = box.querySelector('#vt2'), b = box.querySelector('#vt3');
  if (!matchMedia('(pointer:coarse)').matches) a.focus();
  a.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); b.focus(); } });
  b.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); VT.checked ? nextTyping() : checkTyping(); } });
}
function formOk(user, main, alts) { const u = canon(user); return [main, ...(alts || [])].some(x => canon(x) === u) || (main.includes('/') && main.split('/').some(x => canon(x) === u)); }
function checkTyping() {
  const id = VT.q[VT.i], r = VERB(id), a = el('#vt2').value.trim(), b = el('#vt3').value.trim();
  if (!a || !b) { toast('Впиши обе формы'); return; }
  const alt = IRR_ALT[id] || {};
  const ok2 = formOk(a, r.v2, alt.v2), ok3 = formOk(b, r.v3, alt.v3), ok = ok2 && ok3;
  VT.res.push({ id, ok }); if (ok) VT.ok++; recordVerb(id, ok); if (ok) addXP(4); save(); VT.checked = true;
  el('#vt-fb').innerHTML = `<div class="t-msg ${ok ? 'ok' : 'bad'}"><b>${ok ? 'Верно' : 'Есть ошибка'}</b> ${id} – ${r.v2} – ${r.v3}. ${!ok2 ? `V2: твой вариант «${esc(a)}». ` : ''}${!ok3 ? `V3: твой вариант «${esc(b)}». ` : ''}<span class="sub">${glossText(r.ex)}</span></div>`;
  const btn = document.querySelector('[data-act=vtcheck]'); btn.textContent = 'Дальше →'; btn.dataset.act = 'vtnext';
  if (VT.timed && Date.now() - VT.start > 120000) VT.over = true;
}
function nextTyping() { VT.i++; VT.checked = false; if (VT.timed && Date.now() - VT.start > 120000) VT.over = true; drawTyping(document.getElementById('vbox')); }

/* ---------- Murphy, диалоги ---------- */
function vMurphy() {
  return `<main class="wrap mur"><button class="back" data-act="go" data-arg="home">← Карта</button>
    <section class="lab-h"><div><div class="mono kicker">НЕОБЯЗАТЕЛЬНАЯ КОМНАТА · ESSENTIAL GRAMMAR IN USE</div><h1 class="lab-name">Комната Murphy</h1>
    <p class="lead">Тренировка по тому, что сейчас идёт в учебнике и тетради: was/were, Past Simple, Past Continuous и неправильные глаголы. Комната не меняет основную кампанию: этапы и открытие времён здесь не засчитываются, а ответы попадают в статистику правил и план повторения.</p></div>${tlSVG('pastproc', 'big')}</section>
    <div class="mrooms">${Object.entries(MURPHY).map(([k, M]) => `<button class="mode" data-act="murphy" data-arg="${k}"><span class="mode-big">${M.name}</span><span class="mode-d">${esc(M.d)}</span><span class="mode-d mono">10 заданий</span></button>`).join('')}
      <button class="mode" data-act="go" data-arg="verbs|type"><span class="mode-big">V2 / V3</span><span class="mode-d">Неправильные глаголы: ввод форм</span><span class="mode-d mono">10 глаголов</span></button></div>
    <section class="block"><div class="block-h"><h3>Справка</h3></div><div class="fx3">${fxBlock('+', 'Past Simple', TENSE.past.f.pos, TENSE.past.ex.pos[0])}${fxBlock('?', 'did + V1', TENSE.past.f.q, TENSE.past.ex.q[1])}${fxBlock('~', 'Past Continuous', TENSE.pastc.f.pos, TENSE.pastc.ex.pos[0])}</div>
    <p class="row"><button class="link" data-act="go" data-arg="formulas|past">Past Simple подробно</button><button class="link" data-act="go" data-arg="formulas|pastc">Past Continuous подробно</button></p></section>
    <section class="block"><div class="block-h"><h3>Диалоги о прошлом</h3></div><div class="dlgs">${DIALOGS.filter(d => ['past','pastc'].includes(d.t)).map(dlgCard).join('')}</div></section></main>`;
}
function dlgCard(d) { return `<button class="dlg" data-act="dialog" data-arg="${d.id}"><span class="ava">${esc(d.who[0])}</span><span><b>${esc(d.title)}</b><span class="sub">${esc(d.who)} · ${esc(d.role)} · ${TENSE[d.t].name} · ${d.steps.length} реплик</span></span></button>`; }
function vDialogs() {
  const open = DIALOGS.filter(d => ST.unlocked.includes(d.t)), murphy = DIALOGS.filter(d => !ST.unlocked.includes(d.t) && ['past','pastc'].includes(d.t)), closed = DIALOGS.filter(d => !ST.unlocked.includes(d.t) && !['past','pastc'].includes(d.t));
  return `<main class="wrap"><div class="block-h"><h1 class="h1">Диалоговый симулятор</h1><span class="mono sub">короткие переписки с персонажами</span></div>
    <p class="lead">Отвечай персонажам: выбирай реплику или пиши свою. Диалоги тренируют живое использование времён, а не только формулы.</p>
    <div class="dlgs">${open.map(dlgCard).join('')}</div>
    ${murphy.length ? `<div class="block-h"><h3>В комнате Murphy</h3></div><div class="dlgs">${murphy.map(dlgCard).join('')}</div>` : ''}
    ${closed.length ? `<div class="block-h"><h3>Откроются позже</h3></div><div class="dlgs">${closed.map(d => `<div class="dlg locked"><span class="ava">${esc(d.who[0])}</span><span><b>${esc(d.title)}</b><span class="sub">${TENSE[d.t].name}</span></span></div>`).join('')}</div>` : ''}</main>`;
}

/* ---------- модальные окна ---------- */
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="modal-in card" role="dialog" aria-modal="true">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m && ST.onboarded) m.remove(); });
  document.body.appendChild(m); return m;
}
/* ---------- всплывающий перевод ---------- */
function showGloss(btn) {
  const p = document.getElementById('pop');
  p.textContent = btn.dataset.gl; p.hidden = false;
  const r = btn.getBoundingClientRect();
  const x = Math.min(window.innerWidth - p.offsetWidth - 12, Math.max(12, r.left + r.width / 2 - p.offsetWidth / 2));
  p.style.left = x + 'px'; p.style.top = (r.bottom + 8) + 'px';
  clearTimeout(showGloss.t); showGloss.t = setTimeout(() => { p.hidden = true; }, 2600);
}

/* ---------- действия ---------- */
function refreshVerbUI(id) {
  if (document.querySelector('.modal.vcard')) showVerbCard(id);
  if (document.getElementById('dlist')) drawDict();
}
const ACT = {
  go(a) { const [n, x] = (a || 'home').split('|'); if (n === 'verbs' && x === 'type') newTyping(false); if (n === 'verbs' && x === 'match') newMatch(); go(n, x); },
  lab(t) { go('lab', t); },
  stage(a) { const [t, s] = a.split('|'); startSession(cfgStage(t, s)); },
  mode(a) { const [t, m] = a.split('|'); startSession(cfgMode(t, m)); },
  starter() { startSession(cfgStarter()); },
  diag() { document.querySelectorAll('.modal').forEach(m => m.remove()); startSession(cfgDiag()); },
  review() { startSession(cfgReview()); },
  blitz(t) { startSession(cfgBlitz(t || ST.current)); },
  tlgame(t) { startSession(cfgTimeline(t || null)); },
  dialog(id) { startSession(cfgDialog(id)); },
  murphy(k) { startSession(cfgMurphy(k)); },
  fxtest(t) { startSession(cfgFormula(t)); },
  check() { doCheck(); },
  next() { goNext(); },
  hint() {
    if (!SES || !SES.cur || SES.checked) return;
    const h = document.getElementById('t-hint'); h.hidden = false; h.textContent = 'Подсказка: ' + SES.cur.hint; SES.hint = true;
  },
  retryErr() { if (!SES || !SES.cur) return; const t = genForRule(SES.cur.rule, {}); if (t) { t.back = 1; SES.inject.unshift(t); } goNext(); },
  quit() { if (SES && SES.results.length) finishSession(); else { SES = null; go('home'); } },
  again() { if (LAST) startSession(regenCfg(LAST.cfg)); },
  redoErr() { if (LAST) startSession(cfgRules(LAST.results.filter(r => !r.ok).map(r => r.task.rule))); },
  redoHist() { startSession(cfgRules(ST.errors.slice(-30).map(e => e.rule).filter(id => RULES[id]), 'Повторение по истории ошибок')); },
  unlock(t) {
    const nx = nextTense(t); if (!nx || ST.unlocked.includes(nx) || !unlockChecks(t).ok) return;
    ST.unlocked.push(nx); ST.current = nx; save(); toast(`Открыта лаборатория ${TENSE[nx].name}`, 'acid'); go('lab', nx);
  },
  settings() { document.querySelectorAll('.modal').forEach(m => m.remove()); go('profile', 'settings'); },
  close(a, b) { const m = b.closest('.modal'); if (m) m.remove(); },
  openLab(t) {
    if (!TENSE[t] || ST.unlocked.includes(t)) return;
    ST.unlocked.push(t); ST.unlocked.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)); lab(t).by = 'manual'; ST.current = t; save();
    toast(`Лаборатория ${TENSE[t].name} открыта`, 'acid'); go('lab', t);
  },
  fxmode(a) { ST.settings.fxDetail = a === '1'; save(); render(); },
  flip(a, b) { b.classList.toggle('on'); },
  say(a) { speak(a); },
  sayAgain() { if (!Speech.last) { toast('Пока нечего повторять'); return; } Speech.repeat().catch(() => toast('Не удалось воспроизвести звук', 'warn')); },
  vtoggle(id) { ST.verbsActive = ST.verbsActive.includes(id) ? ST.verbsActive.filter(x => x !== id) : [...ST.verbsActive, id]; verbSt(id); save(); refreshVerbUI(id); },
  vfav(id) { const v = verbSt(id); v.fav = !v.fav; save(); refreshVerbUI(id); },
  vmark(id) { const v = verbSt(id); if (v.step >= 3) { toast('Глагол выучен по повторениям — отметку не снять'); return; } v.mark = !v.mark; save(); refreshVerbUI(id); },
  vcard(id) { showVerbCard(id); },
  dsort(a) { DQ.sort = a === 'freq' ? 'freq' : 'az'; document.querySelectorAll('.dict .seg button').forEach(b => b.classList.toggle('on', b.dataset.arg === DQ.sort)); drawDict(); },
  dletter(l) {
    if (DQ.sort !== 'az' || DQ.q || DQ.show !== 'all' || DQ.grp) { DQ.sort = 'az'; DQ.q = ''; DQ.show = 'all'; DQ.grp = ''; mountVerbs('lib'); }
    const h = document.getElementById('dl-' + l); if (h) h.scrollIntoView({ behavior:ST.settings.rm ? 'auto' : 'smooth', block:'start' });
  },
  vtrain(a) {
    let ids;
    if (a === 'fav') { ids = VERB_DICT.filter(v => ST.verbs[v.v1] && ST.verbs[v.v1].fav).map(v => v.v1); if (!ids.length) { toast('Сначала добавь глаголы в избранное (★)'); return; } }
    else if (a === 'found') { ids = dictList().map(v => v.v1); if (!ids.length) { toast('Список пуст — измени поиск'); return; } }
    else ids = [a.split('|')[1]];
    document.querySelectorAll('.modal').forEach(m => m.remove());
    VT = { q:shuffle(ids).slice(0, 20), i:0, ok:0, res:[], timed:false, start:Date.now(), over:false, checked:false };
    go('verbs', 'type');
  },
  mtile(id) { tapTile(id); },
  mnew() { newMatch(); drawMatch(document.getElementById('vbox')); },
  vtcheck() { checkTyping(); },
  vtnext() { nextTyping(); },
  vtend() { VT.over = true; drawTyping(document.getElementById('vbox')); },
  vtnew(a) { newTyping(a === '1'); drawTyping(document.getElementById('vbox')); },
  copyexp() { const t = el('#exp'); try { navigator.clipboard.writeText(t.value).then(() => toast('Скопировано'), () => { t.select(); toast('Выдели текст и скопируй вручную'); }); } catch (e) { t.select(); toast('Выдели текст и скопируй вручную'); } },
  import() {
    try { const s = upgrade(JSON.parse(el('#imp').value)); if (!s) throw 0; ST = s; save(); applyVoiceSettings(); toast('Прогресс загружен', 'acid'); go('home'); }
    catch (e) { toast('Не получилось прочитать текст. Вставь экспорт целиком.', 'warn'); }
  },
  reset1() { el('#reset-box').innerHTML = `<p class="bad-t">Точно удалить весь прогресс${Cloud.user ? ' — на этом устройстве и в облаке' : ' в этом браузере'}? Это нельзя отменить.</p><div class="row"><button class="btn sm danger" data-act="reset2">Да, удалить</button><button class="btn sm ghost" data-act="go" data-arg="profile|settings">Отмена</button></div>`; },
  async reset2() {
    const keep = { profile:ST.profile, settings:ST.settings, plan:ST.plan, onboarded:true };
    ST = Object.assign(defaultState(), keep); save(); MG = null; VT = null;
    if (Cloud.user) { try { await Cloud.resetProgress(); toast('Прогресс сброшен на устройстве и в облаке'); } catch (e) { toast('На устройстве сброшено, в облаке — не удалось. Попробуй позже.', 'warn'); } }
    else toast('Прогресс сброшен');
    go('home');
  }
};
document.addEventListener('click', e => {
  const g = e.target.closest('.gl');
  if (g && ST.settings.gloss) { e.preventDefault(); e.stopPropagation(); showGloss(g); return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const f = ACT[b.dataset.act]; if (f) f(b.dataset.arg, b, e);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || V.name !== 'session' || !SES) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'textarea') return;
  if (tag === 'button' && !e.target.closest('#fb')) return;
  if (e.target.id === 'fix-in') { e.preventDefault(); doCheck(); return; }
  if (SES.cur && SES.cur.type === 'lesson') { e.preventDefault(); goNext(); return; }
  if (tag === 'button') return;
  e.preventDefault(); SES.checked ? goNext() : doCheck();
});


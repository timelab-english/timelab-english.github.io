'use strict';
/* =========================================================
   TIME LAB · профиль, вход, учебный план, onboarding, личный кабинет
   ========================================================= */

/* ---------- аватары ---------- */
const AVATARS = [['a1','◐','acid'],['a2','▲','blue'],['a3','✦','orange'],['a4','●','fg'],['a5','■','acid'],['a6','◆','blue'],
  ['a7','✺','orange'],['a8','☾','fg'],['a9','∞','acid'],['a10','λ','blue'],['a11','Ω','orange'],['a12','⌘','fg']];
function avatarHTML(id, cls) {
  const a = AVATARS.find(x => x[0] === id) || AVATARS[0];
  return `<span class="ava-b ${cls || ''}" style="--c:var(--${a[2] === 'fg' ? 'fg' : a[2]})" aria-hidden="true">${a[1]}</span>`;
}
const displayName = () => (ST.profile.name || '').trim() || (Cloud.user ? (Cloud.user.email || '').split('@')[0] : 'Гость');

/* ---------- шапка: статус сохранения и профиль ---------- */
const SYNC_TXT = { saved:['ok','Сохранено'], syncing:['busy','Синхронизация…'], error:['bad','Не удалось сохранить'], offline:['off','Нет сети · сохранено на устройстве'], idle:['busy','Синхронизация…'] };
function syncChip() {
  if (!Cloud.user) return '';
  const [cls, txt] = SYNC_TXT[Cloud.status] || SYNC_TXT.idle;
  return `<button class="sync mono ${cls}" id="sync-chip" data-act="syncNow" title="${esc(Cloud.statusMsg || txt)}" aria-live="polite"><i aria-hidden="true"></i><span>${txt}</span></button>`;
}
function meButton() {
  const login = Cloud.configured && !Cloud.user ? `<button class="btn sm ghost login-b" data-act="auth" data-arg="in">Войти</button>` : '';
  return `${login}<button class="me-b" data-act="go" data-arg="profile" aria-label="Мой профиль: ${esc(displayName())}" title="${esc(displayName())}">${avatarHTML(ST.profile.avatar)}</button>`;
}
function storageNote() {
  if (Cloud.user) return 'прогресс сохраняется в аккаунте и на этом устройстве';
  return Cloud.configured ? 'гостевой режим · прогресс хранится в этом браузере' : 'прогресс хранится в этом браузере';
}
Cloud.onStatus(() => { const c = document.getElementById('sync-chip'); if (c) c.outerHTML = syncChip(); });

/* ---------- учебный план ---------- */
const LEVELS = ['A1','A2','B1','B2'];
const LEVEL_PLAN = {
  A1:{ open:['ps'], start:'ps', skip:false },
  A2:{ open:['ps','pc','past'], start:'ps', skip:true },
  B1:{ open:['ps','pc','past','pastc','pp'], start:'pp', skip:true },
  B2:{ open:['ps','pc','past','pastc','pp','ppc','pastp','fs'], start:'ppc', skip:true }
};
const GOALS = { tenses:'Изучить английские времена', grammar:'Улучшить грамматику', sentences:'Научиться самостоятельно строить предложения', review:'Повторить забытые правила', speak:'Подготовиться к более свободному общению' };
const LENS = { warm:'5 минут', normal:'10–15 минут', full:'20–30 минут', free:'Свободный режим' };
const EXPS = { zero:'Начинаю с нуля', some:'Немного знаю английский', base:'Есть база, хочу улучшить' };
function reviewShare() { return ST.plan.reviewOld === false ? 0 : ST.plan.goal === 'review' ? 0.4 : 0.25; }
function goalBoost(mech) {
  const B = { sentences:{ build:1.7, translate:1.7, input:1.2 }, speak:{ chat:2, translate:1.5, build:1.2 }, grammar:{ fix:1.5, choice:1.2, multi:1.2, tf:1.1 } }[ST.plan.goal];
  return (B && B[mech]) || 1;
}
function levelLabel(P) {
  P = P || ST.plan;
  const parts = [];
  if (P.levelSelf) parts.push(`Выбранный уровень: ${P.levelSelf}`);
  if (P.levelDiag && P.levelDiag.level) parts.push(`По диагностике (ориентир): ${P.levelDiag.level}`);
  if (!parts.length) parts.push(P.exp === 'zero' ? 'Начинаем с нуля' : 'Уровень не выбран');
  return parts.join(' · ');
}
// Открыть лаборатории по уровню или диагностике. Ничего не закрывает и не стирает.
function openLabs(list, by) {
  list.forEach(t => { if (!TENSE[t]) return; if (!ST.unlocked.includes(t)) { ST.unlocked.push(t); lab(t).by = by; } });
  ST.unlocked.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}
function applyPlan() {
  const P = ST.plan;
  if (P.method === 'diag' && P.levelDiag && P.levelDiag.rec) { openLabs(P.levelDiag.open, 'diag'); P.start = P.levelDiag.rec; P.skipKnown = true; }
  else if (P.levelSelf && LEVEL_PLAN[P.levelSelf]) { const L = LEVEL_PLAN[P.levelSelf]; openLabs(L.open, 'level'); P.start = L.start; if (P.method !== 'first') P.skipKnown = L.skip; }
  else { P.start = P.start || 'ps'; openLabs([P.start], 'start'); }
  if (P.method === 'first') { P.start = 'ps'; P.skipKnown = true; }
  if (!ST.unlocked.includes(P.start)) openLabs([P.start], 'level');
  ST.current = P.start; P.set = Date.now();
}
const weakRules = () => RULES_LIST.filter(r => r.cat !== 'fx' && ST.rules[r.id] && ST.rules[r.id].seen >= 5 && mastery(r.id) < 0.6)
  .sort((a, b) => mastery(a.id) - mastery(b.id));
function routeSteps() {
  const t = ST.current, T = TENSE[t], ns = nextStage(t), uc = unlockChecks(t), nx = nextTense(t), due = dueRules(), weak = weakRules();
  const out = [];
  if (!ST.starterDone && t === 'ps' && ST.plan.exp !== 'base') out.push({ k:'start', txt:'Стартовое испытание Present Simple', d:'15 вопросов, чтобы увидеть сильные и слабые правила', act:'starter' });
  if (due.length) out.push({ k:'rev', txt:`Повторение · ${due.length}`, d:'правила, которым пора на интервальное повторение', act:'review' });
  if (weak.length) out.push({ k:'weak', txt:`Дополнительная тренировка: ${weak[0].name}`, d:`${TENSE[weak[0].t].name} · освоение ${pct(mastery(weak[0].id))} — ошибки повторяются`, act:'trainRule', arg:weak[0].id });
  if (ns) out.push({ k:'stage', txt:`${T.name}: ${ns.name}`, d:ns.id === 'boss' ? 'финальное испытание — нужно 80%' : `этап ${STAGES.indexOf(ns) + 1} из 8`, act:'stage', arg:`${t}|${ns.id}` });
  else out.push({ k:'stage', txt:`${T.name}: тренировка`, d:'все этапы пройдены — закрепляй в тестах', act:'mode', arg:`${t}|${ST.plan.len === 'free' ? 'free' : 'test'}` });
  if (uc.ok && nx && !ST.unlocked.includes(nx)) out.push({ k:'next', txt:`Можно открыть ${TENSE[nx].name}`, d:'переход только по твоему решению', act:'lab', arg:t });
  else if (nx) out.push({ k:'later', txt:`Дальше: ${TENSE[nx].name}`, d:uc.ok ? 'уже открыто' : 'после выполнения условий перехода или вручную', act:'lab', arg:ST.unlocked.includes(nx) ? nx : t });
  return out;
}
const timesWord = n => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'раза' : 'раз';
function weekCount() { const from = Date.now() - 7 * DAY; return ST.history.filter(h => h.d >= from).length; }
function vRoutePanel() {
  const steps = routeSteps(), P = ST.plan;
  const setup = ST.onboarded && !P.set;
  const guestHint = Cloud.configured && !Cloud.user && ST.totals.tasks >= 5;
  return `<section class="block route">
    <div class="block-h"><h3>Твой маршрут</h3><span class="mono sub">${esc(levelLabel())} · ${esc(GOALS[P.goal] || '')}${P.perWeek ? ` · на этой неделе ${weekCount()} из ${P.perWeek} занятий` : ''}</span></div>
    ${setup ? `<div class="banner"><div><span class="mono tag-o">ПЛАН</span><b>Настрой личный учебный план</b><p>Уровень, цель и ритм занятий — минута. Прогресс и история не изменятся.</p></div><button class="btn pri" data-act="planSetup">Настроить</button></div>` : ''}
    <ol class="route-l">${steps.map((s, i) => `<li><button class="route-i ${s.k}" data-act="${s.act}" ${s.arg ? `data-arg="${esc(s.arg)}"` : ''}><span class="mono route-n">${pad2(i + 1)}</span><span><b>${esc(s.txt)}</b><small>${esc(s.d)}</small></span><span aria-hidden="true">→</span></button></li>`).join('')}</ol>
    ${guestHint ? `<p class="sub">Ты в гостевом режиме: прогресс живёт только в этом браузере. <button class="link" data-act="auth" data-arg="up">Создай профиль</button> — и продолжай на любом устройстве.</p>` : ''}
  </section>`;
}

/* ---------- диагностика ---------- */
function diagResult(results) {
  const per = {};
  results.forEach(r => { const t = (RULES[r.task.rule] || {}).t; if (!t) return; const b = per[t] || (per[t] = [0, 0]); b[1]++; if (r.ok) b[0]++; });
  const acc = t => per[t] ? per[t][0] / per[t][1] : 0;
  const core1 = acc('ps') >= 0.67, core2 = acc('past') >= 0.67 && acc('pc') >= 0.5, core3 = acc('pastc') >= 0.5 && acc('pp') >= 0.5;
  const adv = ['ppc','pastp','fs'].filter(t => acc(t) >= 0.99).length >= 2;
  const level = !core1 ? 'A1' : !core2 || !core3 ? 'A2' : !adv ? 'B1' : 'B2';
  const tested = ORDER.filter(t => per[t]);
  let rec = tested.find(t => acc(t) < 0.67);
  if (!rec) rec = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(tested[tested.length - 1]) + 1)];
  const open = ORDER.slice(0, ORDER.indexOf(rec) + 1);
  const ok = results.filter(r => r.ok).length;
  return { level, rec, open, per, score:ok, total:results.length, date:Date.now() };
}
function diagBlock(d) {
  return `<div class="diag card"><span class="mono kicker">ОРИЕНТИРОВОЧНАЯ ОЦЕНКА · НЕ СЕРТИФИКАТ CEFR</span>
    <div class="diag-l"><b class="diag-lvl">${esc(d.level)}</b><p>По 15 вопросам: ${d.score}/${d.total}. Рекомендуем начать с лаборатории <b>${TENSE[d.rec].name}</b>; предыдущие времена откроются для проверки, но освоенными не будут считаться, пока ты не подтвердишь их ответами.</p></div>
    <ul class="diag-t">${ORDER.filter(t => d.per[t]).map(t => { const [o, n] = d.per[t]; return `<li><span>${TENSE[t].name}</span><span class="mono">${o}/${n}</span>${bar(o / n, o / n >= 0.67 ? 'good' : o / n >= 0.4 ? 'mid' : 'low')}</li>`; }).join('')}</ul>
    <div class="row"><button class="btn acid" data-act="applyDiag">Применить рекомендацию</button><button class="btn ghost" data-act="go" data-arg="home">Оставить план как есть</button></div></div>`;
}

/* ---------- onboarding ---------- */
let ONB = null;
function showOnboarding() {
  if (document.querySelector('.modal.onb')) return;
  ONB = { step:1, exp:null, method:null, level:null, goal:'tenses', len:'normal', perWeek:null, setupOnly:ST.onboarded };
  const m = modal('<div id="onb"></div>'); m.classList.add('onb');
  onbDraw();
}
function onbDraw() {
  const box = document.getElementById('onb'); if (!box) return;
  const O = ONB, total = O.exp === 'zero' ? 4 : 5, n = O.step === 6 ? total : Math.min(O.step - (O.exp === 'zero' && O.step > 3 ? 1 : 0), total);
  const card = (act, arg, title, d, on) => `<button class="ocard ${on ? 'on' : ''}" data-act="${act}" data-arg="${arg}" aria-pressed="${!!on}"><b>${title}</b>${d ? `<small>${d}</small>` : ''}</button>`;
  const dots = `<div class="onb-dots" aria-label="Шаг ${n} из ${total}">${Array.from({ length:total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
  const nav = (next, label) => `<div class="onb-nav">${O.step > (O.setupOnly ? 2 : 1) ? '<button class="btn ghost" data-act="onbBack">← Назад</button>' : '<span></span>'}<span class="row">${O.step < 6 ? '<button class="link" data-act="onbSkip">Пропустить</button>' : ''}${next ? `<button class="btn pri" data-act="onbNext" ${next === 'off' ? 'disabled' : ''}>${label || 'Дальше'}</button>` : ''}</span></div>`;
  let h = '';
  if (O.step === 1) h = `<div class="onb-h"><span class="mono kicker">ДОБРО ПОЖАЛОВАТЬ В</span><h2 class="mega sm"><span class="m1">TIME</span> <span class="m2">LAB</span></h2>
      <p class="lead">Лаборатория английских времён. Двенадцать времён — двенадцать лабораторий: формулы, конструктор предложений, диалоги, неправильные глаголы с озвучкой и повторение по интервалам.</p>
      <ul class="onb-f"><li><b>Без обязательного теста</b> — начни с того места, которое подходит тебе.</li><li><b>Адаптивно</b> — задания подстраиваются под твои ошибки.</li><li><b>Твой темп</b> — к следующему времени переходишь только по своему решению.</li></ul></div>
    <div class="onb-nav"><span class="row">${Cloud.configured && !Cloud.user ? '<button class="btn ghost" data-act="auth" data-arg="in">У меня уже есть аккаунт</button>' : ''}</span><span class="row"><button class="link" data-act="onbSkipAll">Пропустить знакомство</button><button class="btn pri" data-act="onbNext">Начать</button></span></div>`;
  if (O.step === 2) h = `<h3 class="onb-q">Насколько хорошо ты знаешь английский?</h3><div class="ocards">
      ${card('onbExp', 'zero', 'Я начинаю с нуля', 'Начнём с Present Simple и базовых конструкций', O.exp === 'zero')}
      ${card('onbExp', 'some', 'Я немного знаю английский', 'Простые предложения получаются, но с ошибками', O.exp === 'some')}
      ${card('onbExp', 'base', 'У меня уже есть база', 'Хочу укрепить и расширить знания', O.exp === 'base')}</div>${nav(O.exp ? 'on' : 'off')}`;
  if (O.step === 3) h = `<h3 class="onb-q">С чего начнём?</h3><div class="ocards">
      ${card('onbMethod', 'level', 'Выбрать уровень самостоятельно', 'Примерно — A1, A2, B1 или B2', O.method === 'level')}
      ${card('onbMethod', 'diag', 'Короткая диагностика', '15 разных вопросов, около 5 минут. Ориентир, а не экзамен', O.method === 'diag')}
      ${card('onbMethod', 'first', 'С первого времени', 'Знакомые темы можно будет закрывать быстрой проверкой', O.method === 'first')}</div>
      ${O.method === 'level' ? `<div class="lvls" role="group" aria-label="Уровень">${LEVELS.map(l => `<button class="lvl-b ${O.level === l ? 'on' : ''}" data-act="onbLevel" data-arg="${l}" aria-pressed="${O.level === l}"><b>${l}</b><small>${{ A1:'начальный', A2:'базовый', B1:'средний', B2:'выше среднего' }[l]}</small></button>`).join('')}</div><p class="sub">Это будет «выбранный уровень», а не результат теста. Его можно изменить в настройках.</p>` : ''}
      ${nav(O.method && (O.method !== 'level' || O.level) ? 'on' : 'off')}`;
  if (O.step === 4) h = `<h3 class="onb-q">Какая у тебя цель?</h3><div class="ocards">${Object.entries(GOALS).map(([k, v]) => card('onbGoal', k, v, '', O.goal === k)).join('')}</div>${nav('on')}`;
  if (O.step === 5) h = `<h3 class="onb-q">Ритм занятий</h3><div class="ocards four">${Object.entries(LENS).map(([k, v]) => card('onbLen', k, v, { warm:'6 заданий', normal:'12 заданий', full:'20 заданий, перевод и диалоги', free:'без ограничения' }[k], O.len === k)).join('')}</div>
      <span class="lbl">Сколько раз в неделю (по желанию)</span>
      <div class="chips">${[2, 3, 4, 5, 7].map(x => `<button class="chipbtn ${O.perWeek === x ? 'on' : ''}" data-act="onbWeek" data-arg="${x}">${x} ${x < 5 ? 'раза' : 'раз'}</button>`).join('')}<button class="chipbtn ${O.perWeek == null ? 'on' : ''}" data-act="onbWeek" data-arg="0">Без расписания</button></div>
      <p class="sub">Расписание — только подсказка. Пропуски ничего не обнуляют, а частота занятий не влияет на оценку уровня.</p>${nav('on', 'Показать маршрут')}`;
  if (O.step === 6) {
    const P = onbPlan(), tmp = Object.assign({}, P);
    const start = P.method === 'diag' ? null : (P.levelSelf && P.method === 'level' ? LEVEL_PLAN[P.levelSelf].start : 'ps');
    const opened = P.method === 'level' && P.levelSelf ? LEVEL_PLAN[P.levelSelf].open : ['ps'];
    h = `<h3 class="onb-q">Твой маршрут</h3>
      <div class="route-sum">
        <div><span class="lbl">Уровень</span><p>${esc(levelLabel(tmp))}</p></div>
        <div><span class="lbl">Цель</span><p>${esc(GOALS[P.goal])}</p></div>
        <div><span class="lbl">Ритм</span><p>${esc(LENS[P.len])}${P.perWeek ? ` · ${P.perWeek} ${timesWord(P.perWeek)} в неделю` : ' · без расписания'}</p></div>
        <div><span class="lbl">Старт</span><p>${start ? `${TENSE[start].name}${opened.length > 1 ? ` · открыто для проверки: ${opened.map(t => TENSE[t].name).join(', ')}` : ''}` : 'после диагностики — по её рекомендации'}</p></div>
      </div>
      <ol class="route-l static">${(P.method === 'diag' ? ['Диагностика · 15 вопросов', 'Рекомендация стартовой лаборатории', 'Этапы: формула → утверждения → отрицания → вопросы → ошибки → различия → без подсказок → босс']
        : [P.exp === 'zero' || P.method === 'first' || P.levelSelf === 'A1' ? 'Стартовое испытание Present Simple (по желанию)' : `Лаборатория ${TENSE[start].name}`, P.skipKnown ? 'Знакомые темы — быстрая проверка финальным испытанием' : 'Этапы по порядку: от формулы до финального испытания', 'Повторение ошибок через 1 · 3 · 7 · 14 · 30 дней', 'Следующее время — только по твоей кнопке']).map((s, i) => `<li><span class="mono route-n">${pad2(i + 1)}</span><span>${esc(s)}</span></li>`).join('')}</ol>
      ${Cloud.configured && !Cloud.user ? '<p class="sub">Хочешь продолжать на любом устройстве? <button class="link" data-act="auth" data-arg="up">Создай профиль</button> — гостевой прогресс перенесётся.</p>' : ''}
      <div class="onb-nav"><button class="btn ghost" data-act="onbBack">← Назад</button><span class="row">${P.method === 'diag' ? '<button class="btn ghost" data-act="onbFinish" data-arg="plain">Начать без диагностики</button><button class="btn pri" data-act="onbFinish" data-arg="diag">Пройти диагностику</button>' : '<button class="btn pri" data-act="onbFinish" data-arg="go">Начать игру</button>'}</span></div>`;
  }
  box.innerHTML = (O.step > 1 ? dots : '') + h;
}
function onbPlan() {
  const O = ONB, P = Object.assign(defaultPlan(), ST.plan);
  P.exp = O.exp; P.method = O.exp === 'zero' ? null : O.method; P.levelSelf = O.exp === 'zero' ? 'A1' : (O.method === 'level' ? O.level : P.levelSelf);
  P.goal = O.goal; P.len = O.len; P.perWeek = O.perWeek || null;
  P.skipKnown = O.exp !== 'zero' && (O.method === 'first' || (O.method === 'level' && O.level && LEVEL_PLAN[O.level].skip));
  return P;
}
function onbStep(d) {
  let s = ONB.step + d;
  if (ONB.exp === 'zero' && s === 3) s += d;
  ONB.step = Math.max(ONB.setupOnly ? 2 : 1, Math.min(6, s)); onbDraw();
}
function finishOnb(kind) {
  ST.plan = onbPlan(); ST.onboarded = true;
  if (kind !== 'skipall') applyPlan(); else { ST.plan.set = Date.now(); }
  save(); document.querySelectorAll('.modal.onb').forEach(m => m.remove()); ONB = null;
  if (kind === 'diag') { startSession(cfgDiag()); return; }
  go('home');
}

/* ---------- вход, регистрация, восстановление пароля ---------- */
const AUTH_ERR = [
  [/invalid login credentials/i, 'Неверный email или пароль.'],
  [/email not confirmed/i, 'Email ещё не подтверждён — открой ссылку из письма.'],
  [/already registered|already been registered|user already exists/i, 'Такой email уже зарегистрирован. Войди или восстанови пароль.'],
  [/password should be at least|weak password/i, 'Пароль слишком простой: нужно минимум 8 символов.'],
  [/rate limit|too many|security purposes/i, 'Слишком много попыток. Подожди минуту и попробуй снова.'],
  [/invalid email|unable to validate email/i, 'Проверь адрес email.'],
  [/provider is not enabled|unsupported provider/i, 'Вход через Google ещё не включён в настройках Supabase.'],
  [/failed to fetch|network/i, 'Нет связи с сервером. Проверь интернет.'],
  [/function .*delete_my_account|could not find the function/i, 'На сервере не выполнена SQL-миграция TIME LAB.']
];
const authErr = e => { const m = String((e && e.message) || e || ''); const f = AUTH_ERR.find(([r]) => r.test(m)); return f ? f[1] : (m || 'Что-то пошло не так. Попробуй ещё раз.'); };
const emailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
function showAuth(mode) {
  if (!Cloud.configured) { toast('Облачные профили пока не подключены к этой копии TIME LAB. Прогресс сохраняется в браузере.', 'warn'); return; }
  document.querySelectorAll('.modal.auth').forEach(m => m.remove());
  const tabs = [['in','Вход'],['up','Регистрация'],['reset','Забыли пароль?']];
  const body = {
    in:`<label class="fld"><span class="lbl">Email</span><input type="email" id="au-email" autocomplete="email" required></label>
        <label class="fld"><span class="lbl">Пароль</span><input type="password" id="au-pw" autocomplete="current-password" required></label>
        <button class="btn pri" type="submit">Войти</button>`,
    up:`<label class="fld"><span class="lbl">Имя или никнейм</span><input type="text" id="au-name" maxlength="40" autocomplete="nickname"></label>
        <label class="fld"><span class="lbl">Email</span><input type="email" id="au-email" autocomplete="email" required></label>
        <label class="fld"><span class="lbl">Пароль · минимум 8 символов</span><input type="password" id="au-pw" autocomplete="new-password" minlength="8" required></label>
        <label class="fld"><span class="lbl">Повтори пароль</span><input type="password" id="au-pw2" autocomplete="new-password" minlength="8" required></label>
        <button class="btn pri" type="submit">Создать профиль</button>
        <p class="sub">Гостевой прогресс с этого устройства можно будет перенести в новый профиль.</p>`,
    reset:`<p class="sub">Пришлём письмо со ссылкой. По ней можно задать новый пароль.</p>
        <label class="fld"><span class="lbl">Email</span><input type="email" id="au-email" autocomplete="email" required></label>
        <button class="btn pri" type="submit">Отправить ссылку</button>`
  }[mode];
  const m = modal(`<div class="block-h"><h3>Профиль TIME LAB</h3><button class="icon-b" data-act="close" aria-label="Закрыть">×</button></div>
    <div class="seg auth-tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" aria-selected="${k === mode}" class="${k === mode ? 'on' : ''}" data-act="auth" data-arg="${k}">${n}</button>`).join('')}</div>
    <form class="auth-f" id="auth-f" novalidate>${body}<p class="t-msg" id="au-msg" hidden></p></form>
    ${mode !== 'reset' && Cloud.google ? `<div class="or mono">или</div><button class="btn ghost" data-act="google">Продолжить с Google</button>` : ''}
    <p class="sub">Пароль проверяет и хранит (в виде хеша) только Supabase Auth — TIME LAB его не сохраняет.</p>`);
  m.classList.add('auth');
  const f = m.querySelector('#auth-f'), msg = m.querySelector('#au-msg');
  const show = (txt, ok) => { msg.hidden = false; msg.className = 't-msg ' + (ok ? 'ok' : 'bad'); msg.textContent = txt; };
  const first = f.querySelector('input'); if (first && !matchMedia('(pointer:coarse)').matches) first.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const email = (f.querySelector('#au-email').value || '').trim(), pw = f.querySelector('#au-pw') ? f.querySelector('#au-pw').value : '';
    if (!emailOk(email)) return show('Проверь адрес email.');
    if (mode !== 'reset' && pw.length < (mode === 'up' ? 8 : 1)) return show(mode === 'up' ? 'Пароль должен быть не короче 8 символов.' : 'Введи пароль.');
    if (mode === 'up' && pw !== f.querySelector('#au-pw2').value) return show('Пароли не совпадают.');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      if (mode === 'in') { await Cloud.signIn(email, pw); m.remove(); toast('Вход выполнен', 'acid'); }
      if (mode === 'up') {
        const name = (f.querySelector('#au-name').value || '').trim().slice(0, 40);
        if (name) { ST.profile.name = name; save(); }
        const r = await Cloud.signUp(email, pw, name);
        if (r.needConfirm) show('Почти готово: мы отправили письмо на ' + email + '. Открой ссылку, чтобы подтвердить email, и войди.', true);
        else { m.remove(); toast('Профиль создан', 'acid'); }
      }
      if (mode === 'reset') { await Cloud.resetPassword(email); show('Если такой email зарегистрирован, письмо уже в пути. Проверь и папку «Спам».', true); }
    } catch (err) { show(authErr(err)); }
    btn.disabled = false;
  });
}
function showRecovery() {
  document.querySelectorAll('.modal.auth').forEach(m => m.remove());
  const m = modal(`<div class="block-h"><h3>Новый пароль</h3><button class="icon-b" data-act="close" aria-label="Закрыть">×</button></div>
    <form class="auth-f" id="rec-f" novalidate><label class="fld"><span class="lbl">Новый пароль · минимум 8 символов</span><input type="password" id="rc-pw" autocomplete="new-password" minlength="8" required></label>
    <label class="fld"><span class="lbl">Повтори пароль</span><input type="password" id="rc-pw2" autocomplete="new-password" minlength="8" required></label>
    <button class="btn pri" type="submit">Сохранить пароль</button><p class="t-msg" id="rc-msg" hidden></p></form>`);
  m.classList.add('auth');
  const f = m.querySelector('#rec-f'), msg = m.querySelector('#rc-msg');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const a = f.querySelector('#rc-pw').value, b = f.querySelector('#rc-pw2').value;
    const bad = t => { msg.hidden = false; msg.className = 't-msg bad'; msg.textContent = t; };
    if (a.length < 8) return bad('Пароль должен быть не короче 8 символов.');
    if (a !== b) return bad('Пароли не совпадают.');
    try { await Cloud.updatePassword(a); m.remove(); toast('Пароль обновлён', 'acid'); } catch (err) { bad(authErr(err)); }
  });
}

/* ---------- переключение пользователей и перенос гостевого прогресса ---------- */
const hasProgress = S => !!(S && (S.totals.tasks > 0 || S.xp > 0 || Object.keys(S.rules).length || S.history.length));
let PENDING_GUEST = null, LOADING = false;
function showLoading(on) {
  LOADING = on;
  document.querySelectorAll('.modal.loading').forEach(m => m.remove());
  if (on) { const m = modal('<div class="loading-b"><span class="spin" aria-hidden="true"></span><b>Загружаем твой прогресс…</b><p class="sub">Это займёт пару секунд.</p></div>'); m.classList.add('loading'); }
}
Cloud.onUser((u, ev) => {
  if (ev === 'PASSWORD_RECOVERY') { setTimeout(showRecovery, 50); return; }
  if (ev === 'PULLED') {
    if (LOADING) showLoading(false);
    if (PENDING_GUEST && u) { const g = PENDING_GUEST; PENDING_GUEST = null; showMigrate(g); }
    if (!SES && !document.querySelector('.modal:not(.loading)')) render();
    else refreshHeader();
    if (!ST.onboarded && !document.querySelector('.modal.onb')) showOnboarding();
    return;
  }
  if (u) {
    if (STORE_KEY === keyFor(u.id)) { refreshHeader(); return; }
    const guest = STORE_KEY === GUEST_KEY ? ST : null;
    let cached = false; try { cached = !!localStorage.getItem(keyFor(u.id)); } catch (e) {}
    SES = null; if (TIMER) { clearInterval(TIMER); TIMER = null; }
    document.querySelectorAll('.modal.onb').forEach(m => m.remove()); ONB = null;
    const declined = (() => { try { return localStorage.getItem('timelab.migrate.no.' + u.id) === String(guest && guest.created); } catch (e) { return false; } })();
    PENDING_GUEST = guest && hasProgress(guest) && !declined ? JSON.parse(JSON.stringify(guest)) : null;
    useStore(u.id);
    // в профиле пока нет имени, а при регистрации оно было введено — возьмём его
    if (!ST.profile.name && guest && guest.profile.name) ST.profile.name = guest.profile.name;
    // план, настроенный в гостевом onboarding, переносим в новый профиль (облачный план, если он есть, при слиянии новее)
    if (!cached && guest && guest.plan.set && !ST.plan.set) { ST.plan = JSON.parse(JSON.stringify(guest.plan)); applyPlan(); ST.plan.set = guest.plan.set; }
    if (!cached) { ST.onboarded = true; showLoading(true); setTimeout(() => { if (LOADING) { showLoading(false); toast('Облако пока не ответило — работаем с копией на устройстве, синхронизация повторится сама', 'warn'); } }, 12000); }
    go(V.name === 'session' || V.name === 'results' ? 'home' : V.name, V.arg, { noHash:true });
  } else if (STORE_KEY !== GUEST_KEY) {
    SES = null; useStore(null); render();
  } else refreshHeader();
});
function showMigrate(guest) {
  const acc = hasProgress(ST);
  const m = modal(`<div class="block-h"><h3>Перенести гостевой прогресс?</h3></div>
    <p class="lead">На этом устройстве есть прогресс гостя: ${guest.xp} XP · заданий: ${guest.totals.tasks} · занятий: ${guest.history.length}.</p>
    ${acc ? `<p>В аккаунте уже есть свой прогресс (${ST.xp} XP · заданий: ${ST.totals.tasks}). При объединении ничего не потеряется: этапы, достижения и история сложатся, по каждому правилу и глаголу останется более полный результат.</p>` : '<p>Он станет прогрессом твоего профиля и будет доступен на других устройствах.</p>'}
    <div class="row"><button class="btn acid" data-act="migrate" data-arg="yes">${acc ? 'Объединить' : 'Перенести'}</button><button class="btn ghost" data-act="migrate" data-arg="no">Не переносить</button></div>
    <p class="sub">Если не переносить, гостевой прогресс останется в этом браузере и будет виден после выхода из профиля.</p>`);
  m.classList.add('migrate'); m.dataset.guest = '1';
  m._guest = guest;
}

/* ---------- личный кабинет ---------- */
const PTABS = [['overview','Обзор'],['tenses','Мои времена'],['history','История'],['ach','Достижения'],['settings','Настройки']];
function firstTryRate() { const s = Object.values(ST.rules).reduce((a, r) => a + r.seen, 0), o = Object.values(ST.rules).reduce((a, r) => a + r.ok, 0); return s ? o / s : null; }
function vProfile(tab) {
  if (!PTABS.some(x => x[0] === tab)) tab = 'overview';
  const l = level();
  const head = `<section class="pf-head">
    <div class="pf-me">${avatarHTML(ST.profile.avatar, 'xl')}<div><div class="mono kicker">${Cloud.user ? 'ПРОФИЛЬ' : 'ГОСТЕВОЙ РЕЖИМ'}</div><h1 class="pf-name">${esc(displayName())}</h1>
      <p class="sub">${esc(levelLabel())} · цель: ${esc((GOALS[ST.plan.goal] || '').toLowerCase())}</p>
      ${Cloud.user ? `<p class="sub mono">${esc(Cloud.user.email || '')}</p>` : Cloud.configured ? '<p class="row"><button class="btn sm pri" data-act="auth" data-arg="up">Создать профиль</button><button class="btn sm ghost" data-act="auth" data-arg="in">Войти</button></p>' : ''}</div></div>
    <div class="pf-lv"><span class="mono lvl">LV.${pad2(l)} · ${LVL_NAMES[Math.min(l - 1, LVL_NAMES.length - 1)]}</span><b>${ST.xp} XP</b><span class="xpbar"><i style="width:${Math.round((ST.xp - lvlFloor(l)) / (lvlFloor(l + 1) - lvlFloor(l)) * 100)}%"></i></span></div></section>
    <div class="tabs pf-tabs" role="tablist">${PTABS.map(([k, n]) => `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-act="go" data-arg="profile|${k}">${n}</button>`).join('')}</div>`;
  return `<main class="wrap prof-v">${head}<div id="pf-body">${({ overview:pfOverview, tenses:pfTenses, history:pfHistory, ach:pfAch, settings:pfSettings })[tab]()}</div></main>`;
}
function pfOverview() {
  const rate = firstTryRate();
  const seen = RULES_LIST.filter(r => r.cat !== 'fx' && ST.rules[r.id] && ST.rules[r.id].seen >= 4);
  const strong = seen.filter(r => mastery(r.id) >= 0.8).sort((a, b) => mastery(b.id) - mastery(a.id)).slice(0, 5);
  const weak = seen.filter(r => mastery(r.id) < 0.6).sort((a, b) => mastery(a.id) - mastery(b.id)).slice(0, 5);
  const lv = learnedVerbs(), plan = plannedRules().slice(0, 5), due = dueRules();
  const vdue = Object.keys(ST.verbs).filter(k => ST.verbs[k].seen && ST.verbs[k].due && ST.verbs[k].due <= Date.now()).length;
  return `<section class="dash">
    <div class="panel"><div class="bignum"><b>${ST.totals.tasks}</b><span>выполнено заданий</span></div></div>
    <div class="panel"><div class="bignum"><b>${rate == null ? '—' : Math.round(rate * 100) + '%'}</b><span>верно с первой попытки</span></div></div>
    <div class="panel"><div class="bignum"><b>${ST.totals.sessions}</b><span>занятий и тестов</span></div></div>
    <div class="panel"><div class="bignum"><b>${ST.best}</b><span>лучшая серия</span></div></div>
    <div class="panel span2"><div class="panel-h"><h4>Сильные темы</h4><span class="mono sub">от 4 ответов и 80%</span></div>${strong.length ? `<ul class="rules">${strong.map(ruleRow).join('')}</ul>` : '<p class="empty">Появятся, когда правило будет стабильно получаться.</p>'}</div>
    <div class="panel span2"><div class="panel-h"><h4>Слабые темы</h4><span class="mono sub">ниже 60%</span></div>${weak.length ? `<ul class="rules">${weak.map(ruleRow).join('')}</ul><button class="btn sm" data-act="trainRule" data-arg="${weak.map(r => r.id).join(',')}">Тренировать слабые темы</button>` : '<p class="empty">Пока нет правил с систематическими ошибками.</p>'}</div>
    <div class="panel span2"><div class="panel-h"><h4>Ближайшие повторения</h4><span class="mono sub">1 · 3 · 7 · 14 · 30 дн.</span></div>
      ${due.length ? `<p><b>${due.length}</b> ${due.length === 1 ? 'правило ждёт' : 'правил ждут'} повторения сейчас. <button class="link" data-act="review">Повторить</button></p>` : ''}
      ${vdue ? `<p><b>${vdue}</b> глаг. пора повторить. <button class="link" data-act="go" data-arg="verbs|match">К глаголам</button></p>` : ''}
      ${plan.length ? `<ul class="plain">${plan.map(r => `<li><span>${r.name} <span class="sub">· ${TENSE[r.t].name}</span></span><span class="mono sub">${relDue(ST.rules[r.id].due)}</span></li>`).join('')}</ul>` : (!due.length ? '<p class="empty">Расписание появится после первых заданий.</p>' : '')}</div>
    <div class="panel span2"><div class="panel-h"><h4>Неправильные глаголы</h4><span class="mono sub">${lv.length} из ${VERB_DICT.length}</span></div>
      ${lv.length ? `<div class="vchips">${lv.slice(0, 40).map(id => `<button class="chipbtn mono" data-act="vcard" data-arg="${esc(id)}">${esc(id)}</button>`).join('')}</div>` : '<p class="empty">Выученным глагол считается после трёх удачных интервальных повторений или твоей отметки ✓ в словаре.</p>'}</div>
    <div class="panel full"><div class="panel-h"><h4>Последние занятия</h4><button class="link" data-act="go" data-arg="profile|history">вся история</button></div>
      ${ST.history.length ? `<table class="hist"><tbody>${ST.history.slice(-5).reverse().map(histRow).join('')}</tbody></table>` : '<p class="empty">Здесь появятся занятия и тесты.</p>'}</div>
    <div class="panel full"><div class="panel-h"><h4>Достижения</h4><button class="link" data-act="go" data-arg="profile|ach">${Object.keys(ST.ach).length}/${ACH.length}</button></div>
      <div class="ach">${ACH.filter(a => ST.ach[a.id]).slice(0, 8).map(a => `<span class="ach-i on"><b>${a.name}</b><small>${a.d}</small></span>`).join('') || '<p class="empty">Первое достижение — за первое занятие.</p>'}</div></div>
  </section>`;
}
function pfTenses() {
  return `<section class="tgrid">${ORDER.map(t => {
    const T = TENSE[t], on = ST.unlocked.includes(t), L = ST.labs[t] || { stages:{} }, rs = rulesOf(t).filter(r => r.cat !== 'fx');
    const ms = rs.map(r => ST.rules[r.id] && ST.rules[r.id].seen >= 4 ? mastery(r.id) : null).filter(x => x != null);
    const avg = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null, boss = (L.stages.boss && L.stages.boss.best) || 0;
    const by = { start:'стартовое', campaign:'по кампании', level:'по выбранному уровню', diag:'по диагностике', manual:'вручную' }[L.by] || 'по кампании';
    return `<div class="tcard ${on ? '' : 'off'} ${L.badge ? 'badge' : ''}"><div class="mono kicker">LAB ${pad2(T.n)}${t === ST.current ? ' · ИЗУЧАЕТСЯ' : ''}</div><b>${T.name}</b>
      <span class="sub">${on ? `открыто ${by}` : 'закрыто'}${L.badge ? ' · значок владения' : ''}</span>
      <span class="mono sub">этапы ${STAGES.filter(s => L.stages[s.id] && L.stages[s.id].passed).length}/8 · босс ${boss ? boss + '%' : '—'} · правила ${avg == null ? 'мало данных' : pct(avg)}</span>${bar(avg, avg >= 0.8 ? 'good' : avg >= 0.6 ? 'mid' : 'low')}
      <button class="btn sm ${on ? 'pri' : 'ghost'}" data-act="lab" data-arg="${t}">${on ? 'В лабораторию' : 'Посмотреть'}</button></div>`; }).join('')}</section>
    ${ORDER.filter(t => ST.unlocked.includes(t) || rulesOf(t).some(r => ST.rules[r.id])).map(t => `<section class="block"><div class="block-h"><h3>${TENSE[t].name}</h3><span class="mono sub">освоение по последним ответам</span></div><div class="tscroll"><table class="st-t"><thead><tr><th>Правило</th><th>Освоение</th><th>Попыток</th><th>Повторение</th></tr></thead><tbody>${rulesOf(t).map(r => { const s = ST.rules[r.id]; const m = mastery(r.id); return `<tr><td>${r.name}</td><td>${s && s.seen >= 4 ? pct(m) : s ? 'мало данных' : '—'} ${bar(m, m >= 0.8 ? 'good' : m >= 0.6 ? 'mid' : 'low')}</td><td class="mono">${s ? s.seen : 0}</td><td class="mono sub">${s && s.due ? relDue(s.due) : '—'}</td></tr>`; }).join('')}</tbody></table></div></section>`).join('')}`;
}
function pfHistory() {
  return `<section class="block"><div class="block-h"><h3>Занятия и тесты</h3><span class="mono sub">${ST.history.length}</span></div>${ST.history.length ? `<div class="tscroll"><table class="hist"><tbody>${ST.history.slice().reverse().map(histRow).join('')}</tbody></table></div>` : '<p class="empty">Пока пусто.</p>'}</section>
    <section class="block"><div class="block-h"><h3>История ошибок</h3><span class="mono sub">последние 30</span></div>${ST.errors.length ? `<div class="tscroll"><table class="st-t"><thead><tr><th>Когда</th><th>Правило</th><th>Ответ</th><th>Правильно</th></tr></thead><tbody>${ST.errors.slice(-30).reverse().map(e => `<tr><td class="mono sub">${fmtDT(e.d)}</td><td>${esc((RULES[e.rule] || {}).name || e.rule)}</td><td class="strike">${esc(e.user)}</td><td>${esc(e.correct)}</td></tr>`).join('')}</tbody></table></div><button class="btn sm" data-act="redoHist">Повторить правила из истории ошибок</button>` : '<p class="empty">Ошибок пока нет.</p>'}</section>
    <p class="sub">В журнале ответов: ${ST.attempts.length} последних попыток${Cloud.user ? ' · полная история хранится в облаке' : ''}.</p>`;
}
function pfAch() {
  return `<section class="block"><div class="ach">${ACH.map(a => `<span class="ach-i ${ST.ach[a.id] ? 'on' : ''}"><b>${a.name}</b><small>${a.d}</small>${ST.ach[a.id] ? `<small class="mono">${fmtDate(ST.ach[a.id])}</small>` : ''}</span>`).join('')}</div></section>`;
}
function pfSettings() {
  const s = ST.settings, P = ST.plan;
  const chk = (k, n, d, obj) => `<label class="set"><input type="checkbox" data-${obj || 'set'}="${k}" ${(obj === 'plan' ? P : s)[k] ? 'checked' : ''}><span><b>${n}</b><small>${d}</small></span></label>`;
  const sel = (id, opts, val, attr) => `<select class="dsel" ${attr} id="${id}">${opts.map(([k, n]) => `<option value="${esc(k)}" ${String(val) === String(k) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const voices = Speech.voices();
  const account = Cloud.user ? `
      <div class="fld-row"><label class="fld"><span class="lbl">Отображаемое имя</span><input type="text" id="pf-name" maxlength="40" value="${esc(ST.profile.name)}" placeholder="${esc(displayName())}"></label><button class="btn sm pri" data-act="saveName">Сохранить</button></div>
      <p class="sub">Вход: ${esc(Cloud.user.email || '')}</p>
      <div class="row"><button class="btn sm ghost" data-act="logout">Выйти из профиля</button><button class="btn sm ghost" data-act="auth" data-arg="reset">Сменить пароль</button></div>`
    : `<div class="fld-row"><label class="fld"><span class="lbl">Имя на этом устройстве</span><input type="text" id="pf-name" maxlength="40" value="${esc(ST.profile.name)}" placeholder="Гость"></label><button class="btn sm pri" data-act="saveName">Сохранить</button></div>
      ${Cloud.configured ? '<p class="row"><button class="btn sm pri" data-act="auth" data-arg="up">Создать профиль</button><button class="btn sm ghost" data-act="auth" data-arg="in">Войти</button></p><p class="sub">Профиль сохраняет прогресс в облаке: можно продолжить на другом устройстве.</p>' : '<p class="sub">Облачные профили не подключены к этой копии игры — прогресс хранится только в этом браузере. Сохраняй резервную копию через экспорт.</p>'}`;
  return `<div class="settings">
    <section class="sblock"><h3>Профиль</h3>${account}
      <span class="lbl">Аватар</span><div class="ava-pick" role="radiogroup" aria-label="Аватар">${AVATARS.map(a => `<button role="radio" aria-checked="${ST.profile.avatar === a[0]}" class="ava-opt ${ST.profile.avatar === a[0] ? 'on' : ''}" data-act="setAvatar" data-arg="${a[0]}">${avatarHTML(a[0])}</button>`).join('')}</div></section>
    <section class="sblock"><h3>Учебный план</h3>
      <div class="fgrid">
        <label class="fld"><span class="lbl">Выбранный уровень</span>${sel('pl-level', [['', 'не выбран'], ...LEVELS.map(l => [l, l])], P.levelSelf || '', 'data-pl="levelSelf"')}</label>
        <label class="fld"><span class="lbl">Цель</span>${sel('pl-goal', Object.entries(GOALS), P.goal, 'data-pl="goal"')}</label>
        <label class="fld"><span class="lbl">Длительность занятия</span>${sel('pl-len', Object.entries(LENS), P.len, 'data-pl="len"')}</label>
        <label class="fld"><span class="lbl">Занятий в неделю</span>${sel('pl-week', [['', 'без расписания'], ...[1, 2, 3, 4, 5, 6, 7].map(x => [x, String(x)])], P.perWeek || '', 'data-pl="perWeek"')}</label>
      </div>
      <p class="sub">${P.levelDiag ? `Диагностика от ${fmtDate(P.levelDiag.date)}: ориентировочно ${esc(P.levelDiag.level)}, рекомендованный старт — ${TENSE[P.levelDiag.rec].name}.` : 'Диагностика не проходилась.'} Выбранный уровень — твоя самооценка, он не считается результатом теста.</p>
      ${chk('reviewOld', 'Повторять прошлые темы', 'Примерно каждое четвёртое задание — из уже открытых ранее времён.', 'plan')}
      ${chk('skipKnown', 'Пропускать знакомые темы', 'Финальное испытание открыто сразу: знакомое время можно закрыть проверкой, без всех этапов.', 'plan')}
      <div class="fld-row"><label class="fld"><span class="lbl">Начать другую лабораторию</span>${sel('pl-lab', ORDER.map(t => [t, `${pad2(TENSE[t].n)} · ${TENSE[t].name}${ST.unlocked.includes(t) ? '' : ' (закрыто)'}`]), ST.current, '')}</label><button class="btn sm" data-act="startLab">Перейти</button></div>
      <div class="row"><button class="btn sm ghost" data-act="rebuild">Перестроить маршрут</button><button class="btn sm ghost" data-act="diag">Пройти диагностику снова</button><button class="btn sm ghost" data-act="planSetup">Пройти настройку заново</button></div>
      <p class="sub">Перестройка маршрута открывает лаборатории по уровню и меняет текущую — история, этапы и статистика сохраняются.</p></section>
    <section class="sblock"><h3>Озвучивание</h3>
      ${Speech.supported ? '' : '<p class="t-msg bad">Этот браузер не поддерживает синтез речи. Игра работает без звука; попробуй Chrome, Edge или Safari.</p>'}
      ${Speech.supported && !voices.length ? '<p class="sub">Английские голоса не найдены (или ещё загружаются). Если их нет в системе, браузер прочитает текст голосом по умолчанию.</p>' : ''}
      ${chk('voice', 'Кнопки озвучивания', 'Динамики у слов, примеров, диалогов и ответов.')}
      ${chk('voiceAuto', 'Автоматическая озвучка', 'Произносить правильный ответ после проверки и правильно собранные глаголы. Сами по себе экраны не озвучиваются.')}
      <div class="fgrid">
        <label class="fld"><span class="lbl">Произношение</span>${sel('vc-acc', [['en-GB','British English'],['en-US','American English']], s.accent, 'data-vc="accent"')}</label>
        <label class="fld"><span class="lbl">Голос</span>${sel('vc-name', [['', 'автоматически (Google UK English Female, если есть)'], ...voices.map(v => [v.name, `${v.name} · ${v.lang}`])], s.voiceName, 'data-vc="voiceName"')}</label>
      </div>
      <span class="lbl">Скорость</span><div class="seg" role="group" aria-label="Скорость">${[0.75, 1, 1.25].map(r => `<button class="${+s.rate === r ? 'on' : ''}" data-act="setRate" data-arg="${r}">${r}x</button>`).join('')}</div>
      <div class="row"><button class="btn sm ghost" data-act="say" data-arg="I usually drink coffee in the morning. Yesterday I went to an exhibition.">${SPK_ICON} Проверить голос</button><button class="btn sm ghost" data-act="sayAgain">Повторить последнее</button></div></section>
    <section class="sblock"><h3>Интерфейс</h3>
      ${chk('retry', 'Самостоятельные повторные попытки', 'После первой ошибки не показывать правильный ответ — дать попробовать ещё раз.')}
      ${chk('rm', 'Меньше анимации', 'Отключить переходы и движение.')}
      ${chk('gloss', 'Перевод слов по нажатию', 'Подчёркнутые слова показывают перевод.')}</section>
    <section class="sblock"><h3>Данные</h3><div class="data">
      <div><b>Экспорт</b><p class="sub">Весь личный прогресс в JSON: файл можно сохранить и загрузить в другом браузере.</p><div class="row"><button class="btn sm" data-act="exportFile">Скачать JSON</button><button class="btn sm ghost" data-act="copyexp">Скопировать</button></div><textarea id="exp" class="ans-in mono" rows="3" readonly>${esc(JSON.stringify(ST))}</textarea></div>
      <div><b>Импорт</b><p class="sub">Вставь экспорт и нажми «Загрузить». Текущий прогресс на этом устройстве заменится${Cloud.user ? ' и уйдёт в облако' : ''}.</p><textarea id="imp" class="ans-in mono" rows="3"></textarea><button class="btn sm" data-act="import">Загрузить</button></div>
      <div><b>Сброс прогресса</b><p class="sub">Удалит этапы, статистику, XP и историю${Cloud.user ? ' на устройстве и в облаке' : ' в этом браузере'}. Профиль и настройки останутся.</p><div id="reset-box"><button class="btn sm danger" data-act="reset1">Сбросить прогресс</button></div></div>
      ${Cloud.user ? `<div><b>Удалить аккаунт</b><p class="sub">Удалит профиль и все данные в облаке без возможности восстановления. Сначала можно скачать экспорт.</p><div id="del-box"><button class="btn sm danger" data-act="del1">Удалить аккаунт</button></div></div>` : ''}
    </div></section></div>`;
}
function mountProfile(tab) {
  if (tab !== 'settings') return;
  const box = document.getElementById('pf-body'); if (!box) return;
  box.querySelectorAll('[data-set]').forEach(x => x.addEventListener('change', () => { ST.settings[x.dataset.set] = x.checked; save(); applyVoiceSettings(); rerenderKeep(); }));
  box.querySelectorAll('[data-plan]').forEach(x => x.addEventListener('change', () => { ST.plan[x.dataset.plan] = x.checked; save(); toast('План обновлён'); }));
  box.querySelectorAll('[data-pl]').forEach(x => x.addEventListener('change', () => {
    const k = x.dataset.pl; let v = x.value;
    if (k === 'perWeek') v = v ? +v : null; if (k === 'levelSelf') v = v || null;
    ST.plan[k] = v; if (k === 'levelSelf' && v) ST.plan.method = 'level';
    save(); toast(k === 'levelSelf' ? 'Уровень сохранён. «Перестроить маршрут» откроет подходящие лаборатории.' : 'План обновлён');
  }));
  box.querySelectorAll('[data-vc]').forEach(x => x.addEventListener('change', () => { ST.settings[x.dataset.vc] = x.value; save(); applyVoiceSettings(); }));
}
function rerenderKeep() { const y = window.scrollY; render(); window.scrollTo(0, y); }
if (Speech.supported) try { speechSynthesis.addEventListener('voiceschanged', () => { if (V.name === 'profile' && V.arg === 'settings' && !document.activeElement.matches('select')) rerenderKeep(); }); } catch (e) {}

/* ---------- действия ---------- */
Object.assign(ACT, {
  auth(mode) { document.querySelectorAll('.modal.onb').forEach(m => m.remove()); showAuth(mode || 'in'); },
  async google() { try { await Cloud.signInGoogle(); } catch (e) { toast(authErr(e), 'warn'); } },
  syncNow() { if (Cloud.user) { Cloud.syncNow(); toast(Cloud.status === 'error' ? 'Повторяем сохранение…' : 'Синхронизация…'); } },
  async logout() {
    if (!Cloud.user) return;
    await Cloud.syncNow();
    if (Cloud.pending()) {
      const m = modal(`<div class="block-h"><h3>Есть несохранённые изменения</h3></div><p>Часть прогресса ещё не дошла до облака (нет сети?). Если выйти сейчас, эти изменения пропадут с устройства.</p>
        <div class="row"><button class="btn ghost" data-act="close">Остаться</button><button class="btn danger" data-act="logout2">Выйти всё равно</button></div>`); m.classList.add('confirm');
      return;
    }
    ACT.logout2();
  },
  async logout2() {
    document.querySelectorAll('.modal').forEach(m => m.remove());
    const uid = Cloud.user && Cloud.user.id;
    try { await Cloud.signOut(); } catch (e) { toast(authErr(e), 'warn'); return; }
    if (STORE_KEY !== GUEST_KEY) { SES = null; useStore(null); }
    if (uid) Cloud.forget(uid);
    toast('Выход выполнен. Личные данные профиля с этого устройства убраны.'); go('home');
  },
  migrate(a) {
    const m = document.querySelector('.modal.migrate'); const g = m && m._guest; if (m) m.remove();
    if (!g || !Cloud.user) return;
    if (a === 'yes') {
      const accHad = hasProgress(ST);
      Cloud.mergeStates(ST, upgrade(g), !accHad);
      ST.onboarded = true; save(); Cloud.schedule(200);
      try { localStorage.setItem(GUEST_KEY, JSON.stringify(Object.assign(defaultState(), { onboarded:true }))); } catch (e) {}
      toast('Гостевой прогресс перенесён в профиль', 'acid'); render();
    } else { try { localStorage.setItem('timelab.migrate.no.' + Cloud.user.id, String(g.created)); } catch (e) {} }
  },
  del1() { el('#del-box').innerHTML = `<p class="bad-t">Чтобы подтвердить, впиши слово УДАЛИТЬ.</p><input type="text" id="del-in" class="ans-in" autocomplete="off"><div class="row"><button class="btn sm danger" data-act="del2">Удалить навсегда</button><button class="btn sm ghost" data-act="go" data-arg="profile|settings">Отмена</button></div>`; },
  async del2() {
    if ((el('#del-in').value || '').trim().toUpperCase() !== 'УДАЛИТЬ') { toast('Впиши слово УДАЛИТЬ', 'warn'); return; }
    const uid = Cloud.user && Cloud.user.id;
    try { await Cloud.deleteAccount(); } catch (e) { toast(authErr(e), 'warn'); return; }
    if (STORE_KEY !== GUEST_KEY) { SES = null; useStore(null); }
    if (uid) Cloud.forget(uid);
    toast('Аккаунт и все его данные удалены'); go('home');
  },
  saveName() { const v = (el('#pf-name').value || '').trim().slice(0, 40); ST.profile.name = v; save(); toast('Имя сохранено'); rerenderKeep(); },
  setAvatar(id) { if (!AVATARS.some(a => a[0] === id)) return; ST.profile.avatar = id; save(); rerenderKeep(); },
  setRate(r) { ST.settings.rate = +r; save(); applyVoiceSettings(); rerenderKeep(); },
  exportFile() {
    const data = JSON.stringify(Object.assign({}, ST, { exportedAt:new Date().toISOString(), app:'TIME LAB' }), null, 2);
    try {
      const url = URL.createObjectURL(new Blob([data], { type:'application/json' })), a = document.createElement('a');
      a.href = url; a.download = `timelab-progress-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000); toast('Файл экспорта сохранён');
    } catch (e) { toast('Не удалось сохранить файл — используй «Скопировать»', 'warn'); }
  },
  planSetup() { document.querySelectorAll('.modal.onb').forEach(m => m.remove()); showOnboarding(); ONB.step = 2; ONB.setupOnly = true; onbDraw(); },
  rebuild() { applyPlan(); save(); toast(`Маршрут перестроен: ${TENSE[ST.current].name}. История сохранена.`, 'acid'); go('home'); },
  applyDiag() { if (!ST.plan.levelDiag) return; ST.plan.method = 'diag'; applyPlan(); save(); toast(`Старт: ${TENSE[ST.current].name}`, 'acid'); go('home'); },
  startLab() { const t = el('#pl-lab').value; if (!TENSE[t]) return; if (!ST.unlocked.includes(t)) { ACT.openLab(t); return; } ST.current = t; save(); go('lab', t); },
  trainRule(ids) { const list = String(ids || '').split(',').filter(id => RULES[id]); if (list.length) startSession(cfgRules(list, list.length === 1 ? 'Дополнительная тренировка · ' + RULES[list[0]].name : 'Тренировка слабых тем')); },
  onbNext() { onbStep(1); },
  onbBack() { onbStep(-1); },
  onbSkip() { if (ONB.step === 2 && !ONB.exp) ONB.exp = 'some'; if (ONB.step === 3 && !ONB.method) ONB.method = 'first'; onbStep(1); },
  onbSkipAll() { ONB.exp = null; ONB.method = null; finishOnb('skipall'); },
  onbExp(a) { ONB.exp = a; if (a === 'zero') ONB.method = null; onbDraw(); },
  onbMethod(a) { ONB.method = a; onbDraw(); },
  onbLevel(a) { ONB.level = a; onbDraw(); },
  onbGoal(a) { ONB.goal = a; onbDraw(); },
  onbLen(a) { ONB.len = a; onbDraw(); },
  onbWeek(a) { ONB.perWeek = +a || null; onbDraw(); },
  onbFinish(a) { finishOnb(a === 'diag' ? 'diag' : 'go'); }
});

/* ---------- запуск ---------- */
(function boot() {
  const h = location.hash || '';
  const authHash = /access_token=|refresh_token=|error_description=|error_code=/.test(h);
  let active = ''; try { active = localStorage.getItem(ACTIVE_KEY) || ''; } catch (e) {}
  useStore(Cloud.configured && active ? active : null);
  const r = authHash ? { name:'home' } : routeFromHash();
  V = { name:r.name, arg:r.arg };
  render();
  Cloud.init().then(() => {
    if (authHash) {
      const err = h.match(/error_description=([^&]+)/);
      if (err) toast(/expired|invalid/i.test(decodeURIComponent(err[1])) ? 'Ссылка из письма устарела или уже использована. Запроси новую.' : 'Не удалось подтвердить вход по ссылке.', 'warn');
      try { history.replaceState(null, '', location.pathname + location.search + '#/home'); } catch (e) {}
    }
  }).catch(e => console.warn('TIME LAB cloud init:', e));
})();

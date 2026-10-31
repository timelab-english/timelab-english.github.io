'use strict';
/* =========================================================
   TIME LAB · аккаунты и облачное сохранение (Supabase Auth + PostgreSQL)
   Клиент использует только публичный anon/publishable-ключ. Доступ к строкам
   ограничен политиками Row Level Security (supabase/migrations).
   Прогресс сначала сохраняется локально, затем отправляется в облако.
   Слияние построчное: прогресс (XP, этапы, попытки) объединяется по максимуму,
   настройки и план — по времени последнего изменения. Ничего не удаляется молча.
   ========================================================= */
const CFG = Object.assign({ supabaseUrl:'', supabaseAnonKey:'', googleAuth:false, siteUrl:'' }, window.TIMELAB_CONFIG || {});

const Cloud = (() => {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const configured = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  let sb = null, user = null, status = configured ? 'idle' : 'local', statusMsg = '';
  let timer = null, busy = false, again = false, lastPull = 0, retryN = 0, sdkError = '';
  const subs = { user:[], status:[] };

  /* ---------- утилиты ---------- */
  const iso = ms => ms ? new Date(ms).toISOString() : null;
  const ms = s => s ? (Date.parse(s) || 0) : 0;
  function stable(x) {
    if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  function hash(o) { const s = stable(o); let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + s.length; }
  const num = x => +x || 0;
  const maxObj = (a, b) => { const o = Object.assign({}, a); Object.keys(b || {}).forEach(k => { o[k] = Math.max(num(o[k]), num(b[k])); }); return o; };
  const addDelta = (r, l, b) => { const o = Object.assign({}, r); Object.keys(l || {}).forEach(k => { o[k] = num(r[k]) + Math.max(0, num(l[k]) - num((b || {})[k])); }); return o; };
  const metaKey = () => 'timelab.sync.' + user.id;
  function loadMeta() { try { return JSON.parse(localStorage.getItem(metaKey())) || { h:{} }; } catch (e) { return { h:{} }; } }
  function saveMeta(m) { try { localStorage.setItem(metaKey(), JSON.stringify(m)); } catch (e) {} }

  /* ---------- соответствие состояния игры и таблиц ----------
     Каждая таблица описана так: ids(S) → ключи, get(S, id) → фрагмент,
     put(S, id, f) → записать фрагмент в состояние, row/from — перевод в строку БД и обратно,
     merge(L, R, remoteNewer) — слияние при одновременном изменении. */
  const ME = 'me';
  const TABLES = {
    profiles:{
      pk:'id', ids:() => [ME],
      get:S => ({ name:S.profile.name || '', avatar:S.profile.avatar || 'a1', xp:num(S.xp), streak:num(S.streak), best:num(S.best),
        totals:{ tasks:num(S.totals.tasks), fixed:num(S.totals.fixed), sessions:num(S.totals.sessions) },
        flags:{ onboarded:!!S.onboarded, starterDone:!!S.starterDone, diagDone:!!S.diagDone } }),
      put:(S, id, f) => { S.profile.name = f.name; S.profile.avatar = f.avatar; S.xp = f.xp; S.streak = f.streak; S.best = f.best; Object.assign(S.totals, f.totals);
        S.onboarded = f.flags.onboarded; S.starterDone = f.flags.starterDone; S.diagDone = f.flags.diagDone; },
      row:(u, id, f) => ({ id:u, display_name:f.name.slice(0, 40), avatar:f.avatar, xp:f.xp, streak:f.streak, best_streak:f.best, totals:f.totals, flags:f.flags }),
      from:r => [ME, { name:r.display_name || '', avatar:r.avatar || 'a1', xp:num(r.xp), streak:num(r.streak), best:num(r.best_streak),
        totals:{ tasks:num((r.totals || {}).tasks), fixed:num((r.totals || {}).fixed), sessions:num((r.totals || {}).sessions) },
        flags:{ onboarded:!!(r.flags || {}).onboarded, starterDone:!!(r.flags || {}).starterDone, diagDone:!!(r.flags || {}).diagDone } }],
      // счётчики: если известна последняя синхронизированная версия (B), к облаку прибавляется локальный прирост — так прогресс двух устройств складывается
      merge:(L, R, rn, B) => ({ name:(rn ? R.name : L.name) || L.name || R.name, avatar:rn ? R.avatar : L.avatar,
        xp:B ? R.xp + Math.max(0, L.xp - B.xp) : Math.max(L.xp, R.xp), streak:rn ? R.streak : L.streak,
        best:Math.max(L.best, R.best), totals:B ? addDelta(R.totals, L.totals, B.totals) : maxObj(L.totals, R.totals),
        flags:{ onboarded:L.flags.onboarded || R.flags.onboarded, starterDone:L.flags.starterDone || R.flags.starterDone, diagDone:L.flags.diagDone || R.flags.diagDone } })
    },
    user_settings:{
      pk:'user_id', ids:() => [ME],
      get:S => JSON.parse(JSON.stringify(S.settings)),
      put:(S, id, f) => { S.settings = Object.assign(defaultState().settings, f); if (!f.voiceDef) { S.settings.voiceName = f.voiceName || DEFAULT_VOICE; S.settings.voiceDef = 1; } },
      row:(u, id, f) => ({ user_id:u, settings:f }),
      from:r => [ME, r.settings || {}],
      merge:(L, R, rn) => rn ? R : L
    },
    learning_plans:{
      pk:'user_id', ids:() => [ME],
      get:S => ({ plan:JSON.parse(JSON.stringify(S.plan)), current:S.current }),
      put:(S, id, f) => { S.plan = Object.assign(defaultState().plan, f.plan); if (TENSE[f.current]) S.current = f.current; },
      row:(u, id, f) => { const p = f.plan; return { user_id:u, experience:p.exp, method:p.method, level_self:p.levelSelf, level_diag:p.levelDiag, goal:p.goal, session_len:p.len,
        per_week:p.perWeek, review_old:!!p.reviewOld, skip_known:!!p.skipKnown, start_tense:p.start, current_tense:f.current, set_at:iso(p.set) }; },
      from:r => [ME, { plan:Object.assign(defaultState().plan, { exp:r.experience, method:r.method, levelSelf:r.level_self, levelDiag:r.level_diag, goal:r.goal || 'tenses',
        len:r.session_len || 'normal', perWeek:r.per_week, reviewOld:r.review_old !== false, skipKnown:!!r.skip_known, start:r.start_tense || 'ps', set:ms(r.set_at) }), current:r.current_tense || 'ps' }],
      merge:(L, R, rn) => rn ? R : L
    },
    tense_progress:{
      pk:'user_id,tense_id', ids:S => ORDER.filter(t => S.unlocked.includes(t) || S.labs[t]),
      get:(S, t) => { const L = S.labs[t] || {}; return { unlocked:S.unlocked.includes(t), by:L.by || (t === 'ps' ? 'start' : 'campaign'), badge:!!L.badge, stages:JSON.parse(JSON.stringify(L.stages || {})) }; },
      put:(S, t, f) => { const L = S.labs[t] || (S.labs[t] = { stages:{}, badge:false }); L.stages = f.stages; L.badge = f.badge; L.by = f.by;
        if (f.unlocked && !S.unlocked.includes(t)) S.unlocked.push(t); S.unlocked.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)); },
      row:(u, t, f) => ({ user_id:u, tense_id:t, unlocked:f.unlocked, opened_by:f.by, badge:f.badge, stages:f.stages }),
      from:r => [r.tense_id, { unlocked:!!r.unlocked, by:r.opened_by || 'campaign', badge:!!r.badge, stages:r.stages || {} }],
      merge:(L, R) => {
        const st = {};
        new Set([...Object.keys(L.stages), ...Object.keys(R.stages)]).forEach(k => { const a = L.stages[k] || {}, b = R.stages[k] || {};
          st[k] = { best:Math.max(num(a.best), num(b.best)), passed:!!(a.passed || b.passed), runs:Math.max(num(a.runs), num(b.runs)) }; });
        return { unlocked:L.unlocked || R.unlocked, by:L.by || R.by, badge:L.badge || R.badge, stages:st };
      }
    },
    skill_progress:{
      pk:'user_id,rule_id', ids:S => Object.keys(S.rules),
      get:(S, id) => { const r = S.rules[id]; return { seen:num(r.seen), ok:num(r.ok), hist:(r.hist || []).slice(-20), err3:num(r.err3), last:num(r.last) }; },
      put:(S, id, f) => { const r = S.rules[id] || (S.rules[id] = { seen:0, ok:0, hist:[], err3:0, step:0, due:0, last:0 }); Object.assign(r, f); },
      row:(u, id, f) => ({ user_id:u, rule_id:id, seen:f.seen, correct:f.ok, hist:f.hist, err3:f.err3, last_at:iso(f.last) }),
      from:r => [r.rule_id, { seen:num(r.seen), ok:num(r.correct), hist:Array.isArray(r.hist) ? r.hist : [], err3:num(r.err3), last:ms(r.last_at) }],
      merge:(L, R, rn) => (R.seen > L.seen || (R.seen === L.seen && rn)) ? R : L
    },
    review_schedule:{
      pk:'user_id,item_type,item_id',
      ids:S => [...Object.keys(S.rules).map(k => 'rule:' + k), ...Object.keys(S.verbs).map(k => 'verb:' + k)],
      get:(S, k) => { const [ty, id] = split(k); const o = ty === 'rule' ? S.rules[id] : S.verbs[id]; return { step:num(o.step), due:num(o.due) }; },
      put:(S, k, f) => { const [ty, id] = split(k);
        const o = ty === 'rule' ? (S.rules[id] || (S.rules[id] = { seen:0, ok:0, hist:[], err3:0, step:0, due:0, last:0 })) : (S.verbs[id] || (S.verbs[id] = { step:0, due:0, seen:0, ok:0 }));
        o.step = f.step; o.due = f.due; },
      row:(u, k, f) => { const [ty, id] = split(k); return { user_id:u, item_type:ty, item_id:id, step:f.step, due_at:iso(f.due) }; },
      from:r => [r.item_type + ':' + r.item_id, { step:num(r.step), due:ms(r.due_at) }],
      // более позднее расписание отражает более свежую тренировку
      merge:(L, R) => (R.due > L.due ? R : L)
    },
    irregular_verb_progress:{
      pk:'user_id,verb', ids:S => [...new Set([...Object.keys(S.verbs), ...S.verbsActive])],
      get:(S, id) => { const v = S.verbs[id] || {}; return { seen:num(v.seen), ok:num(v.ok), fav:!!v.fav, mark:!!v.mark, study:S.verbsActive.includes(id) }; },
      put:(S, id, f) => { const v = S.verbs[id] || (S.verbs[id] = { step:0, due:0, seen:0, ok:0 }); v.seen = f.seen; v.ok = f.ok; v.fav = f.fav; v.mark = f.mark;
        const on = S.verbsActive.includes(id); if (f.study && !on) S.verbsActive.push(id); if (!f.study && on) S.verbsActive = S.verbsActive.filter(x => x !== id); },
      row:(u, id, f) => ({ user_id:u, verb:id, seen:f.seen, correct:f.ok, favorite:f.fav, learned_mark:f.mark, in_study:f.study }),
      from:r => [r.verb, { seen:num(r.seen), ok:num(r.correct), fav:!!r.favorite, mark:!!r.learned_mark, study:!!r.in_study }],
      merge:(L, R, rn) => { const P = R.seen > L.seen ? R : L, F = rn ? R : L; return { seen:P.seen, ok:P.ok, fav:F.fav, mark:F.mark, study:F.study }; }
    },
    achievements:{
      pk:'user_id,achievement_id', ids:S => Object.keys(S.ach),
      get:(S, id) => ({ at:num(S.ach[id]) }),
      put:(S, id, f) => { S.ach[id] = f.at; },
      row:(u, id, f) => ({ user_id:u, achievement_id:id, unlocked_at:iso(f.at) }),
      from:r => [r.achievement_id, { at:ms(r.unlocked_at) }],
      merge:(L, R) => ({ at:Math.min(L.at || R.at, R.at || L.at) })
    }
  };
  function split(k) { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; }

  function collect(S) {
    const out = {};
    for (const [tb, T] of Object.entries(TABLES)) for (const id of T.ids(S)) out[tb + '|' + id] = T.get(S, id);
    return out;
  }
  // Слить состояние B (например, гостевое) в состояние A. preferB — чьи настройки брать при конфликте.
  function mergeStates(A, B, preferB) {
    const a = collect(A), b = collect(B);
    for (const [k, fb] of Object.entries(b)) {
      const [tb, id] = k.split('|'), T = TABLES[tb], fa = a[k];
      T.put(A, id, fa === undefined ? fb : T.merge(fa, fb, preferB, tb === 'profiles' ? { xp:0, totals:{} } : undefined));
    }
    const seen = new Set(A.attempts.map(x => x.id));
    B.attempts.forEach(x => { if (!seen.has(x.id)) A.attempts.push(Object.assign({}, x, { s:0 })); });
    A.attempts.sort((x, y) => x.d - y.d); if (A.attempts.length > 400) A.attempts = A.attempts.slice(-400);
    const hs = new Set(A.history.map(x => x.id));
    B.history.forEach(x => { if (!hs.has(x.id)) A.history.push(Object.assign({}, x, { s:0 })); });
    A.history.sort((x, y) => x.d - y.d); if (A.history.length > 80) A.history = A.history.slice(-80);
    const es = new Set(A.errors.map(x => x.id || x.d + x.rule));
    B.errors.forEach(x => { if (!es.has(x.id || x.d + x.rule)) A.errors.push(x); });
    A.errors.sort((x, y) => x.d - y.d); if (A.errors.length > 150) A.errors = A.errors.slice(-150);
    return A;
  }

  /* ---------- статус ---------- */
  function setStatus(s, msg) { status = s; statusMsg = msg || ''; subs.status.forEach(f => { try { f(s, statusMsg); } catch (e) {} }); }

  /* ---------- загрузка SDK ---------- */
  function loadSDK() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = SDK_URL; s.async = true; s.crossOrigin = 'anonymous';
      const to = setTimeout(() => rej(new Error('timeout')), 15000);
      s.onload = () => { clearTimeout(to); window.supabase && window.supabase.createClient ? res() : rej(new Error('sdk')); };
      s.onerror = () => { clearTimeout(to); rej(new Error('network')); };
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (!configured) return;
    try { await loadSDK(); }
    catch (e) { sdkError = 'Не удалось загрузить модуль входа. Проверь подключение к интернету.'; setStatus('offline', sdkError); return; }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:'timelab.auth', flowType:'implicit' }
    });
    sb.auth.onAuthStateChange((event, session) => {
      // вызовы Supabase внутри обработчика откладываем — так рекомендует документация supabase-js
      setTimeout(() => onAuth(event, session), 0);
    });
    const { data } = await sb.auth.getSession();
    if (!data.session) onAuth('NO_SESSION', null);
  }
  let curId;
  const emit = (u, ev) => subs.user.forEach(f => { try { f(u, ev); } catch (e) { console.error(e); } });
  function onAuth(event, session) {
    const u = session ? session.user : null, id = u ? u.id : null;
    user = u;
    if (event === 'PASSWORD_RECOVERY') emit(u, 'PASSWORD_RECOVERY');
    if (id === curId) return;
    curId = id;
    emit(u, event);
    if (u) schedule(50, true); else setStatus('local');
  }

  /* ---------- синхронизация ---------- */
  function schedule(delay, pull) {
    if (!user || !sb) return;
    if (pull) lastPull = 0;
    clearTimeout(timer); timer = setTimeout(syncNow, delay == null ? 2000 : delay);
  }
  async function fetchAll() {
    const uid = user.id, res = {};
    await Promise.all(Object.entries(TABLES).map(async ([tb, T]) => {
      const q = sb.from(tb).select('*').eq(T.pk === 'id' ? 'id' : 'user_id', uid);
      const { data, error } = await q; if (error) throw error; res[tb] = data || [];
    }));
    const [a, s] = await Promise.all([
      sb.from('exercise_attempts').select('client_id,tense_id,rule_id,mechanic,session_kind,prompt,user_answer,correct_answer,is_correct,created_at').eq('user_id', uid).order('created_at', { ascending:false }).limit(300),
      sb.from('study_sessions').select('client_id,title,kind,tense_id,correct,total,rules,created_at').eq('user_id', uid).order('created_at', { ascending:false }).limit(80)
    ]);
    if (a.error) throw a.error; if (s.error) throw s.error;
    res.attempts = a.data || []; res.sessions = s.data || [];
    return res;
  }
  async function pullMerge() {
    const remote = await fetchAll(), meta = loadMeta(), local = collect(ST);
    const rawStamp = ST.updated || 0;
    for (const [tb, T] of Object.entries(TABLES)) {
      for (const row of remote[tb]) {
        const [id, R] = T.from(row), k = tb + '|' + id, L = local[k], hR = hash(R), H = meta.h[k];
        if (L === undefined) { T.put(ST, id, R); meta.h[k] = hR; continue; }
        const hL = hash(L);
        if (hL !== hR) {
          const lc = hL !== H, rc = hR !== H;
          if (!lc && rc) T.put(ST, id, R);
          else if (lc && rc) T.put(ST, id, T.merge(L, R, ms(row.updated_at) > rawStamp, (meta.v || {})[k]));
        }
        meta.h[k] = hR;
        if (tb === 'profiles') (meta.v = meta.v || {})[k] = R;
      }
    }
    // попытки и занятия: объединение по идентификатору
    const have = new Set(ST.attempts.map(x => x.id));
    for (const r of remote.attempts) if (!have.has(r.client_id)) {
      const x = { id:r.client_id, d:ms(r.created_at), t:r.tense_id, rule:r.rule_id, mech:r.mechanic, kind:r.session_kind, q:r.prompt, user:r.user_answer, correct:r.correct_answer, ok:!!r.is_correct, s:1 };
      ST.attempts.push(x);
      if (!x.ok && !ST.errors.some(e => e.id === x.id)) ST.errors.push({ id:x.id, d:x.d, rule:x.rule, q:x.q, user:x.user, correct:x.correct });
    }
    ST.attempts.sort((x, y) => x.d - y.d); if (ST.attempts.length > 400) ST.attempts = ST.attempts.slice(-400);
    ST.errors.sort((x, y) => x.d - y.d); if (ST.errors.length > 150) ST.errors = ST.errors.slice(-150);
    const hs = new Set(ST.history.map(x => x.id));
    for (const r of remote.sessions) if (!hs.has(r.client_id)) ST.history.push({ id:r.client_id, d:ms(r.created_at), title:r.title, kind:r.kind, t:r.tense_id, ok:r.correct, total:r.total, rules:r.rules || {}, s:1 });
    ST.history.sort((x, y) => x.d - y.d); if (ST.history.length > 80) ST.history = ST.history.slice(-80);
    meta.pulled = Date.now(); saveMeta(meta);
    lastPull = Date.now();
    persistLocal();
    return meta;
  }
  async function push(meta) {
    meta = meta || loadMeta();
    const local = collect(ST), by = {};
    for (const [k, f] of Object.entries(local)) { const h = hash(f); if (meta.h[k] !== h) { const [tb, id] = k.split('|'); (by[tb] = by[tb] || []).push({ k, h, row:TABLES[tb].row(user.id, id, f) }); } }
    for (const [tb, items] of Object.entries(by)) {
      for (let i = 0; i < items.length; i += 200) {
        const part = items.slice(i, i + 200);
        const { error } = await sb.from(tb).upsert(part.map(x => x.row), { onConflict:TABLES[tb].pk });
        if (error) throw error;
        part.forEach(x => { meta.h[x.k] = x.h; if (tb === 'profiles') (meta.v = meta.v || {})[x.k] = local[x.k]; });
        saveMeta(meta);
      }
    }
    // журнал ответов и занятий — только добавление
    const ua = ST.attempts.filter(x => !x.s).slice(0, 300);
    if (ua.length) {
      const rows = ua.map(x => ({ user_id:user.id, client_id:x.id, tense_id:x.t || null, rule_id:x.rule || null, mechanic:x.mech || null, session_kind:x.kind || null,
        prompt:(x.q || '').slice(0, 500), user_answer:String(x.user || '').slice(0, 500), correct_answer:String(x.correct || '').slice(0, 500), is_correct:!!x.ok, created_at:iso(x.d) }));
      const { error } = await sb.from('exercise_attempts').upsert(rows, { onConflict:'user_id,client_id', ignoreDuplicates:true });
      if (error) throw error;
      ua.forEach(x => { x.s = 1; });
    }
    const us = ST.history.filter(x => !x.s && x.id);
    if (us.length) {
      const rows = us.map(x => ({ user_id:user.id, client_id:x.id, title:String(x.title || '').slice(0, 160), kind:x.kind || null, tense_id:x.t || null, correct:num(x.ok), total:num(x.total), rules:x.rules || {}, created_at:iso(x.d) }));
      const { error } = await sb.from('study_sessions').upsert(rows, { onConflict:'user_id,client_id', ignoreDuplicates:true });
      if (error) throw error;
      us.forEach(x => { x.s = 1; });
    }
    if (ua.length || us.length) persistLocal();
  }
  function persistLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify(ST)); } catch (e) {} }
  async function syncNow() {
    if (!user || !sb) return;
    if (busy) { again = true; return; }
    if (navigator.onLine === false) { setStatus('offline'); return; }
    busy = true; setStatus('syncing');
    const uid = user.id;
    try {
      let meta = null;
      if (Date.now() - lastPull > 60000) { meta = await pullMerge(); emit(user, 'PULLED'); }
      if (!user || user.id !== uid) throw new Error('user changed');
      await push(meta);
      retryN = 0; setStatus('saved');
    } catch (e) {
      console.warn('TIME LAB sync:', e && (e.message || e));
      setStatus(navigator.onLine === false ? 'offline' : 'error');
      retryN++; clearTimeout(timer); timer = setTimeout(syncNow, Math.min(60000, 4000 * retryN));
    }
    busy = false;
    if (again) { again = false; schedule(800); }
  }
  const pending = () => {
    if (!user) return false;
    const meta = loadMeta(), local = collect(ST);
    return Object.entries(local).some(([k, f]) => meta.h[k] !== hash(f)) || ST.attempts.some(x => !x.s) || ST.history.some(x => !x.s);
  };

  window.addEventListener('online', () => schedule(300));
  window.addEventListener('offline', () => { if (user) setStatus('offline'); });
  document.addEventListener('visibilitychange', () => {
    if (!user) return;
    if (document.visibilityState === 'hidden') syncNow();
    else if (Date.now() - lastPull > 30000) schedule(200, true);
  });
  setInterval(() => { if (user && status !== 'syncing' && pending()) syncNow(); }, 45000);

  /* ---------- авторизация ---------- */
  const site = () => CFG.siteUrl || (location.origin + location.pathname);
  const need = () => { if (!sb) throw new Error(sdkError || 'Облачные профили не настроены'); };
  const api = {
    get configured() { return configured; },
    get ready() { return !!sb; },
    get user() { return user; },
    get status() { return status; },
    get statusMsg() { return statusMsg; },
    get google() { return configured && !!CFG.googleAuth; },
    init, schedule, syncNow, pending, mergeStates, collect, hash,
    onUser(f) { subs.user.push(f); }, onStatus(f) { subs.status.push(f); },
    async signUp(email, password, name) {
      need();
      const { data, error } = await sb.auth.signUp({ email, password, options:{ emailRedirectTo:site(), data:{ display_name:name || '' } } });
      if (error) throw error; return { needConfirm:!data.session, user:data.user };
    },
    async signIn(email, password) { need(); const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; },
    async signInGoogle() { need(); const { error } = await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:site() } }); if (error) throw error; },
    async resetPassword(email) { need(); const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo:site() }); if (error) throw error; },
    async updatePassword(password) { need(); const { error } = await sb.auth.updateUser({ password }); if (error) throw error; },
    async signOut() { if (sb) { clearTimeout(timer); const { error } = await sb.auth.signOut({ scope:'local' }); if (error) throw error; } },
    async resetProgress() {
      need(); if (!user) return;
      const tabs = ['tense_progress','skill_progress','review_schedule','irregular_verb_progress','achievements','exercise_attempts','study_sessions'];
      for (const t of tabs) { const { error } = await sb.from(t).delete().eq('user_id', user.id); if (error) throw error; }
      saveMeta({ h:{} }); lastPull = Date.now(); await push();
    },
    async deleteAccount() {
      need(); if (!user) return;
      const { error } = await sb.rpc('delete_my_account'); if (error) throw error;
      try { localStorage.removeItem(metaKey()); } catch (e) {}
      await sb.auth.signOut({ scope:'local' }).catch(() => {});
    },
    forget(uid) { try { localStorage.removeItem('timelab.sync.' + uid); localStorage.removeItem('timelab.u.' + uid); } catch (e) {} }
  };
  return api;
})();

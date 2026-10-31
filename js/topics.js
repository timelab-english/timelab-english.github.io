'use strict';
/* =========================================================
   TIME LAB · дополнительные темы
   1. Passive Voice — бонус-урок внутри 7 лабораторий времён (правила `${t}_pass`, флаг x:'pass').
   2. Спецлаборатории вне кампании: Modal verbs и Will vs going to.
      Они устроены как «времена»: те же 8 этапов, босс, статистика и повторение.
   Задания строятся из «случаев»: правильное предложение + неверные варианты с причиной.
   ========================================================= */

/* ---------- спецлаборатории ---------- */
const SPECIALS = [
  { id:'modal', n:13, special:true, name:'Modal verbs', ru:'Модальные глаголы', tl:'habit',
    meaning:'умение, возможность, обязанность, совет и разрешение',
    markers:["can / can't", 'could', "must / mustn't", "have to / don't have to", "should / shouldn't", 'may / might'],
    f:{ pos:'S + can / must / should / might + V1', neg:"S + can't / mustn't / shouldn't / might not + V1", q:'Can / Must / Should + S + V1?' },
    ex:{ pos:['I can swim.','You should sleep more.'], neg:["She can't drive.","You mustn't take photos here."], q:['Can you help me?','Should I call the client?'], wh:'What should I do?' },
    why:'Модальный глагол показывает отношение к действию: могу, должен, стоит, возможно. Сам он не меняется: у него нет -s, после него нет to, в вопросах и отрицаниях не нужны do/does. После модального глагола всегда идёт V1.',
    detail:[
      "can / can't — умение и возможность сейчас: I can swim. Could — умение в прошлом: I could read when I was five.",
      "must — сильная необходимость или правило, часто по мнению говорящего: I must finish it today. mustn't — запрет: You mustn't smoke here.",
      "have to — необходимость из-за обстоятельств или правил: She has to wear a uniform. don't have to — нет необходимости («не обязательно»): You don't have to come.",
      "should / shouldn't — совет: You should sleep more. You shouldn't drink so much coffee.",
      'may / might — возможность («может быть»): It might rain. May I…? — вежливая просьба разрешения.',
      "Форма: после модального — V1 без to (can swim, не can to swim); модальный не меняется по лицам (she can, не she cans); вопрос и отрицание без do/does (Can she…? She can't…). Исключение — have to: Does she have to…? She doesn't have to…"
    ] },
  { id:'wg', n:14, special:true, name:'Will vs going to', ru:'Будущее: will или going to', tl:'fut',
    meaning:'решение в момент речи, обещание и мнение (will) или план и прогноз по признакам (going to)',
    markers:['I think…','probably',"I'm sure",'Look!','уже решено','tomorrow','next week'],
    f:{ pos:'S + will + V1 · S + am/is/are + going to + V1', neg:"S + won't + V1 · S + am not / isn't / aren't + going to + V1", q:'Will + S + V1? · Am/Is/Are + S + going to + V1?' },
    ex:{ pos:["I'll help you!",'We are going to visit Seoul in May.'], neg:["I won't tell anyone.","She isn't going to buy a new laptop."], q:['Will you come to the party?','Are you going to study tonight?'], wh:'What are you going to do this weekend?' },
    why:'Оба варианта говорят о будущем, но с разной «историей»: will — решение или мнение появляется в момент речи, going to — план или вывод уже был до начала разговора.',
    detail:[
      "will — решение, принятое в момент речи: The phone is ringing. — I'll answer it!",
      "will — обещание, предложение помощи: I'll help you. I won't tell anyone.",
      "will — прогноз-мнение, часто с I think, probably, I'm sure: I think you'll like this film.",
      "going to — план или намерение, решение принято заранее: We're going to visit Seoul in May (билеты уже куплены).",
      "going to — прогноз по признакам «здесь и сейчас»: Look at the clouds! It's going to rain.",
      "Форма: will + V1 (без to, без -s). am/is/are + going to + V1: be обязателен (I'm going to, не I going to)."
    ] }
];
SPECIALS.forEach(T => { TENSE[T.id] = T; });
const SPECIAL_IDS = SPECIALS.map(T => T.id);
const isSpecial = t => !!(TENSE[t] && TENSE[t].special);

/* ---------- построение заданий из «случаев» ----------
   Случай: { ok:'предложение', f, bad:[[текст, причина]], ctx?:'ситуация по-русски', gap?:[a, b], label? } */
const tokOf = s => String(s).replace(/[.?!]+\s*$/, '').trim().split(/\s+/);
const sameTok = (a, b) => a.toLowerCase() === b.toLowerCase();
function spanOf(okT, badsT) {
  let a = Infinity, b = Infinity;
  for (const t of badsT) {
    let p = 0; while (p < okT.length && p < t.length && sameTok(okT[p], t[p])) p++;
    let s = 0; while (s < okT.length - p && s < t.length - p && sameTok(okT[okT.length - 1 - s], t[t.length - 1 - s])) s++;
    a = Math.min(a, p); b = Math.min(b, s);
  }
  if (!isFinite(a) || a + b >= okT.length) return null;
  if (badsT.some(t => a + b >= t.length)) return null;
  if (okT.length - a - b > 4) return null;
  return { a, b };
}
const midOf = (toks, sp) => toks.slice(sp.a, toks.length - sp.b).join(' ');
function gapHTML(okT, sp, f, label) {
  const pre = okT.slice(0, sp.a), post = okT.slice(okT.length - sp.b);
  const words = [...pre.map((w, i) => glossText(i === 0 ? cap(w) : w)), `<span class="gap ${label ? 'gap-in' : ''}">${label ? esc(label) : '&nbsp;'}</span>`, ...post.map(w => glossText(w))];
  return words.join(' ') + (isQ(f) ? '?' : '.');
}
const ctxHTML = c => c ? `<span class="ctx">${esc(c)}</span>` : '';
function caseOf(C) {
  const okT = tokOf(C.ok), f = C.f || (/\?\s*$/.test(C.ok) ? 'q' : 'pos');
  const ok = toText(okT, f);
  const bads = (C.bad || []).map(([text, reason]) => { const t = tokOf(text); return { toks:t, text:toText(t, f), reason }; }).filter(b => canon(b.text) !== canon(ok));
  return { okT, f, ok, bads, ctx:C.ctx || '', gap:C.gap, label:C.label, rule:C.r };
}
function topicTask(rule, type, extra) {
  const t = base(rule, type, extra);
  t.chip = rule.x === 'pass' ? 'Passive · ' + TENSE[rule.t].name : TENSE[rule.t].name;
  if (!t.hint) t.hint = `${rule.name}: ${rule.formula}`;
  return t;
}
function caseTask(rule, mech, C, diff) {
  if (!C) return null;
  const K = caseOf(C);
  switch (mech) {
    case 'choice': case 'sense': case 'fchoice': {
      if (!K.bads.length) return null;
      const ms = shuffle(K.bads).slice(0, diff <= 1 ? 1 : 3);
      const sp = K.ctx && mech !== 'choice' ? null : spanOf(K.okT, ms.map(m => m.toks));
      const lab = (toks, full) => sp ? (sp.a === 0 ? cap(midOf(toks, sp)) : midOf(toks, sp)) : full;
      let opts = [{ full:K.ok, label:lab(K.okT, K.ok), reason:'', ok:1 }, ...ms.map(m => ({ full:m.text, label:lab(m.toks, m.text), reason:m.reason }))];
      const seen = new Set(); opts = opts.filter(o => !seen.has(canon(o.label)) && seen.add(canon(o.label)));
      if (opts.length < 2) return null;
      opts = shuffle(opts);
      const formula = mech === 'fchoice';
      return topicTask(rule, 'choice', { diff:diff || 2, f:K.f, mono:formula,
        instr: formula ? `Выбери верную формулу: ${K.ctx}` : K.ctx ? (C.ask || 'Как правильно сказать в этой ситуации?') : sp ? 'Выбери правильную форму' : 'Выбери правильное предложение',
        html: formula ? '' : (ctxHTML(K.ctx) + (sp ? gapHTML(K.okT, sp, K.f) : '')),
        labels:opts.map(o => o.label), fulls:opts.map(o => o.full), reasons:opts.map(o => o.reason), ans:opts.findIndex(o => o.ok), correct:K.ok, formula });
    }
    case 'tf': {
      const wrong = K.bads.length && Math.random() < 0.55 ? pick(K.bads) : null;
      const shown = wrong ? wrong.text : K.ok;
      return topicTask(rule, 'tf', { diff:1, f:K.f, instr: K.ctx ? 'Подходит ли фраза к ситуации и правильна ли она?' : 'Верно или неверно?',
        html:ctxHTML(K.ctx) + glossText(shown), shown, isTrue:!wrong, reason:wrong ? wrong.reason : '', correct:K.ok });
    }
    case 'fix': {
      const ms = K.bads.filter(m => {
        if (m.toks.length === K.okT.length) return m.toks.filter((w, i) => !sameTok(w, K.okT[i])).length === 1;
        if (m.toks.length === K.okT.length + 1) { for (let i = 0; i < m.toks.length; i++) if (m.toks.filter((x, j) => j !== i).join(' ').toLowerCase() === K.okT.join(' ').toLowerCase()) { m.del = i; return true; } }
        return false;
      });
      if (!ms.length) return null;
      const m = pick(ms), errIdx = m.del != null ? m.del : m.toks.findIndex((w, i) => !sameTok(w, K.okT[i]));
      return topicTask(rule, 'fix', { diff:3, f:K.f, instr:(K.ctx ? `Ситуация: ${K.ctx} ` : '') + 'Найди ошибку: нажми на неверное слово и исправь его',
        toks:m.toks, errIdx, op:m.del != null ? 'del' : 'rep', accept:acceptSet([K.ok]), correct:K.ok, wrongText:m.text, reason:m.reason });
    }
    case 'build': case 'fbuild': {
      const formula = mech === 'fbuild';
      const ct = formula ? C.ok.replace(/\?\s*$/, '').split(' + ') : K.okT;
      const cards = ct.map(txt => ({ id:uid(), txt }));
      let distract = null;
      if (formula) { const b = K.bads.length ? pick(K.bads) : null; const bt = b ? String(b.text).replace(/[.?]\s*$/, '').split(' + ').find(x => !ct.includes(x)) : null; if (bt) { distract = { txt:bt, reason:b.reason }; cards.push({ id:uid(), txt:bt, extra:1 }); } }
      else for (const m of shuffle(K.bads)) {
        const sp = spanOf(K.okT, [m.toks]); if (!sp) continue;
        const extra = m.toks.slice(sp.a, m.toks.length - sp.b).find(w => !K.okT.some(o => sameTok(o, w)));
        if (extra) { distract = { txt:extra, reason:m.reason }; cards.push({ id:uid(), txt:extra, extra:1 }); break; }
      }
      let sh = shuffle(cards); if (sh.map(c => c.txt).join(' ') === ct.join(' ')) sh = shuffle(cards);
      return topicTask(rule, 'build', { diff:formula ? 2 : 3, f:K.f, formula,
        instr: formula ? `Собери формулу по памяти: ${K.ctx}` : (K.ctx ? `Ситуация: ${K.ctx} Собери фразу из карточек.` : isQ(K.f) ? 'Собери вопрос из карточек' : K.f === 'neg' ? 'Собери отрицательное предложение' : 'Собери предложение из карточек'),
        cards:sh, accept:acceptSet([formula ? ct.join(' ') + (isQ(K.f) ? '?' : '') : K.ok]), correct:formula ? C.ok : K.ok, distract, ctoks:ct });
    }
    case 'input': {
      if (!K.gap) return null;
      const [a, b] = K.gap, pre = K.okT.slice(0, a), post = K.okT.slice(b), ans = K.okT.slice(a, b).join(' ');
      const sp = { a, b:K.okT.length - b }, wrongMap = {};
      K.bads.forEach(m => { const s2 = spanOf(K.okT, [m.toks]); if (s2 && s2.a >= a && s2.b >= sp.b) wrongMap[canon(m.toks.slice(a, m.toks.length - sp.b).join(' '))] = m.reason; });
      delete wrongMap[canon(ans)];
      return topicTask(rule, 'input', { diff:3, f:K.f, instr:'Впиши пропущенную форму', html:ctxHTML(K.ctx) + gapHTML(K.okT, sp, K.f, K.label),
        accept:acceptSet([ans]), correct:K.ok, correctPart:ans, wrongMap, placeholder:'пропущенные слова', pre, post });
    }
  }
  return null;
}
function multiTask(rule, mk) {
  const k = 1 + rnd(3), items = [];
  for (let i = 0; i < 4; i++) {
    const K = caseOf(mk()); if (!K) return null;
    if (i >= k && K.bads.length) { const m = pick(K.bads); items.push({ text:m.text, ok:false, reason:m.reason, fix:K.ok }); }
    else items.push({ text:K.ok, ok:true });
  }
  if (new Set(items.map(x => x.text)).size < 4 || !items.some(x => x.ok)) return null;
  return topicTask(rule, 'multi', { diff:3, f:'pos', instr:'Отметь все правильные предложения (их может быть несколько)', items:shuffle(items) });
}
// общий генератор для правил с шаблонами (rule.make(f)) или банком ситуаций (rule.bank)
function topicGen(rule, spec, diff) {
  const [m, f] = spec;
  if (m === 'translate') return genTranslate(rule);
  const one = () => rule.bank ? pick(rule.bank) : rule.make(f === 'ctx' ? 'pos' : f);
  if (m === 'multi') { for (let i = 0; i < 6; i++) { const t = multiTask(rule, one); if (t) return t; } return null; }
  for (let i = 0; i < 8; i++) { const t = caseTask(rule, m, one(), diff); if (t) return t; }
  return null;
}

/* ---------- Passive Voice ---------- */
const PASS_T = ['ps','pc','past','pastc','pp','pastp','fs'];
const PASS_ALL = PASS_T;
const PFRAMES = [
  { o:['the poster','the posters'], v:'print', ts:PASS_ALL },
  { o:['the website'], v:'update', ts:PASS_ALL },
  { o:['the room','the rooms'], v:'clean', ts:PASS_ALL },
  { o:['the letter','the letters'], v:'deliver', ts:PASS_ALL },
  { o:['the email','the emails'], v:'send', ts:['ps','pc','past','pp','pastp','fs'] },
  { o:['coffee'], v:'serve', ts:['ps','pc','past','pastc','fs'], mk:{ ps:['every morning','every day'], fs:['after the lecture','soon'] } },
  { o:['the bridge'], v:'build', ts:['pc','past','pastc','pp','pastp','fs'], mk:{ past:['in 1900','ten years ago'], fs:['next year','soon'], pastp:['before we moved here'], pastc:['when we moved here'] } },
  { o:['the song','the songs'], v:'write', ts:['pc','past','pp','pastp','fs'] },
  { o:['the cake'], v:'eat', ts:['past','pp','pastp'] },
  { o:['the ticket','the tickets'], v:'sell', ts:['past','pp','pastp','fs'] },
  { o:['the photo','the photos'], v:'take', ts:['pc','past','pp','pastp','fs'] },
  { o:['the car'], v:'repair', ts:['pc','past','pastc','pp','fs'] },
  { o:['the dinner'], v:'cook', ts:['pc','past','pastc','pp','fs'] },
  { o:['the book'], v:'translate', ts:['pc','past','pp','pastp','fs'] },
  { o:['the meeting'], v:'postpone', ts:['past','pp','pastp','fs'] },
  { o:['the window','the windows'], v:'break', ts:['past','pp','pastp'] },
  { o:['the walls'], v:'paint', ts:['pc','past','pastc','pp','fs'] },
  { o:['the results'], v:'announce', ts:['past','pp','pastp','fs'] },
  { o:['the film'], v:'show', ts:['ps','past','pp','fs'], mk:{ ps:['every Friday','every weekend'] } },
  { o:['English'], v:'speak', ts:['ps'], posOnly:true, mk:{ ps:['in many countries','all over the world'] } },
  { o:['the documents'], v:'sign', ts:['past','pp','pastp','fs'] },
  { o:['the plants'], v:'water', ts:['ps','pc','past','pp','fs'] }
];
const PMARK = { ps:['every week','every day','every month'], pc:['right now','at the moment'], past:['yesterday','last week','two days ago'],
  pastc:['when we arrived','when I came in'], pp:['already','just'], pastp:['before we arrived','by the time we arrived'], fs:['tomorrow','next week','soon'] };
const PASS_INFO = {
  ps:{ formula:'am/is/are + V3', ex:'The posters are printed every week.' },
  pc:{ formula:'am/is/are + being + V3', ex:'The car is being repaired right now.' },
  past:{ formula:'was/were + V3', ex:'The bridge was built in 1900.' },
  pastc:{ formula:'was/were + being + V3', ex:'The room was being cleaned when we arrived.' },
  pp:{ formula:'has/have + been + V3', ex:'The tickets have already been sold.' },
  pastp:{ formula:'had + been + V3', ex:'The cake had been eaten before we arrived.' },
  fs:{ formula:'will + be + V3', ex:'The results will be announced tomorrow.' }
};
function pvVp(t, f, pl, v) {
  const n = f === 'neg';
  const am = n ? (pl ? "aren't" : "isn't") : (pl ? 'are' : 'is');
  const wa = n ? (pl ? "weren't" : "wasn't") : (pl ? 'were' : 'was');
  switch (t) {
    case 'ps': return [am, v.v3];
    case 'pc': return [am, 'being', v.v3];
    case 'past': return [wa, v.v3];
    case 'pastc': return [wa, 'being', v.v3];
    case 'pp': return [n ? (pl ? "haven't" : "hasn't") : (pl ? 'have' : 'has'), 'been', v.v3];
    case 'pastp': return [n ? "hadn't" : 'had', 'been', v.v3];
    case 'fs': return [n ? "won't" : 'will', 'be', v.v3];
  }
  return [v.v3];
}
const P_AGREE = { is:'are', are:'is', was:'were', were:'was', has:'have', have:'has', "isn't":"aren't", "aren't":"isn't", "wasn't":"weren't", "weren't":"wasn't", "hasn't":"haven't", "haven't":"hasn't" };
function pvMake(t, f, forTransform) {
  const frames = PFRAMES.filter(fr => fr.ts.includes(t) && (f === 'pos' || !fr.posOnly));
  const fr = pick(frames), v = verb(fr.v);
  const oi = rnd(fr.o.length), obj = fr.o[oi], pl = oi === 1 || /s$/.test(obj.split(' ').pop()) && !['English'].includes(obj);
  const objT = obj.split(' ');
  let mk = fr.mk && fr.mk[t] ? pick(fr.mk[t]) : pick(PMARK[t]);
  let mid = null;
  if (t === 'pp') { if (f === 'pos') { mid = mk; mk = ''; } else mk = 'yet'; }
  const mkT = mk ? mk.split(' ') : [];
  const put = vp => {
    const w = vp.slice(); if (mid && w.length > 1) w.splice(1, 0, mid);
    return f === 'q' ? [w[0], ...objT, ...w.slice(1), ...mkT] : [...objT, ...w, ...mkT];
  };
  const vp = pvVp(t, f, pl, v), okT = put(vp);
  const T = TENSE[t], last = vp.length - 1, bad = [];
  const sub = (i, w) => { const x = vp.slice(); x[i] = w; return x; };
  if (P_AGREE[vp[0]]) bad.push([put(sub(0, P_AGREE[vp[0]])), `${cap(obj)} — ${pl ? 'множественное число (они)' : 'единственное число (оно)'}, поэтому ${vp[0]}.`]);
  bad.push([put(sub(last, v.v1)), `После be в пассиве нужен V3 (${v.v3}), а не начальная форма ${v.v1}.`]);
  if (v.v2 !== v.v3) bad.push([put(sub(last, v.v2)), `${v.v2} — это V2 (Past Simple). В пассиве всегда V3: ${v.v3}.`]);
  if (v.irr && edForm(v.v1) !== v.v3) bad.push([put(sub(last, edForm(v.v1))), `${v.v1} — неправильный глагол: V3 = ${v.v3}.`]);
  if (f === 'pos') {
    if (t === 'ps' || t === 'past') bad.push([put(vp.slice(1)), `Без ${vp[0]} получается, будто ${obj} само что-то делает. Пассив = be + V3: ${vp.join(' ')}.`]);
    if (t === 'pp' || t === 'pastp') bad.push([put([vp[0], v.v3]), `${vp[0]} ${v.v3} — активный залог. В пассиве нужен been: ${vp.join(' ')}.`]);
    if (t === 'fs') bad.push([put(['will', v.v3]), `После will в пассиве нужен be: will be ${v.v3}.`]);
    if (t === 'pc' || t === 'pastc') {
      bad.push([put([vp[0], v.v3]), `${vp[0]} ${v.v3} — пассив без процесса. Процесс в момент времени: ${vp[0]} being ${v.v3}.`]);
      bad.push([put([vp[0], v.ing]), `${vp[0]} ${v.ing} — активный залог: ${obj} само ${v.v1 === 'eat' ? 'ест' : 'что-то делает'}. Пассивный процесс: ${vp.join(' ')}.`]);
    }
  }
  if ((t === 'ps' || t === 'past') && f !== 'pos') {
    const d = t === 'past' ? (f === 'neg' ? "didn't" : 'did') : (f === 'neg' ? (pl ? "don't" : "doesn't") : (pl ? 'do' : 'does'));
    bad.push([put([d, v.v3]), `В пассиве ${f === 'q' ? 'вопрос' : 'отрицание'} строится через be (${vp[0]}), а не через ${d}.`]);
  }
  const C = { ok:okT.join(' ') + (f === 'q' ? '?' : '.'), f, bad:bad.map(([toks, r]) => [toks.join(' '), r]) };
  if (f !== 'q' && !mid) { C.gap = [objT.length, objT.length + vp.length]; C.label = `(${f === 'neg' ? 'not / ' : ''}${v.v1})`; }
  if (forTransform) {
    const act = vpOf(t, 'pos', { p:'pl', en:'they' }, v).slice(); if (mid) act.splice(1, 0, mid);
    C.ctx = 'Актив: ' + toText(['they', ...act, ...objT, ...mkT], 'pos');
    C.ask = 'Как сказать то же самое в пассиве (без «они»)?';
    const other = (CONTRAST[t] || []).filter(c => PASS_T.includes(c));
    other.forEach(c => { const x = pvVp(c, 'pos', pl, v); C.bad.push([put(x).join(' ') + '.', `Это ${TENSE[c].name} Passive. В исходном предложении ${T.name} — значит ${PASS_INFO[t].formula}.`]); });
  }
  return C;
}
PASS_T.forEach(t => {
  const T = TENSE[t], P = PASS_INFO[t];
  RULES_LIST.push({ id:t + '_pass', t, x:'pass', name:'Passive: ' + P.formula, formula:P.formula, example:P.ex,
    explain:`${T.name} Passive: ${P.formula}. Пассив нужен, когда важно действие или его результат, а не тот, кто его совершает: ${P.ex} Кто сделал — неважно или неизвестно. Если нужно, исполнителя добавляют через by: …by a local studio.`,
    make:f => pvMake(t, f), gen:passGen,
    gens:[['choice','pos'],['choice','neg'],['choice','q'],['tf','pos'],['tf','q'],['fix','pos'],['build','pos'],['build','q'],['input','pos'],['input','neg'],['multi','pos'],['sense','pos'],['translate']].filter(g => !(t === 'pp' && g[0] === 'input' && g[1] === 'pos')) });
});
function passGen(rule, spec, diff) {
  const [m, f] = spec;
  if (m === 'translate') return genTranslate(rule);
  if (m === 'multi') { for (let i = 0; i < 6; i++) { const x = multiTask(rule, () => pvMake(rule.t, 'pos')); if (x) return x; } return null; }
  for (let i = 0; i < 8; i++) { const x = caseTask(rule, m, pvMake(rule.t, f === 'ctx' ? 'pos' : f, m === 'sense'), diff); if (x) return x; }
  return null;
}

/* ---------- Modal verbs ---------- */
const MVP = {
  ab:['swim','draw manga','speak Korean','play the guitar','cook ramen','drive a car','read Japanese','ride a bike'],
  must:['finish the project today','send the files before Friday','show the ticket at the entrance','wear a helmet'],
  mustNeg:['use phones in the exam','take photos in the museum','touch the paintings','eat in the library'],
  should:['sleep more','ask the teacher','take an umbrella','drink more water','read this book','call the client'],
  shouldNeg:['drink so much coffee','work so late','skip breakfast'],
  might:['come to the party','visit Seoul next year','buy a new tablet','stay at home tonight','join the project'],
  have:['work on Saturdays','get up early','finish the report today','take the bus to the studio'],
  haveNeg:['pay for the tickets','come to the office tomorrow','get up early on Sunday','bring a laptop']
};
const MODALS = {
  can:{ w:'can', neg:"can't", list:'ab', negList:'ab' },
  could:{ w:'could', neg:"couldn't", list:'ab', negList:'ab', tail:'as a child' },
  must:{ w:'must', neg:"mustn't", list:'must', negList:'mustNeg' },
  should:{ w:'should', neg:"shouldn't", list:'should', negList:'shouldNeg' },
  might:{ w:'might', neg:'might not', list:'might', negList:'might', noQ:true }
};
const pickSubj = () => pick(SUBJ);
// подлежащее может быть из нескольких слов (my sister): сдвигаем индексы пропуска
const shiftGap = (C, n) => { if (C.gap) C.gap = [C.gap[0] + n, C.gap[1] + n]; return C; };
function modalCase(key, f) {
  const M = MODALS[key];
  if (f === 'q' && M.noQ) f = 'pos';
  const s = pickSubj(), S3 = s.p === '3s', subj = s.en, sT = subj.split(' ');
  const [V, ...rest0] = pick(MVP[f === 'neg' ? M.negList : M.list]).split(' ');
  const rest = [...rest0, ...(M.tail ? M.tail.split(' ') : [])], w = M.w, neg = M.neg.split(' ');
  const L = toks => toks.join(' ');
  let ok, bad = [], gap = null, label = '';
  if (f === 'pos') {
    ok = [...sT, w, V, ...rest];
    bad.push([L([...sT, w, 'to', V, ...rest]), `После ${w} — V1 без to: ${w} ${V}.`]);
    bad.push([L([...sT, w, ingForm(V), ...rest]), `После ${w} нужен V1 (${V}), а не форма на -ing.`]);
    if (S3) { bad.push([L([...sT, w + 's', V, ...rest]), `Модальные глаголы не меняются по лицам: ${subj} ${w}, без -s.`]); bad.push([L([...sT, w, sForm(V), ...rest]), `После ${w} — V1 без -s: ${w} ${V}.`]); }
    gap = [1, 3]; label = `(${w} / ${V})`;
  } else if (f === 'neg') {
    ok = [...sT, ...neg, V, ...rest];
    bad.push([L([...sT, S3 ? "doesn't" : "don't", w, V, ...rest]), `${cap(w)} сам образует отрицание: ${M.neg}. Do/does не нужны.`]);
    bad.push([L([...sT, ...neg, 'to', V, ...rest]), `После ${M.neg} — V1 без to.`]);
    if (S3) bad.push([L([...sT, ...neg, sForm(V), ...rest]), `После ${M.neg} — V1 без -s: ${M.neg} ${V}.`]);
    gap = [1, 2 + neg.length]; label = `(${w} / not / ${V})`;
  } else {
    ok = [w, ...sT, V, ...rest];
    bad.push([L([S3 ? 'does' : 'do', ...sT, w, V, ...rest]) + '?', `Вопрос с ${w} строится без do/does: ${cap(w)} ${subj} ${V}…?`]);
    bad.push([L([w, ...sT, 'to', V, ...rest]) + '?', `После ${w} — V1 без to.`]);
    if (S3) bad.push([L([w, ...sT, sForm(V), ...rest]) + '?', `После ${w} ${subj} — V1 без -s: ${V}.`]);
  }
  return shiftGap({ ok:L(ok) + (f === 'q' ? '?' : '.'), f, bad, gap, label }, sT.length - 1);
}
function haveToCase(f) {
  const s = pickSubj(), S3 = s.p === '3s', subj = s.en, sT = subj.split(' '), L = t => t.join(' ');
  const [V, ...rest] = pick(MVP[f === 'neg' ? 'haveNeg' : 'have']).split(' ');
  const hv = S3 ? 'has' : 'have', bad = [];
  if (f === 'pos') {
    bad.push([L([...sT, S3 ? 'have' : 'has', 'to', V, ...rest]), S3 ? `${subj} — он/она, поэтому has to.` : `С ${subj} — have to (has — только для he/she/it).`]);
    if (sForm(V) !== V) bad.push([L([...sT, hv, 'to', sForm(V), ...rest]), `После ${hv} to — V1 без -s: ${hv} to ${V}.`]);
    bad.push([L([...sT, 'must', 'to', V, ...rest]), 'После must to не ставится (с to — только have to).']);
    return shiftGap({ ok:L([...sT, hv, 'to', V, ...rest]) + '.', f, bad, gap:[1, 4], label:`(have to / ${V})` }, sT.length - 1);
  }
  const d = S3 ? "doesn't" : "don't", dq = S3 ? 'does' : 'do';
  if (f === 'neg') {
    bad.push([L([...sT, S3 ? "hasn't" : "haven't", 'to', V, ...rest]), `Отрицание have to строится через ${d}: ${subj} ${d} have to ${V}.`]);
    if (S3) bad.push([L([...sT, "doesn't", 'has', 'to', V, ...rest]), "После doesn't — have, а не has."]);
    return shiftGap({ ok:L([...sT, d, 'have', 'to', V, ...rest]) + '.', f, bad, gap:[1, 5], label:`(not / have to / ${V})` }, sT.length - 1);
  }
  bad.push([L([S3 ? 'has' : 'have', ...sT, 'to', V, ...rest]) + '?', `Вопрос с have to строится через ${dq}: ${cap(dq)} ${subj} have to ${V}…?`]);
  if (S3) bad.push([L(['does', ...sT, 'has', 'to', V, ...rest]) + '?', 'После does — have, а не has.']);
  return { ok:L([dq, ...sT, 'have', 'to', V, ...rest]) + '?', f, bad };
}
const MODAL_BANK = [
  { ctx:'Табличка в музее: здесь нельзя фотографировать.', ok:"You mustn't take photos here.", bad:[["You don't have to take photos here.", "Don't have to — «не обязательно», а здесь запрет. Запрет — mustn't."], ["You shouldn't to take photos here.", 'После should не ставится to; к тому же здесь запрет, а не совет.']] },
  { ctx:'Завтра выходной: вставать рано не обязательно.', ok:"I don't have to get up early tomorrow.", bad:[["I mustn't get up early tomorrow.", "Mustn't — запрет («нельзя»). Здесь «не обязательно» — don't have to."], ["I can't get up early tomorrow.", "Can't — «не могу». А смысл — «нет необходимости»: don't have to."]] },
  { ctx:'В пять лет ты уже умела читать.', ok:'I could read when I was five.', bad:[['I can read when I was five.', 'Умение в прошлом — could.'], ['I could to read when I was five.', 'После could — V1 без to.']] },
  { ctx:'Дружеский совет: тебе стоит больше спать.', ok:'You should sleep more.', bad:[['You must sleep more.', 'Must — строгая необходимость или правило. Для дружеского совета — should.'], ['You should to sleep more.', 'После should — V1 без to.']] },
  { ctx:'Возможно, вечером пойдёт дождь — ты не уверена.', ok:'It might rain this evening.', bad:[['It must rain this evening.', "Must — «обязательно». Неуверенное «возможно» — might или may."], ['It might rains this evening.', 'После might — V1 без -s.']] },
  { ctx:'Вежливо попроси у преподавателя разрешения войти.', ok:'May I come in?', bad:[['Do I may come in?', 'С модальными глаголами вопрос без do: May I…?'], ['Must I come in?', 'Must I — «обязан ли я». Просьба разрешения — May I или Can I.']] },
  { ctx:'В школе Мии форма обязательна — таковы правила.', ok:'Mia has to wear a uniform at school.', bad:[['Mia have to wear a uniform at school.', 'Mia — она, поэтому has to.'], ['Mia has to wears a uniform at school.', 'После has to — V1: wear.']] },
  { ctx:'Ты не умеешь водить машину.', ok:"I can't drive.", bad:[["I don't can drive.", "Can сам образует отрицание: can't. Don't не нужен."], ["I mustn't drive.", "Mustn't — запрет, а речь об умении: can't."]] },
  { ctx:'Спроси друга, умеет ли он играть на гитаре.', ok:'Can you play the guitar?', bad:[['Do you can play the guitar?', 'Вопрос с can — без do: Can you…?'], ['Can you to play the guitar?', 'После can — V1 без to.']] },
  { ctx:'Совет: тебе не стоит пить так много кофе.', ok:"You shouldn't drink so much coffee.", bad:[["You don't should drink so much coffee.", "Отрицание should — shouldn't, без don't."], ["You mustn't to drink so much coffee.", "После mustn't — V1 без to; к тому же это совет, а не запрет."]] },
  { ctx:'Спроси, нужно ли Лео завтра приходить в офис.', ok:'Does Leo have to come to the office tomorrow?', bad:[['Has Leo to come to the office tomorrow?', 'Вопрос с have to — через do/does: Does Leo have to…?'], ['Does Leo has to come to the office tomorrow?', 'После does — have, а не has.']] },
  { ctx:'Билеты бесплатные — платить не нужно.', ok:"We don't have to pay.", bad:[["We mustn't pay.", "Mustn't — «нельзя платить». Здесь «не нужно» — don't have to."], ["We haven't to pay.", "Отрицание have to — don't have to."]] },
  { ctx:'Может быть, Лин приедет на выходных — она пока не решила.', ok:'Lin might come at the weekend.', bad:[['Lin will come at the weekend.', 'Will — уверенный прогноз. «Может быть» — might.'], ['Lin might comes at the weekend.', 'После might — V1 без -s.']] },
  { ctx:'Ты считаешь, что обязана закончить проект сегодня.', ok:'I must finish the project today.', bad:[['I should finish the project today.', 'Should — мягкий совет. «Обязана» — must.'], ['I must to finish the project today.', 'После must — V1 без to.']] }
];
const MODAL_FX = [
  { ctx:'утверждение с can', ok:'S + can + V1', bad:[['S + can + to + V1', 'После модального глагола to не ставится.'], ['S + cans + V1', 'Модальные глаголы не меняются по лицам.'], ['S + can + V-ing', 'После can — V1.']] },
  { ctx:'отрицание с should', ok:"S + shouldn't + V1", bad:[["S + don't + should + V1", "Should сам образует отрицание: shouldn't."], ["S + shouldn't + to + V1", "После shouldn't — V1 без to."]] },
  { ctx:'вопрос с can', ok:'Can + S + V1?', bad:[['Do + S + can + V1?', 'Вопрос с can — без do/does.'], ['Can + S + V-s?', 'После can — V1 без -s.']] },
  { ctx:'have to с he / she / it', ok:'He/She/It + has to + V1', bad:[['He/She/It + have to + V1', 'С he/she/it — has to.'], ['He/She/It + has to + V-s', 'После has to — V1 без -s.']] },
  { ctx:'вопрос с have to', ok:'Do/Does + S + have to + V1?', bad:[['Have/Has + S + to + V1?', 'Вопрос с have to строится через do/does.'], ['Do/Does + S + has to + V1?', 'После do/does — have.']] },
  { ctx:'запрет', ok:"S + mustn't + V1", bad:[["S + don't have to + V1", "Don't have to — «не обязательно», это не запрет."], ["S + mustn't + to + V1", "После mustn't — V1 без to."]] }
];

/* ---------- Will vs going to ---------- */
const WG_VP = ['visit Seoul in May','learn Korean','buy a new laptop','start a new project','watch the new film','call the client','move to another city','paint the kitchen'];
function willCase(f) {
  const s = pickSubj(), subj = s.en, sT = subj.split(' '), L = t => t.join(' ');
  const [V, ...rest] = pick(WG_VP).split(' '), bad = [];
  if (f === 'pos') {
    bad.push([L([...sT, 'will', 'to', V, ...rest]), `После will — V1 без to: will ${V}.`]);
    bad.push([L([...sT, 'will', sForm(V), ...rest]), `После will — V1 без -s: will ${V}.`]);
    bad.push([L([...sT, 'will', ingForm(V), ...rest]), `После will нужен V1, а не форма на -ing.`]);
    return shiftGap({ ok:L([...sT, 'will', V, ...rest]) + '.', f, bad, gap:[1, 3], label:`(will / ${V})` }, sT.length - 1);
  }
  if (f === 'neg') {
    bad.push([L([...sT, s.p === '3s' ? "doesn't" : "don't", 'will', V, ...rest]), "Отрицание будущего — won't (will not), без do/does."]);
    bad.push([L([...sT, "won't", 'to', V, ...rest]), "После won't — V1 без to."]);
    return shiftGap({ ok:L([...sT, "won't", V, ...rest]) + '.', f, bad, gap:[1, 3], label:`(will / not / ${V})` }, sT.length - 1);
  }
  bad.push([L([s.p === '3s' ? 'does' : 'do', ...sT, 'will', V, ...rest]) + '?', 'Will сам выходит вперёд в вопросе: Will … ? Do/does не нужны.']);
  bad.push([L(['will', ...sT, 'to', V, ...rest]) + '?', 'После will — V1 без to.']);
  return { ok:L(['will', ...sT, V, ...rest]) + '?', f, bad };
}
function goingCase(f) {
  const s = pickSubj(), subj = s.en, sT = subj.split(' '), S3 = s.p === '3s', L = t => t.join(' ');
  const [V, ...rest] = pick(WG_VP).split(' '), be = beFor(s), bad = [];
  if (f === 'pos') {
    bad.push([L([...sT, 'going', 'to', V, ...rest]), `Не хватает be: ${subj} ${be} going to ${V}.`]);
    ['am','is','are'].filter(x => x !== be).slice(0, 1).forEach(x => bad.push([L([...sT, x, 'going', 'to', V, ...rest]), `С ${subj} нужно ${be}: ${be} going to.`]));
    if (sForm(V) !== V) bad.push([L([...sT, be, 'going', 'to', sForm(V), ...rest]), `После going to — V1 без -s: going to ${V}.`]);
    bad.push([L([...sT, be, 'going', V, ...rest]), 'Не хватает to: going to + V1.']);
    return shiftGap({ ok:L([...sT, be, 'going', 'to', V, ...rest]) + '.', f, bad, gap:[1, 5], label:`(be going to / ${V})` }, sT.length - 1);
  }
  if (f === 'neg') {
    const n = s.p === '1s' ? ['am', 'not'] : [S3 ? "isn't" : "aren't"];
    bad.push([L([...sT, S3 ? "doesn't" : "don't", 'going', 'to', V, ...rest]), `Отрицание строится через be: ${n.join(' ')} going to.`]);
    bad.push([L([...sT, 'not', 'going', 'to', V, ...rest]), `Нужен be: ${subj} ${n.join(' ')} going to.`]);
    return shiftGap({ ok:L([...sT, ...n, 'going', 'to', V, ...rest]) + '.', f, bad, gap:[1, 4 + n.length], label:`(not / be going to / ${V})` }, sT.length - 1);
  }
  bad.push([L([S3 ? 'does' : 'do', ...sT, 'going', 'to', V, ...rest]) + '?', `Вопрос с going to — через be: ${cap(be)} ${subj} going to…?`]);
  bad.push([L([be, ...sT, 'going', V, ...rest]) + '?', 'Не хватает to: going to + V1.']);
  return { ok:L([be, ...sT, 'going', 'to', V, ...rest]) + '?', f, bad };
}
const WG_BANK = [
  { r:'wg_dec', ctx:'Звонит телефон, и ты решаешь ответить прямо сейчас.', ok:"I'll answer it.", bad:[["I'm going to answer it.", "Решение принято в момент речи — will (I'll)."], ['I answer it.', "Present Simple — о привычках. Решение сейчас — I'll answer it."]] },
  { r:'wg_dec', ctx:'Подруга говорит, что у неё тяжёлая сумка. Предложи помощь.', ok:"I'll carry it for you.", bad:[["I'm going to carry it for you.", 'Предложение помощи в момент речи — will.'], ['I carry it for you.', "Предложение помощи — I'll carry it."]] },
  { r:'wg_dec', ctx:'Пообещай, что никому не расскажешь.', ok:"I won't tell anyone.", bad:[["I don't tell anyone.", "Обещание — will: I won't tell anyone."], ["I won't to tell anyone.", "После won't — V1 без to."]] },
  { r:'wg_dec', ctx:'В кафе ты выбираешь напиток прямо у кассы.', ok:"I'll have a latte, please.", bad:[["I'm going to have a latte, please.", "Решение принято у кассы, в момент речи — I'll have."], ['I will having a latte, please.', 'После will — V1: will have.']] },
  { r:'wg_dec', ctx:'В комнате холодно, и ты только что решила закрыть окно.', ok:"I'll close the window.", bad:[["I'm going to close the window.", 'Решение только что пришло в голову — will.'], ['I close the window.', "Решение в момент речи — I'll close."]] },
  { r:'wg_plan', ctx:'Вы с подругой уже купили билеты в Сеул на май.', ok:"We're going to visit Seoul in May.", bad:[["We'll visit Seoul in May.", 'Билеты куплены — план, решение принято заранее: going to.'], ["We're going to visits Seoul in May.", 'После going to — V1 без -s.']] },
  { r:'wg_plan', ctx:'Ты давно решила учить корейский и уже записалась на курс.', ok:"I'm going to learn Korean.", bad:[["I'll learn Korean.", 'Решение принято до разговора — going to.'], ['I going to learn Korean.', "Не хватает am: I'm going to."]] },
  { r:'wg_plan', ctx:'Друг спрашивает о твоих планах на выходные. Ты уже всё решила.', ok:"I'm going to clean my room and watch a film.", bad:[["I'll clean my room and watch a film.", 'Заранее решённые планы — going to.'], ["I'm going clean my room and watch a film.", 'Не хватает to: going to + V1.']] },
  { r:'wg_plan', ctx:'Мия уже купила краски: она собирается нарисовать постер.', ok:'Mia is going to paint a poster.', bad:[['Mia will paint a poster.', 'Краски куплены — намерение было заранее: going to.'], ['Mia is going to paints a poster.', 'После going to — V1 без -s.']] },
  { r:'wg_plan', ctx:'Спроси подругу о её планах на лето.', ok:'What are you going to do this summer?', bad:[['What do you going to do this summer?', 'Going to строится с be: What are you going to do?'], ['What are you going to doing this summer?', 'После going to — V1: do.']] },
  { r:'wg_pred', ctx:'Посмотри на эти тучи!', ok:"It's going to rain.", bad:[['It will rain.', 'Прогноз по признакам, которые видны сейчас (тучи), — going to.'], ['It going to rain.', "Не хватает is: It's going to rain."]] },
  { r:'wg_pred', ctx:'Ты уверена, что Лин понравится подарок (это твоё мнение).', ok:"I'm sure Lin will like the present.", bad:[["I'm sure Lin will likes the present.", 'После will — V1 без -s.'], ["I'm sure Lin will to like the present.", 'После will — V1 без to.']] },
  { r:'wg_pred', ctx:'Лео бежит слишком быстро по скользкой дороге.', ok:"He's going to fall!", bad:[["He'll fall!", 'Признак виден прямо сейчас — прогноз через going to.'], ['He going to fall!', "Не хватает is: He's going to fall."]] },
  { r:'wg_pred', ctx:'Батарея телефона на 1%.', ok:'My phone is going to die.', bad:[['My phone will die.', 'Есть явный признак прямо сейчас (1%) — going to.'], ['My phone is going to dies.', 'После going to — V1 без -s.']] },
  { r:'wg_pred', ctx:'Ты думаешь, что команда, вероятно, выиграет.', ok:'Our team will probably win.', bad:[['Our team will probably wins.', 'После will — V1 без -s.'], ['Our team will probably to win.', 'После will не нужен to.']] },
  { r:'wg_pred', ctx:'Ты думаешь, что подруге понравится этот фильм.', ok:"I think you'll like this film.", bad:[["I think you'll liked this film.", 'После will — V1: like.'], ['I think you like this film tomorrow.', "Прогноз-мнение о будущем — will: you'll like."]] }
];
const WG_FX = [
  { ctx:'утверждение с will', ok:'S + will + V1', bad:[['S + will + to + V1', 'После will to не ставится.'], ['S + will + V-s', 'После will — V1 без -s.']] },
  { ctx:'отрицание с will', ok:"S + won't + V1", bad:[["S + don't + will + V1", "Отрицание — won't."], ["S + won't + to + V1", "После won't — V1."]] },
  { ctx:'утверждение с going to', ok:'S + am/is/are + going to + V1', bad:[['S + going to + V1', 'Без am/is/are нельзя.'], ['S + am/is/are + going + V1', 'Не хватает to.']] },
  { ctx:'вопрос с going to', ok:'Am/Is/Are + S + going to + V1?', bad:[['Do/Does + S + going to + V1?', 'Вопрос строится через be.']] },
  { ctx:'вопрос с will', ok:'Will + S + V1?', bad:[['Do + S + will + V1?', 'Will сам выходит вперёд: Will you…?']] }
];

/* ---------- правила спецлабораторий ---------- */
const FORM_GENS = [['choice','pos'],['choice','neg'],['choice','q'],['tf','pos'],['tf','q'],['fix','pos'],['fix','neg'],['build','pos'],['build','neg'],['build','q'],['input','pos'],['input','neg'],['multi','pos'],['translate']];
const CTX_GENS = [['sense','ctx'],['tf','ctx'],['fix','ctx'],['build','ctx'],['translate']];
RULES_LIST.push(
  { id:'modal_fx', t:'modal', name:'Формулы модальных глаголов', cat:'fx', bank:MODAL_FX, gen:topicGen, gens:[['fchoice'],['fbuild']] },
  { id:'md_can', t:'modal', name:'can / could', formula:"can / can't / could + V1", example:"I can swim, but I can't drive.", explain:'Can — умение и возможность сейчас, could — умение в прошлом. Can не меняется по лицам (she can), после него V1 без to, вопрос и отрицание без do: Can she…? She can\'t…',
    make:f => modalCase(Math.random() < 0.3 ? 'could' : 'can', f), gen:topicGen, gens:FORM_GENS },
  { id:'md_must', t:'modal', name:"must / mustn't", formula:"must / mustn't + V1", example:"I must finish it today. You mustn't take photos here.", explain:"Must — сильная необходимость или правило, mustn't — запрет. После must — V1 без to, без -s.",
    make:f => modalCase('must', f), gen:topicGen, gens:FORM_GENS },
  { id:'md_haveto', t:'modal', name:"have to / don't have to", formula:"have/has to + V1 · don't/doesn't have to · Do/Does … have to?", example:"She has to work on Saturdays. You don't have to come.", explain:"Have to — необходимость из-за обстоятельств. С he/she/it — has to. Вопрос и отрицание через do/does: Does she have to…? She doesn't have to… Don't have to — «не обязательно», а не запрет.",
    make:haveToCase, gen:topicGen, gens:FORM_GENS },
  { id:'md_should', t:'modal', name:"should / shouldn't", formula:"should / shouldn't + V1", example:'You should sleep more.', explain:"Should — совет, shouldn't — совет не делать. После should — V1 без to; вопрос: Should I…?",
    make:f => modalCase('should', f), gen:topicGen, gens:FORM_GENS },
  { id:'md_might', t:'modal', name:'may / might', formula:'may / might (not) + V1', example:'It might rain this evening.', explain:'May и might — «может быть», возможность без уверенности. После них V1 без to и без -s. May I…? — вежливая просьба.',
    make:f => modalCase('might', f), gen:topicGen, gens:FORM_GENS.filter(g => g[1] !== 'q') },
  { id:'md_sense', t:'modal', name:'выбор модального глагола', cat:'use', formula:"mustn't = нельзя · don't have to = не обязательно · should = совет · might = может быть", example:"You mustn't smoke here. You don't have to come.", explain:"Главное — смысл: can — умею/могу, must — должна, mustn't — нельзя, don't have to — не обязательно, should — стоит, might — может быть.",
    bank:MODAL_BANK, gen:topicGen, gens:CTX_GENS },
  { id:'wg_fx', t:'wg', name:'Формулы will и going to', cat:'fx', bank:WG_FX, gen:topicGen, gens:[['fchoice'],['fbuild']] },
  { id:'wg_will', t:'wg', name:'will: форма', formula:"will / won't + V1 · Will + S + V1?", example:"I'll help you. I won't tell anyone.", explain:"Will не меняется по лицам и не требует do: She will call. She won't call. Will she call? После will — V1 без to.",
    make:willCase, gen:topicGen, gens:FORM_GENS },
  { id:'wg_going', t:'wg', name:'going to: форма', formula:'am/is/are + going to + V1', example:"We're going to visit Seoul in May.", explain:"Going to всегда с be: I'm going to, she's going to, they're going to. Отрицание и вопрос — через be: She isn't going to… Are you going to…?",
    make:goingCase, gen:topicGen, gens:FORM_GENS },
  { id:'wg_dec', t:'wg', name:'will: решение сейчас, обещание, помощь', cat:'use', formula:"решение в момент речи → will", example:"The phone is ringing. — I'll answer it!", explain:"Если решение принято прямо во время разговора, а также в обещаниях и предложениях помощи — will.",
    bank:WG_BANK.filter(x => x.r === 'wg_dec'), gen:topicGen, gens:CTX_GENS },
  { id:'wg_plan', t:'wg', name:'going to: план и намерение', cat:'use', formula:'решено заранее → going to', example:"We're going to visit Seoul in May.", explain:'Если решение принято до разговора (план, намерение, уже куплены билеты) — going to.',
    bank:WG_BANK.filter(x => x.r === 'wg_plan'), gen:topicGen, gens:CTX_GENS },
  { id:'wg_pred', t:'wg', name:'прогноз: мнение или признаки', cat:'use', formula:'мнение (I think…) → will · признаки сейчас → going to', example:"I think you'll like it. Look at the clouds! It's going to rain.", explain:"Прогноз-мнение, часто с I think, probably, I'm sure — will. Прогноз по тому, что видно прямо сейчас, — going to.",
    bank:WG_BANK.filter(x => x.r === 'wg_pred'), gen:topicGen, gens:CTX_GENS }
);
RULES_LIST.forEach(r => {
  if (r.cat === 'fx' && isSpecial(r.t) && !r.explain) { const T = TENSE[r.t]; r.explain = 'Формулы: утверждение — ' + T.f.pos + '; отрицание — ' + T.f.neg + '; вопрос — ' + T.f.q + '.'; r.example = T.ex.pos.join(' '); r.formula = T.f.pos; }
  RULES[r.id] = r;
});

/* ---------- перевод ---------- */
TRANSLATE.push(
  ['ps','ps_pass','Кофе здесь подают каждое утро.',['Coffee is served here every morning.']],
  ['ps','ps_pass','На английском говорят во многих странах.',['English is spoken in many countries.']],
  ['pc','pc_pass','Мою машину сейчас ремонтируют.',['My car is being repaired {now|right now|at the moment}.']],
  ['past','past_pass','Этот мост построили в 1900 году.',['This bridge was built in 1900.']],
  ['past','past_pass','Письма отправили вчера.',['The letters were sent yesterday.']],
  ['pastc','pastc_pass','Когда мы пришли, комнату убирали.',['When we {arrived|came}, the room was being cleaned.','The room was being cleaned when we {arrived|came}.']],
  ['pp','pp_pass','Билеты уже продали.',['The tickets have already been sold.']],
  ['pp','pp_pass','Результаты ещё не объявили.',["The results haven't been announced yet."]],
  ['pastp','pastp_pass','Когда мы пришли, торт уже съели.',['When we {arrived|came}, the cake had already been eaten.','The cake had already been eaten when we {arrived|came}.']],
  ['fs','fs_pass','Результаты объявят завтра.',['The results will be announced tomorrow.']],
  ['modal','md_can','Я умею плавать, но не умею водить.',["I can swim{,|} but I can't drive."]],
  ['modal','md_can','В детстве я очень хорошо рисовала.',['I could draw very well as a child.','I could draw very well when I was a child.','As a child{,|} I could draw very well.']],
  ['modal','md_must','Здесь нельзя фотографировать.',["You mustn't take photos here.","You can't take photos here."]],
  ['modal','md_haveto','Ей приходится работать по субботам.',['She has to work on Saturdays.']],
  ['modal','md_haveto','Тебе не обязательно приходить.',["You don't have to come."]],
  ['modal','md_should','Тебе стоит спросить преподавателя.',['You should ask the teacher.','You should ask your teacher.']],
  ['modal','md_might','Может быть, завтра пойдёт дождь.',['It might rain tomorrow.','It may rain tomorrow.']],
  ['modal','md_sense','Можно мне войти?',['May I come in?','Can I come in?','Could I come in?']],
  ['wg','wg_dec','Я тебе помогу!',["I'll help you!"]],
  ['wg','wg_dec','Я никому не расскажу.',["I won't tell anyone.","I won't tell anybody."]],
  ['wg','wg_plan','Мы собираемся поехать в Сеул в мае.',["We're going to {go to|visit} Seoul in May."]],
  ['wg','wg_plan','Что ты собираешься делать на выходных?',['What are you going to do {at|on|this} weekend?','What are you going to do at the weekend?']],
  ['wg','wg_pred','Смотри, какие тучи! Сейчас пойдёт дождь.',["Look at the clouds! It's going to rain.","Look at those clouds! It's going to rain."]],
  ['wg','wg_pred','Думаю, тебе понравится этот фильм.',["I think you'll like this {film|movie}."]],
  ['wg','wg_going','Она не собирается покупать новый ноутбук.',["She isn't going to buy a new laptop."]],
  ['wg','wg_will','Ты придёшь на вечеринку?',['Will you come to the party?']]
);

'use strict';
/* =========================================================
   TIME LAB · движок: спряжение, типичные ошибки, генерация
   заданий, проверка ответов, нормализация ввода
   ========================================================= */

/* ---------- утилиты ---------- */
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- формы глаголов ---------- */
const IRR_MAP = Object.fromEntries(IRREG.map(r => [r[0], { v1:r[0], v2:r[1], v3:r[2], ru:r[3], ex:r[4] }]));
const DOUBLE = new Set(['run','swim','sit','get','stop','plan','shop','chat','begin','put','cut','travel','win','hit','set','forget','jog','drop']);
function sForm(v) {
  if (v === 'have') return 'has'; if (v === 'be') return 'is'; if (v === 'do') return 'does'; if (v === 'go') return 'goes';
  if (/(s|sh|ch|x|z|o)$/.test(v)) return v + 'es';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies';
  return v + 's';
}
function ingForm(v) {
  if (v === 'be') return 'being';
  if (/ie$/.test(v)) return v.slice(0, -2) + 'ying';
  if (DOUBLE.has(v)) return v + v.slice(-1) + 'ing';
  if (/[^e]e$/.test(v)) return v.slice(0, -1) + 'ing';
  return v + 'ing';
}
function edForm(v) {
  if (/e$/.test(v)) return v + 'd';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied';
  if (DOUBLE.has(v)) return v + v.slice(-1) + 'ed';
  return v + 'ed';
}
const VCACHE = {};
function verb(id) {
  if (VCACHE[id]) return VCACHE[id];
  const irr = IRR_MAP[id];
  const v = { id, v1:id, s:sForm(id), ing:ingForm(id), v2: irr ? irr.v2 : edForm(id), v3: irr ? irr.v3 : edForm(id), irr: !!irr && id !== 'be', ru: VERB_RU[id] || (irr && irr.ru) || '' };
  v.alt = {};
  if (id === 'travel') v.alt = { traveling:'travelling', traveled:'travelled' };
  if (id === 'learn') v.alt = { learnt:'learned' };
  if (id === 'get') v.alt = { gotten:'got' };
  return (VCACHE[id] = v);
}
const PH_V = { id:'X', v1:'V1', s:'V-s/es', ing:'V-ing', v2:'V2', v3:'V3', irr:false, alt:{} };

/* ---------- спряжение ---------- */
const beFor = s => s.p === '1s' ? 'am' : s.p === '3s' ? 'is' : 'are';
const wasFor = s => (s.p === '1s' || s.p === '3s') ? 'was' : 'were';
const doFor = s => s.p === '3s' ? 'does' : 'do';
function vpOf(t, f, s, v) {
  const s3 = s.p === '3s', I = s.p === '1s', neg = f === 'neg', q = f === 'q' || f === 'wh', be = v.id === 'be';
  const beN = I ? ['am','not'] : [s3 ? "isn't" : "aren't"];
  const was = wasFor(s), wasN = was === 'was' ? "wasn't" : "weren't";
  const hv = s3 ? 'has' : 'have', hvN = s3 ? "hasn't" : "haven't";
  switch (t) {
    case 'ps': if (be) return neg ? beN : [beFor(s)]; return neg ? [s3 ? "doesn't" : "don't", v.v1] : q ? [doFor(s), v.v1] : [s3 ? v.s : v.v1];
    case 'pc': return neg ? [...beN, v.ing] : [beFor(s), v.ing];
    case 'past': if (be) return neg ? [wasN] : [was]; return neg ? ["didn't", v.v1] : q ? ['did', v.v1] : [v.v2];
    case 'pastc': return neg ? [wasN, v.ing] : [was, v.ing];
    case 'pp': return [neg ? hvN : hv, be ? 'been' : v.v3];
    case 'ppc': return [neg ? hvN : hv, 'been', v.ing];
    case 'pastp': return [neg ? "hadn't" : 'had', v.v3];
    case 'pastpc': return [neg ? "hadn't" : 'had', 'been', v.ing];
    case 'fs': return [neg ? "won't" : 'will', v.v1];
    case 'fc': return [neg ? "won't" : 'will', 'be', v.ing];
    case 'fp': return [neg ? "won't" : 'will', 'have', v.v3];
    case 'fpc': return [neg ? "won't" : 'will', 'have', 'been', v.ing];
  }
  return [v.v1];
}
const BE_TOK = new Set(['am','is','are','was','were']);
function assemble(S, vp) {
  vp = vp || S.vp;
  const subj = S.s.en;
  if (S.f === 'q') return [vp[0], subj, ...vp.slice(1), ...S.rest].filter(Boolean);
  if (S.f === 'wh') return [S.wh, vp[0], subj, ...vp.slice(1), ...S.restWh].filter(Boolean);
  let v = vp.slice();
  if (S.adv) v = (vp.length === 1 && !BE_TOK.has(vp[0])) ? [S.adv, vp[0]] : [vp[0], S.adv, ...vp.slice(1)];
  return [subj, ...v, ...S.rest].filter(Boolean);
}
const isQ = f => f === 'q' || f === 'wh';
function toText(toks, f) { return cap(toks.filter(Boolean).join(' ')) + (isQ(f) ? '?' : '.'); }

/* ---------- построение предложения ---------- */
const RECENT = [];
function remember(txt) { RECENT.push(txt); if (RECENT.length > 80) RECENT.shift(); }
const STAT_T = ['ps','past'];
function frameFits(fr, t, f, fl) {
  if (fr.be && !STAT_T.includes(t)) return false;
  if (fr.stat && !STAT_T.includes(t)) return false;
  if (t === 'ps' && fr.noHab) return false;
  if (['pp','ppc','pastpc','fpc'].includes(t) && !fr.dur) return false;
  if (['pastp','fp'].includes(t) && !fr.comp) return false;
  if (f === 'wh' && !fr.wh) return false;
  const v = verb(fr.v);
  switch (fl.verb) {
    case 'be': if (!fr.be) return false; break;
    case 'have': if (fr.v !== 'have') return false; break;
    case 'act': if (fr.be || fr.stat) return false; break;
    case 'stat': if (!fr.stat) return false; break;
    case 'irr': if (fr.be || !v.irr || v.v1 === v.v2) return false; break;
    case 'nonbe': if (fr.be) return false; break;
  }
  if (fl.now && !fr.now) return false;
  if (fl.ingTricky && (v.v1 + 'ing') === v.ing) return false;
  return true;
}
function pickMarker(t, fr, fl) {
  if (fl.noMarker) return '';
  if (t === 'ps') { if (fr.be) return pick(MARK.psBe); if (fr.stat) return fl.now ? pick(MARK.now) : ''; return pick(MARK.ps); }
  if (t === 'past') { if (fr.be) return pick(MARK.pastBe); if (fr.stat) return pick(MARK.pastStat); return pick(MARK.past); }
  return pick(MARK[t] || ['']);
}
function mkS(t, f, fl = {}, s0) {
  const frames = FRAMES.filter(fr => frameFits(fr, t, f, fl));
  if (!frames.length) return null;
  let S;
  for (let i = 0; i < 25; i++) {
    const fr = pick(frames), v = verb(fr.v);
    let subs = SUBJ;
    if (fl.subj === '3s') subs = SUBJ.filter(s => s.p === '3s');
    if (fl.subj === 'n3s') subs = SUBJ.filter(s => s.p !== '3s');
    const s = s0 || pick(subs);
    let marker = pickMarker(t, fr, fl);
    let adv = null;
    if (t === 'ps' && f === 'pos' && !fr.stat && !fl.noAdv && (fl.adv || Math.random() < 0.18)) { adv = pick(['usually','often','always','sometimes']); if (!fr.be) marker = ''; }
    S = { t, f, s, v, fr, marker, adv, wh: fr.wh };
    S.rest = [fr.o, marker].filter(Boolean);
    S.restWh = [marker].filter(Boolean);
    S.vp = vpOf(t, f, s, v);
    S.toks = assemble(S);
    S.text = toText(S.toks, f);
    if (!RECENT.includes(S.text)) break;
  }
  remember(S.text);
  return S;
}

/* ---------- типичные ошибки (мутации) ---------- */
const AGREE = { do:'does', does:'do', "don't":"doesn't", "doesn't":"don't", has:'have', have:'has', "hasn't":"haven't", "haven't":"hasn't", was:'were', were:'was', "wasn't":"weren't", "weren't":"wasn't" };
const who = S => S.s.en;
const whoD = S => (S.s.p === '3s' && !['he','she','He/She/It','I/He/She/It'].includes(S.s.en)) ? `${S.s.en} (= he/she)` : S.s.en;
function agreeReason(S, right) {
  const w = whoD(S);
  if (['does',"doesn't"].includes(right)) return `С ${w} нужен ${right}: это he/she/it (3-е лицо, ед. ч.). Do/don't — для I, you, we, they.`;
  if (['do',"don't"].includes(right)) return `${w} — не he/she/it, поэтому ${right}. Does/doesn't — только для he/she/it.`;
  if (['has',"hasn't"].includes(right)) return `С ${w} (he/she/it) нужно ${right}.`;
  if (['have',"haven't"].includes(right)) return S.t === 'ps' && S.f !== 'pos' ? `После вспомогательного глагола — have.` : `С ${w} — ${right}. Has/hasn't — только he/she/it.`;
  if (['was',"wasn't"].includes(right)) return `Was — для I, he, she, it. С ${w} — ${right}.`;
  if (['were',"weren't"].includes(right)) return `С ${w} — ${right} (you/we/they). Was — только I/he/she/it.`;
  return '';
}
function beReason(S, right) {
  if (right === 'am') return 'С I — только am.';
  if (right === 'is' || right === "isn't") return `С ${whoD(S)} (3-е лицо, ед. ч.) — is.`;
  return `С ${whoD(S)} — are.`;
}
const lastI = vp => vp.length - 1;
const MUT = {
  aux_agree(S) {
    const vp = S.vp, a = vp[0];
    if (AGREE[a]) return [{ vp:[AGREE[a], ...vp.slice(1)], reason:agreeReason(S, a) }];
    if (['am','is','are'].includes(a)) return ['am','is','are'].filter(x => x !== a).map(x => ({ vp:[x, ...vp.slice(1)], reason:beReason(S, a) }));
    if (a === "isn't") return [{ vp:["aren't", ...vp.slice(1)], reason:beReason(S, 'is') }];
    if (a === "aren't") return [{ vp:["isn't", ...vp.slice(1)], reason:beReason(S, 'are') }];
    return [];
  },
  s_after_aux(S) {
    if (S.t !== 'ps' || S.v.id === 'be' || S.f === 'pos') return [];
    const i = lastI(S.vp); if (S.vp[i] !== S.v.v1 || S.v.s === S.v.v1) return [];
    const vp = S.vp.slice(); vp[i] = S.v.s;
    return [{ vp, reason: S.v.id === 'have' ? 'После does/doesn\'t — have, а не has: окончание уже «забрал» does.' : `После do/does/don't/doesn't основной глагол — V1 без -s: ${S.v.v1}. Лицо уже показал вспомогательный глагол.` }];
  },
  did_present(S) {
    if (S.t !== 'ps' || !isQ(S.f) || !['do','does'].includes(S.vp[0])) return [];
    return [{ vp:['did', S.v.s], reason:'Вопрос о настоящем — do/does; did — только о прошлом. И после вспомогательного глагола — V1 без окончаний.' }];
  },
  missing_s(S) {
    if (S.t !== 'ps' || S.f !== 'pos' || S.v.id === 'be' || S.s.p !== '3s' || S.vp[0] !== S.v.s || S.v.s === S.v.v1) return [];
    return [{ vp:[S.v.v1], reason:`${whoD(S)} — это he/she/it, поэтому в утверждении нужно окончание: ${S.v.s}.` }];
  },
  bad_s(S) {
    if (S.t !== 'ps' || S.f !== 'pos' || S.v.id === 'be' || S.s.p !== '3s' || S.vp[0] !== S.v.s) return [];
    const v = S.v.v1, naive = v + 's';
    if (naive === S.v.s) return [];
    let why = `Правописание: ${v} → ${S.v.s}.`;
    if (v === 'have') why = 'Have с he/she/it — has (особая форма).';
    else if (/[^aeiou]y$/.test(v)) why = `Согласная + y → -ies: ${v} → ${S.v.s}.`;
    else if (/(s|sh|ch|x|z|o)$/.test(v)) why = `После -s, -sh, -ch, -x, -o добавляем -es: ${v} → ${S.v.s}.`;
    return [{ vp:[naive], reason:why }];
  },
  extra_s(S) {
    if (S.t !== 'ps' || S.f !== 'pos' || S.v.id === 'be' || S.s.p === '3s' || S.v.s === S.v.v1) return [];
    return [{ vp:[S.v.s], reason:`${who(S)} — не he/she/it, окончание -s не нужно: ${who(S)} ${S.v.v1}.` }];
  },
  extra_be(S) {
    if (S.t !== 'ps' || S.f !== 'pos' || S.v.id === 'be') return [];
    const main = S.s.p === '3s' ? S.v.s : S.v.v1;
    return [{ vp:[beFor(S.s), main], reason:`В Present Simple am/is/are не ставят перед обычным глаголом. Правильно: ${who(S)} ${S.vp[0]}. Если действие происходит прямо сейчас — это другое время: ${who(S)} ${beFor(S.s)} ${S.v.ing}.` }];
  },
  be_do(S) {
    if (S.v.id !== 'be' || S.f === 'pos') return [];
    const aux = S.t === 'past' ? (S.f === 'neg' ? "didn't" : 'did') : (S.f === 'neg' ? (S.s.p === '3s' ? "doesn't" : "don't") : doFor(S.s));
    return [{ vp:[aux], reason:`С глаголом be ${S.t === 'past' ? 'did' : 'do/does'} не используется: ${S.f === 'neg' ? 'отрицание — ' + S.vp.join(' ') : 'в вопросе be выходит вперёд — ' + cap(S.vp[0]) + ' ' + who(S) + '…?'}` }];
  },
  be_for_do(S) {
    if (S.t !== 'ps' || S.v.id === 'be' || S.f === 'pos') return [];
    if (S.f === 'neg') return [{ vp:[...(S.s.p === '1s' ? ['am','not'] : [S.s.p === '3s' ? "isn't" : "aren't"]), S.v.v1], reason:`${S.v.v1} — обычный глагол, поэтому отрицание с don't/doesn't. Am/is/are — только с be или в Continuous (V-ing).` }];
    return [{ vp:[beFor(S.s), S.v.v1], reason:`${S.v.v1} — обычный глагол, поэтому вопрос с do/does. Am/is/are — только с be или в Continuous (V-ing).` }];
  },
  not_no_aux(S) {
    if (S.t !== 'ps' || S.f !== 'neg' || S.v.id === 'be') return [];
    return [{ vp:['not', S.v.v1], reason:'Not не ставится прямо перед глаголом. Нужен вспомогательный: don\'t/doesn\'t + V1.' }];
  },
  order_q(S) {
    if (S.f === 'wh') return [{ toks:[S.wh, S.s.en, ...S.vp, ...S.restWh], reason:'В вопросе вспомогательный глагол стоит перед подлежащим: вопросительное слово + вспомогательный + подлежащее + глагол.' }];
    if (S.f === 'q') return [{ toks:[S.s.en, ...S.vp, ...S.rest], reason:'Вопрос начинается со вспомогательного глагола: ' + cap(S.vp[0]) + ' ' + S.s.en + '…?' }];
    return [];
  },
  adv_order(S) {
    if (!S.adv || S.f !== 'pos') return [];
    const ad = S.adv;
    if (S.v.id === 'be') return [{ toks:[S.s.en, ad, ...S.vp, ...S.rest], reason:'С am/is/are наречие частоты стоит после глагола: ' + S.s.en + ' ' + S.vp[0] + ' ' + ad + '…' }];
    return [{ toks:[S.s.en, ...S.vp, ad, ...S.rest], reason:`Наречия частоты (always, usually, often) стоят перед основным глаголом: ${S.s.en} ${ad} ${S.vp[0]}…` }];
  },
  pc_no_be(S) {
    if (!['pc','pastc','ppc','pastpc'].includes(S.t) || S.f !== 'pos') return [];
    return [{ vp:S.vp.slice(1), reason:`В Continuous обязательна часть be: ${S.vp.join(' ')}.` }];
  },
  pc_be_v1(S) {
    const i = lastI(S.vp); if (S.vp[i] !== S.v.ing) return [];
    const vp = S.vp.slice(); vp[i] = S.v.v1;
    return [{ vp, reason:`В Continuous после ${S.vp[i - 1] === 'not' ? S.vp[i - 2] + ' not' : S.vp[i - 1]} нужен глагол с -ing: ${S.v.ing}.` }];
  },
  pc_do(S) {
    if (!['pc','pastc'].includes(S.t) || S.f === 'pos') return [];
    const past = S.t === 'pastc';
    const aux = S.f === 'neg' ? (past ? "didn't" : (S.s.p === '3s' ? "doesn't" : "don't")) : (past ? 'did' : doFor(S.s));
    return [{ vp:[aux, S.v.ing], reason:`Continuous строится с be (${past ? 'was/were' : 'am/is/are'}), а не с ${past ? 'did' : 'do/does'}.` }];
  },
  ing_spell(S) {
    const v = S.v.v1, ing = S.v.ing, i = lastI(S.vp);
    if (S.vp[i] !== ing) return [];
    const c = new Set();
    if (v + 'ing' !== ing) c.add(v + 'ing');
    if (!DOUBLE.has(v) && /[^aeiou][aeiou][^aeiouwxy]$/.test(v)) c.add(v + v.slice(-1) + 'ing');
    if (DOUBLE.has(v)) c.add(v + 'ing');
    if (/e$/.test(v) && !/ee$/.test(v)) c.add(v + 'ing');
    c.delete(ing);
    let why = `Обычно просто + ing: ${v} → ${ing}.`;
    if (/ie$/.test(v)) why = `-ie → -y: ${v} → ${ing}.`;
    else if (/[^e]e$/.test(v)) why = `Немая -e в конце выпадает: ${v} → ${ing}.`;
    else if (DOUBLE.has(v)) why = `Короткий глагол «согласная + гласная + согласная» удваивает последнюю букву: ${v} → ${ing}.`;
    else if (/[^aeiou][aeiou][^aeiouwxy]$/.test(v)) why = `Удвоение только в коротких ударных слогах (run, sit, chat). ${v} → ${ing}.`;
    return [...c].map(w => { const vp = S.vp.slice(); vp[i] = w; return { vp, reason:why }; });
  },
  past_v1(S) {
    if (S.t !== 'past' || S.f !== 'pos' || S.v.id === 'be' || S.v.v1 === S.v.v2) return [];
    return [{ vp:[S.v.v1], reason:`${S.marker ? 'Маркер «' + S.marker + '» — прошлое. ' : ''}В утверждении Past Simple нужна форма V2: ${S.v.v2}.` }];
  },
  past_reg(S) {
    if (S.t !== 'past' || S.f !== 'pos' || !S.v.irr) return [];
    const w = edForm(S.v.v1); if (w === S.v.v2) return [];
    return [{ vp:[w], reason:`${S.v.v1} — неправильный глагол: ${S.v.v1} – ${S.v.v2} – ${S.v.v3}. Окончание -ed к нему не добавляют.` }];
  },
  did_v2(S) {
    if (S.t !== 'past' || S.f === 'pos' || S.v.id === 'be' || S.v.v1 === S.v.v2) return [];
    const vp = S.vp.slice(); vp[lastI(vp)] = S.v.v2;
    return [{ vp, reason:`После did/didn't — V1: ${S.v.v1}. Прошлое уже показал did, второй раз его не показывают.` }];
  },
  was_did(S) {
    if (S.t !== 'past' || S.f === 'pos') return [];
    if (S.v.id === 'be') return [{ vp:[S.f === 'neg' ? "didn't" : 'did'], reason:`С be в прошлом вопросы и отрицания строятся без did: ${S.f === 'neg' ? S.s.en + ' ' + S.vp[0] + '…' : cap(S.vp[0]) + ' ' + S.s.en + '…?'}` }];
    const w = wasFor(S.s);
    return [{ vp:[S.f === 'neg' ? (w === 'was' ? "wasn't" : "weren't") : w, S.v.v1], reason:`${S.v.v1} — обычный глагол, поэтому ${S.f === 'neg' ? "didn't" : 'did'} + V1. Was/were — только с be и в Past Continuous.` }];
  },
  past_no_did(S) {
    if (S.t !== 'past' || S.f !== 'wh' || S.v.id === 'be') return [];
    return [{ toks:[S.wh, S.s.en, S.v.v2, ...S.restWh], reason:'Вопрос в Past Simple строится с did: вопросительное слово + did + подлежащее + V1.' }];
  },
  pastc_present(S) {
    if (S.t !== 'pastc' || S.f !== 'pos') return [];
    return [{ vp:[beFor(S.s), S.v.ing], reason:`Маркер «${S.marker}» указывает на прошлое: нужен ${wasFor(S.s)}, а не ${beFor(S.s)}.` }];
  },
  perf_v2(S) {
    const i = lastI(S.vp); if (S.vp[i] !== S.v.v3 || S.v.v2 === S.v.v3) return [];
    const vp = S.vp.slice(); vp[i] = S.v.v2;
    return [{ vp, reason:`После have/has/had нужна третья форма V3: ${S.v.v3} (${S.v.v1} – ${S.v.v2} – ${S.v.v3}).` }];
  },
  perf_v1(S) {
    const i = lastI(S.vp); if (S.vp[i] !== S.v.v3 || S.v.v1 === S.v.v3) return [];
    const vp = S.vp.slice(); vp[i] = S.v.v1;
    return [{ vp, reason:`После have/has/had — V3: ${S.v.v3}, а не начальная форма.` }];
  },
  no_been(S) {
    const i = S.vp.indexOf('been'); if (i < 0 || S.vp[i + 1] !== S.v.ing) return [];
    return [{ vp:S.vp.filter((x, k) => k !== i), reason:'Perfect Continuous = have/has/had (will have) + been + V-ing. Been обязательно.' }];
  },
  will_to(S) {
    if (!['will',"won't"].includes(S.vp[0])) return [];
    return [{ vp:[S.vp[0], 'to', ...S.vp.slice(1)], reason:'После will частица to не нужна.' }];
  },
  will_s(S) {
    if (S.t !== 'fs' || S.s.p !== '3s' || S.v.s === S.v.v1) return [];
    return [{ vp:[S.vp[0], S.v.s], reason:'После will глагол всегда в V1, без -s.' }];
  },
  will_ing(S) {
    if (S.t !== 'fs') return [];
    return [{ vp:[S.vp[0], S.v.ing], reason:'Future Simple: will + V1. Will + V-ing бывает только как will be + V-ing (Future Continuous).' }];
  },
  will_be_v1(S) {
    if (S.t !== 'fc') return [];
    return [{ vp:[S.vp[0], 'be', S.v.v1], reason:'Future Continuous: will be + V-ing.' }];
  },
  will_has(S) {
    if (!['fp','fpc'].includes(S.t) || S.s.p !== '3s') return [];
    return [{ vp:S.vp.map(x => x === 'have' ? 'has' : x), reason:'После will — всегда have, даже с he/she/it.' }];
  },
  swap(S) {
    return (CONTRAST[S.t] || []).map(c => ({ vp:vpOf(c, S.f, S.s, S.v), tense:c, reason:swapReason(S, c) }));
  },
  stat_pc(S) {
    return [{ vp:vpOf('pc', S.f, S.s, S.v), tense:'pc', reason:`${S.v.v1} — глагол состояния. Обычно его не ставят в Continuous${S.marker ? ', даже со словом «' + S.marker + '»' : ''}.` }];
  }
};
function swapReason(S, c) {
  const T = TENSE[S.t], C = TENSE[c];
  return `${S.marker ? 'Маркер «' + S.marker + '» указывает на ' + T.name + ': ' : T.name + ': '}${T.meaning}. ${C.name} (${C.meaning}) здесь не подходит.`;
}
function mutants(S, keys) {
  const out = [], seenT = new Set([S.text]);
  (keys || []).forEach(k => {
    if (!MUT[k]) return;
    MUT[k](S).forEach(m => {
      m.toks = (m.toks || assemble(S, m.vp)).filter(Boolean);
      m.text = toText(m.toks, S.f);
      if (seenT.has(m.text)) return;
      seenT.add(m.text); out.push(m);
    });
  });
  return out;
}

/* ---------- нормализация ответов ---------- */
function canon(str, mode) {
  let s = String(str || '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”"«»]/g, '');
  s = s.replace(/\./g, '').replace(/(\d)\s*(am|pm)\b/g, '$1 $2');
  s = s.replace(/\bwon't\b/g, 'will not').replace(/\bcan't\b/g, 'can not').replace(/\bcannot\b/g, 'can not')
    .replace(/n't\b/g, ' not').replace(/'m\b/g, ' am').replace(/'re\b/g, ' are').replace(/'ve\b/g, ' have').replace(/'ll\b/g, ' will').replace(/'d\b/g, ' would')
    .replace(/(\w)'s\b/g, (m, a) => a + (mode === 'has' ? ' has' : ' is'));
  s = s.replace(/é/g, 'e').replace(/colour/g, 'color').replace(/favourite/g, 'favorite').replace(/travell/g, 'travel').replace(/learnt/g, 'learned');
  s = s.replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
  return s;
}
function expandAlts(str) {
  const m = str.match(/\{([^{}]*)\}/);
  if (!m) return [str];
  return m[1].split('|').flatMap(opt => expandAlts(str.slice(0, m.index) + opt + str.slice(m.index + m[0].length)));
}
const ALL_MARKERS = [...new Set([...Object.values(MARK).flat(), ...EXTRA_MARKERS].filter(Boolean))].sort((a, b) => b.length - a.length);
function withFrontMarker(ans) {
  const c = ans.replace(/[.?!]+$/, '');
  for (const mk of ALL_MARKERS) {
    if (c.toLowerCase().endsWith(' ' + mk.toLowerCase())) {
      return [ans, mk + ' ' + c.slice(0, c.length - mk.length - 1)];
    }
  }
  return [ans];
}
function acceptSet(list) {
  const out = new Set();
  list.flatMap(expandAlts).flatMap(withFrontMarker).forEach(a => { out.add(canon(a, 'is')); out.add('#' + canon(a, 'has')); });
  return out;
}
function accepted(set, user) { return set.has(canon(user, 'is')) || set.has('#' + canon(user, 'has')); }

/* ---------- разметка предложений ---------- */
function glossWord(w) {
  const k = w.toLowerCase();
  if (GLOSS[k]) return `<button type="button" class="gl" data-gl="${esc(GLOSS[k])}">${esc(w)}</button>`;
  return esc(w);
}
function glossText(text) {
  return String(text).split(/(\s+|[.,!?;:]+)/).map(p => /^[A-Za-zé'-]+$/.test(p) ? glossWord(p) : esc(p)).join('');
}
function sentHTML(toks, f, gapIdx, gapLabel) {
  const parts = toks.filter(x => x !== '').map((w, i) => {
    if (i === gapIdx) return `<span class="gap">${gapLabel ? esc(gapLabel) : '&nbsp;'}</span>`;
    return glossText(i === 0 ? cap(w) : w);
  });
  return parts.join(' ') + (isQ(f) ? '?' : '.');
}
function hintFor(rule, f) {
  const T = TENSE[rule.t];
  const form = f === 'neg' ? T.f.neg : isQ(f) ? T.f.q : T.f.pos;
  return `${T.name}: ${form}. Правило: ${rule.formula || ''}`;
}
function base(rule, type, extra) {
  return Object.assign({ id:uid(), type, rule:rule.id, t:rule.t, chip:TENSE[rule.t].name }, extra);
}
function gapIndex(ct, ms) {
  let idx = -1;
  for (const m of ms) {
    if (m.toks.length !== ct.length) return -1;
    const d = []; ct.forEach((w, i) => { if (w !== m.toks[i]) d.push(i); });
    if (d.length !== 1) return -1;
    if (idx === -1) idx = d[0]; else if (idx !== d[0]) return -1;
  }
  return idx;
}

/* ---------- генераторы заданий ---------- */
function genChoice(rule, f, muts, fl, diff) {
  for (let k = 0; k < 10; k++) {
    const S = mkS(rule.t, f, fl); if (!S) return null;
    let ms = mutants(S, muts); if (!ms.length) continue;
    ms = shuffle(ms).slice(0, diff <= 1 ? 1 : 3);
    const gi = gapIndex(S.toks, ms);
    let opts = [{ full:S.text, tok:gi >= 0 ? S.toks[gi] : null, reason:'', ok:1 }, ...ms.map(m => ({ full:m.text, tok:gi >= 0 ? m.toks[gi] : null, reason:m.reason }))];
    if (gi >= 0) { const seenTok = new Set(); opts = opts.filter(o => !seenTok.has(o.tok) && seenTok.add(o.tok)); }
    if (opts.length < 2) continue;
    opts = shuffle(opts);
    return base(rule, 'choice', {
      diff, f, instr: gi >= 0 ? 'Выбери правильную форму' : 'Выбери грамматически правильное предложение',
      html: gi >= 0 ? sentHTML(S.toks, f, gi) : '',
      labels: opts.map(o => gi >= 0 ? (gi === 0 ? cap(o.tok) : o.tok) : o.full),
      fulls: opts.map(o => o.full), reasons: opts.map(o => o.reason), ans: opts.findIndex(o => o.ok),
      correct: S.text, hint: hintFor(rule, f), sim:{ t:rule.t, f, fl }
    });
  }
  return null;
}
function genTF(rule, f, muts, fl) {
  for (let k = 0; k < 8; k++) {
    const S = mkS(rule.t, f, fl); if (!S) return null;
    const ms = mutants(S, muts);
    const wrong = ms.length && Math.random() < 0.55 ? pick(ms) : null;
    if (!wrong && !ms.length && k < 7) continue;
    return base(rule, 'tf', { diff:1, f, instr:'Верно или неверно?', html:glossText(wrong ? wrong.text : S.text), shown: wrong ? wrong.text : S.text,
      isTrue: !wrong, reason: wrong ? wrong.reason : '', correct:S.text, hint:hintFor(rule, f), sim:{ t:rule.t, f, fl } });
  }
  return null;
}
function genMulti(rule, f, muts, fl) {
  const k = 1 + rnd(3), items = [];
  for (let i = 0; i < 4; i++) {
    const S = mkS(rule.t, f, fl); if (!S) return null;
    const ms = i >= k ? mutants(S, muts) : [];
    if (ms.length) { const m = pick(ms); items.push({ text:m.text, ok:false, reason:m.reason, fix:S.text }); }
    else items.push({ text:S.text, ok:true });
  }
  if (!items.some(x => x.ok)) return null;
  const sh = shuffle(items);
  return base(rule, 'multi', { diff:3, f, instr:'Отметь все правильные предложения (их может быть несколько)', items:sh, hint:hintFor(rule, f), sim:{ t:rule.t, f, fl } });
}
function genFix(rule, f, muts, fl) {
  for (let k = 0; k < 12; k++) {
    const S = mkS(rule.t, f, fl); if (!S) return null;
    const ct = S.toks;
    const ms = mutants(S, muts).filter(m => {
      if (m.toks.length === ct.length) return m.toks.filter((w, i) => w !== ct[i]).length === 1;
      if (m.toks.length === ct.length + 1) { for (let i = 0; i < m.toks.length; i++) if (m.toks.filter((x, j) => j !== i).join(' ') === ct.join(' ')) { m.del = i; return true; } }
      return false;
    });
    if (!ms.length) continue;
    const m = pick(ms);
    const errIdx = m.del != null ? m.del : m.toks.findIndex((w, i) => w !== ct[i]);
    return base(rule, 'fix', { diff:3, f, instr:'Найди ошибку: нажми на неверное слово и исправь его', toks:m.toks, errIdx, op: m.del != null ? 'del' : 'rep',
      accept: acceptSet([S.text]), correct:S.text, wrongText:m.text, reason:m.reason, hint:hintFor(rule, f), sim:{ t:rule.t, f, fl } });
  }
  return null;
}
function buildAccept(S) {
  const list = [S.text];
  if (S.adv && ['usually','often','sometimes'].includes(S.adv)) list.push(cap(S.adv) + ' ' + S.text[0].toLowerCase() + S.text.slice(1).replace(' ' + S.adv + ' ', ' '));
  return list;
}
function genBuild(rule, f, muts, fl) {
  for (let k = 0; k < 6; k++) {
    const S = mkS(rule.t, f, fl); if (!S) return null;
    const cards = S.toks.map(t => ({ id:uid(), txt:t }));
    let distract = null;
    if (muts && muts.length) {
      const ms = mutants(S, muts).filter(m => gapIndex(S.toks, [m]) >= 0);
      if (ms.length) { const m = pick(ms), gi = gapIndex(S.toks, [m]); if (!S.toks.includes(m.toks[gi])) { distract = { txt:m.toks[gi], reason:m.reason }; cards.push({ id:uid(), txt:m.toks[gi], extra:1 }); } }
    }
    let sh = shuffle(cards); if (sh.map(c => c.txt).join(' ') === S.toks.join(' ')) sh = shuffle(cards);
    return base(rule, 'build', { diff:3, f, instr: isQ(f) ? 'Собери вопрос из карточек' : f === 'neg' ? 'Собери отрицательное предложение' : 'Собери предложение из карточек',
      cards:sh, accept:acceptSet(buildAccept(S)), correct:S.text, distract, ctoks:S.toks, hint:hintFor(rule, f), sim:{ t:rule.t, f, fl } });
  }
  return null;
}
function vpGap(S) {
  const pre = [S.s.en], post = [...S.rest];
  if (S.adv) { if (S.v.id !== 'be' && S.vp.length === 1) pre.push(S.adv); else post.unshift(S.adv); }
  return { pre, post };
}
function altStrings(vpStr, v) {
  const out = [vpStr];
  Object.entries(v.alt || {}).forEach(([alt, main]) => { if (vpStr.split(' ').includes(main)) out.push(vpStr.split(' ').map(w => w === main ? alt : w).join(' ')); });
  return out;
}
function genInput(rule, f, fl) {
  if (isQ(f)) f = 'pos';
  const S = mkS(rule.t, f, fl); if (!S) return null;
  const { pre, post } = vpGap(S);
  const b = S.v.id === 'be' ? 'be' : S.v.v1;
  const gapTxt = f === 'neg' ? `not / ${b}` : b;
  const wrongMap = {};
  Object.keys(MUT).filter(k => !['order_q','adv_order','past_no_did','swap','stat_pc'].includes(k)).forEach(k => MUT[k](S).forEach(m => { if (m.vp) wrongMap[canon(m.vp.join(' '))] = m.reason; }));
  (CONTRAST[S.t] || []).forEach(c => { if (!(c === 'pc' && S.v.id === 'be')) wrongMap[canon(vpOf(c, f, S.s, S.v).join(' '))] = wrongMap[canon(vpOf(c, f, S.s, S.v).join(' '))] || swapReason(S, c); });
  const vpStr = S.vp.join(' ');
  delete wrongMap[canon(vpStr)];
  const html = [...pre, '§', ...post].map((w, i) => w === '§' ? `<span class="gap gap-in">(${esc(gapTxt)})</span>` : glossText(i === 0 ? cap(w) : w)).join(' ') + '.';
  return base(rule, 'input', { diff:3, f, instr:'Впиши глагол в правильной форме', html, accept:acceptSet(altStrings(vpStr, S.v)), correct:S.text, correctPart:vpStr, wrongMap,
    placeholder:'форма глагола', pre, post, hint:hintFor(rule, f), sim:{ t:rule.t, f, fl } });
}
let TR_RECENT = [];
function genTranslate(rule) {
  let items = TRANSLATE.filter(x => x[1] === rule.id);
  if (!items.length) items = TRANSLATE.filter(x => x[0] === rule.t);
  if (!items.length) return null;
  const fresh = items.filter(x => !TR_RECENT.includes(x[2]));
  const it = pick(fresh.length ? fresh : items);
  TR_RECENT.push(it[2]); if (TR_RECENT.length > 30) TR_RECENT.shift();
  const r = RULES[it[1]] || rule;
  return base(r, 'translate', { diff:4, instr:'Переведи на английский', ru:it[2], accept:acceptSet(it[3]), correct:expandAlts(it[3][0])[0], alts:it[3].flatMap(expandAlts).slice(0, 4),
    placeholder:'Напиши по-английски', hint:`${TENSE[it[0]].name}: ${TENSE[it[0]].f.pos}. Подумай о правиле «${r.name}».` });
}
function genChat(rule, step, dlg) {
  if (!step) {
    const all = [];
    DIALOGS.forEach(d => d.steps.forEach(s => { if (s.rule === rule.id) all.push([d, s]); }));
    if (!all.length) DIALOGS.forEach(d => { if (d.t === rule.t) d.steps.forEach(s => all.push([d, s])); });
    if (!all.length) return null;
    [dlg, step] = pick(all);
  }
  const r = RULES[step.rule] || rule;
  const t = base(r, 'chat', { diff:3, instr:step.ask, who:dlg.who, role:dlg.role, msg:step.msg, dialog:dlg.id, hint:step.hint || `${TENSE[r.t].name}. Правило: ${r.name}.` });
  if (step.opts) {
    const o = shuffle(step.opts.map((x, i) => ({ x, ok:i === 0, why:(step.why || [])[i] || '' })));
    t.labels = o.map(z => z.x); t.fulls = t.labels; t.reasons = o.map(z => z.why); t.ans = o.findIndex(z => z.ok); t.correct = step.opts[0];
  } else { t.accept = acceptSet(step.input); t.correct = expandAlts(step.input[0])[0]; t.placeholder = 'Твой ответ по-английски'; }
  return t;
}
function genSwapc(rule, t) {
  for (let k = 0; k < 6; k++) {
    const S = mkS(t, 'pos', { verb:'act', noAdv:true }); if (!S) return null;
    const { pre, post } = vpGap(S);
    const opts = [{ tense:t, vp:S.vp.join(' '), reason:'' }, ...(CONTRAST[t] || []).map(c => ({ tense:c, vp:vpOf(c, 'pos', S.s, S.v).join(' '), reason:swapReason(S, c) }))];
    const sh = shuffle(opts.filter((o, i, a) => a.findIndex(z => z.vp === o.vp) === i));
    if (sh.length < 2) continue;
    const full = o => toText([...pre, ...o.vp.split(' '), ...post], 'pos');
    return base(rule, 'choice', { diff:2, f:'pos', noChip:true, instr:'Какая форма подходит по смыслу?',
      html:[...pre, '§', ...post].map((w, i) => w === '§' ? `<span class="gap gap-in">(${esc(S.v.v1)})</span>` : glossText(i === 0 ? cap(w) : w)).join(' ') + '.',
      labels:sh.map(o => o.vp), fulls:sh.map(full), reasons:sh.map(o => o.reason), ans:sh.findIndex(o => o.tense === t), correct:S.text,
      hint:'Посмотри на маркер времени: ' + (S.marker || 'контекст'), sim:{ t, f:'pos', fl:{ verb:'act' } } });
  }
  return null;
}
function twoParts(L, E) {
  const ev = [E.s, E.v2, E.rest].filter(Boolean);
  return { ev, longToks:L.toks };
}
function genTimeline(rule, t) {
  let pre, post, opts, correct, simple;
  if (t === 'pastc') {
    const L = mkS('pastc', 'pos', { verb:'act', noMarker:true }), E = pick(EVENTS);
    pre = ['While', L.s.en]; post = [L.fr.o + ',', E.s, E.v2, E.rest].filter(Boolean);
    opts = ['pastc','past','pc'].map(c => ({ tense:c, vp:vpOf(c, 'pos', L.s, L.v).join(' ') }));
    correct = toText([...pre, ...L.vp, ...post], 'pos'); simple = L.v.v1;
  } else {
    const S = mkS(t, 'pos', { verb:'act', noAdv:true }); if (!S) return null;
    ({ pre, post } = vpGap(S));
    opts = [t, ...(CONTRAST[t] || [])].map(c => ({ tense:c, vp:vpOf(c, 'pos', S.s, S.v).join(' ') }));
    correct = S.text; simple = S.v.v1;
  }
  opts = shuffle(opts.filter((o, i, a) => a.findIndex(z => z.vp === o.vp) === i));
  const ms = shuffle([t, ...(CONTRAST[t] || [])].filter((x, i, a) => a.indexOf(x) === i).map(c => ({ tense:c, label:TENSE[c].meaning })));
  return base(rule, 'timeline', { diff:3, noChip:true, instr:'Спаси временную линию: выбери форму и объясни её значение', tl:TENSE[t].tl,
    html:[...pre, '§', ...post].map((w, i) => w === '§' ? `<span class="gap gap-in">(${esc(simple)})</span>` : glossText(i === 0 ? cap(w) : w)).join(' ') + '.',
    opts:opts.map(o => ({ label:o.vp, sub:TENSE[o.tense].name, tense:o.tense })), ans:opts.findIndex(o => o.tense === t),
    mopts:ms, mans:ms.findIndex(m => m.tense === t), tense:t, correct, hint:'Посмотри на временную шкалу и маркеры в предложении.' });
}
function genStat(rule, mode) {
  const f = mode === 'choiceq' ? 'q' : 'pos';
  const S = mkS('ps', f, { verb:'stat', now: f === 'pos' && Math.random() < 0.65 }); if (!S) return null;
  const ms = [...mutants(S, ['stat_pc']), ...mutants(S, [f === 'pos' ? 'extra_be' : 'be_for_do'])];
  if (mode === 'tf') {
    const wrong = Math.random() < 0.6 ? ms[0] : null;
    return base(rule, 'tf', { diff:1, f, instr:'Верно или неверно?', html:glossText(wrong ? wrong.text : S.text), shown:wrong ? wrong.text : S.text, isTrue:!wrong,
      reason:wrong ? wrong.reason : '', correct:S.text, hint:'Know, want, like, need, understand — глаголы состояния.', sim:{ t:'ps', f, fl:{ verb:'stat' } } });
  }
  const opts = shuffle([{ full:S.text, ok:1, reason:'' }, ...ms.map(m => ({ full:m.text, reason:m.reason }))]);
  return base(rule, 'choice', { diff:2, f, instr:'Выбери естественное предложение', html:'', labels:opts.map(o => o.full), fulls:opts.map(o => o.full),
    reasons:opts.map(o => o.reason), ans:opts.findIndex(o => o.ok), correct:S.text, hint:'Глаголы состояния обычно не используют в Continuous.', sim:{ t:'ps', f, fl:{ verb:'stat' } } });
}
function genIngc(rule) {
  for (let k = 0; k < 8; k++) {
    const S = mkS('pc', 'pos', { verb:'act', ingTricky: Math.random() < 0.8 }); if (!S) return null;
    const ms = mutants(S, ['ing_spell']).slice(0, 3); if (!ms.length) continue;
    const gi = gapIndex(S.toks, ms); if (gi < 0) continue;
    const opts = shuffle([{ tok:S.toks[gi], ok:1, reason:'', full:S.text }, ...ms.map(m => ({ tok:m.toks[gi], reason:m.reason, full:m.text }))]);
    return base(rule, 'choice', { diff:2, f:'pos', instr:'Выбери правильное написание -ing', html:sentHTML(S.toks, 'pos', gi), labels:opts.map(o => o.tok), fulls:opts.map(o => o.full),
      reasons:opts.map(o => o.reason), ans:opts.findIndex(o => o.ok), correct:S.text, hint:'make → making, run → running, play → playing', sim:{ t:'pc', f:'pos', fl:{ verb:'act', ingTricky:true } } });
  }
  return null;
}
function genTwo(rule, mode) {
  const L = mkS('pastc', 'pos', { verb:'act', noMarker:true }); if (!L) return null;
  const E = pick(EVENTS), ev = [E.s, E.v2, E.rest].filter(Boolean), lt = L.toks;
  const correct = toText([...lt, 'when', ...ev], 'pos');
  const sim = null;
  if (mode === 'conj') {
    const toks = [...lt, 'when', ...ev];
    const opts = shuffle([{ tok:'when', ok:1, reason:'' }, { tok:'while', reason:'While обычно вводит длительное действие в Past Continuous (while I was drawing). Перед коротким событием в Past Simple ставим when.' }]);
    return base(rule, 'choice', { diff:1, f:'pos', instr:'When или while?', html:sentHTML(toks, 'pos', lt.length), labels:opts.map(o => o.tok),
      fulls:opts.map(o => toText([...lt, o.tok, ...ev], 'pos')), reasons:opts.map(o => o.reason), ans:opts.findIndex(o => o.ok), correct, hint:'Какое действие короткое, а какое — длинное?', sim });
  }
  if (mode === 'short') {
    const pre = [...lt, 'when', E.s], post = [E.rest].filter(Boolean);
    const opts = shuffle([{ x:E.v2, ok:1, reason:'' }, { x:E.cont, reason:'Короткое событие, которое прервало процесс, — Past Simple, а не Continuous.' }, { x:E.pres, reason:'История в прошлом — нужна форма V2.' }, { x:E.v1, reason:'В утверждении Past Simple нужна V2.' }].filter((o, i, a) => a.findIndex(z => z.x === o.x) === i));
    return base(rule, 'choice', { diff:2, f:'pos', instr:'Выбери форму для короткого события',
      html:[...pre, '§', ...post].map((w, i) => w === '§' ? `<span class="gap gap-in">(${esc(E.v1)})</span>` : glossText(i === 0 ? cap(w) : w)).join(' ') + '.',
      labels:opts.map(o => o.x), fulls:opts.map(o => toText([...pre, o.x, ...post], 'pos')), reasons:opts.map(o => o.reason), ans:opts.findIndex(o => o.ok), correct, hint:'Длинное действие — фон, короткое — событие.', sim });
  }
  if (mode === 'long') {
    const pre = ['While', L.s.en], post = [L.fr.o + ',', ...ev];
    const wrongAgree = wasFor(L.s) === 'was' ? 'were' : 'was';
    const opts = shuffle([{ x:L.vp.join(' '), ok:1, reason:'' }, { x:L.v.v2, reason:'После while обычно идёт длительное действие — Past Continuous (was/were + V-ing).' },
      { x:wrongAgree + ' ' + L.v.ing, reason:agreeReason({ s:L.s, t:'pastc', f:'pos' }, wasFor(L.s)) }, { x:beFor(L.s) + ' ' + L.v.ing, reason:'История в прошлом: нужен was/were, а не am/is/are.' }]);
    const full = x => toText([...pre, x, ...post], 'pos');
    return base(rule, 'choice', { diff:2, f:'pos', instr:'Выбери форму для длинного действия',
      html:[...pre, '§', ...post].map((w, i) => w === '§' ? `<span class="gap gap-in">(${esc(L.v.v1)})</span>` : glossText(w)).join(' ') + '.',
      labels:opts.map(o => o.x), fulls:opts.map(o => full(o.x)), reasons:opts.map(o => o.reason), ans:opts.findIndex(o => o.ok), correct:full(L.vp.join(' ')), hint:'While + was/were + V-ing', sim });
  }
  if (mode === 'full') {
    const sw = toText([L.s.en, L.v.v2, L.fr.o, 'when', E.s, E.cont, E.rest].filter(Boolean), 'pos');
    const v1 = toText([L.s.en, L.vp[0], L.v.v1, L.fr.o, 'when', ...ev].filter(Boolean), 'pos');
    const wh = toText([...lt, 'while', ...ev], 'pos');
    const opts = shuffle([{ x:correct, ok:1, reason:'' }, { x:sw, reason:'Процесс и событие перепутаны: длинное действие — Past Continuous, короткое — Past Simple.' },
      { x:v1, reason:'В Past Continuous после was/were — V-ing.' }, { x:wh, reason:'Перед коротким событием — when, а не while.' }]);
    return base(rule, 'choice', { diff:3, f:'pos', instr:'Какое предложение описывает ситуацию правильно?', html:'', labels:opts.map(o => o.x), fulls:opts.map(o => o.x),
      reasons:opts.map(o => o.reason), ans:opts.findIndex(o => o.ok), correct, hint:'Процесс (фон) — was/were + V-ing; событие — V2.', sim });
  }
  // build
  const chunks = [...lt, 'when', ...ev];
  const cards = chunks.map(t => ({ id:uid(), txt:t }));
  const dis = pick([{ txt:'while', reason:'Перед коротким событием — when.' }, { txt:wasFor(L.s) === 'was' ? 'were' : 'was', reason:agreeReason({ s:L.s, t:'pastc', f:'pos' }, wasFor(L.s)) }]);
  if (!chunks.includes(dis.txt)) cards.push({ id:uid(), txt:dis.txt, extra:1 });
  return base(rule, 'build', { diff:3, f:'pos', instr:'Собери предложение: процесс + короткое событие', cards:shuffle(cards),
    accept:acceptSet([correct, toText(['When', ...ev, ...lt], 'pos')]), correct, distract:dis, ctoks:chunks, hint:'was/were + V-ing … when + V2' });
}

/* ---------- формулы ---------- */
function fGroups(t) {
  if (['ps','pp','ppc'].includes(t)) return [{ en:'He/She/It', p:'3s' }, { en:'I/You/We/They', p:'pl' }];
  if (t === 'pc') return [{ en:'I', p:'1s' }, { en:'He/She/It', p:'3s' }, { en:'You/We/They', p:'pl' }];
  if (t === 'pastc') return [{ en:'I/He/She/It', p:'3s' }, { en:'You/We/They', p:'pl' }];
  return [{ en:'Подлежащее', p:'pl' }];
}
function fS(t, f, s) {
  const S = { t, f, s, v:PH_V, fr:{ o:'' }, marker:'', adv:null, rest:[], restWh:[] };
  S.vp = vpOf(t, f, s, PH_V); S.toks = assemble(S); S.text = fText(S.toks, f);
  return S;
}
function fText(toks, f) {
  const p = toks.slice();
  if (isQ(f)) { p[0] = cap(p[0]); if (p[1]) p[1] = p[1].replace(/\b(He|She|It|You|We|They)\b/g, m => m.toLowerCase()); }
  return p.join(' + ') + (isQ(f) ? ' ?' : '');
}
const FX_MUTS = { ps:['aux_agree','s_after_aux','be_for_do','missing_s','extra_be','not_no_aux'], pc:['aux_agree','pc_be_v1','pc_no_be','pc_do'], past:['did_v2','past_v1','was_did'],
  pastc:['aux_agree','pc_be_v1','pc_do'], pp:['aux_agree','perf_v2','perf_v1'], ppc:['no_been','aux_agree','pc_be_v1'], pastp:['perf_v2','perf_v1'], pastpc:['no_been','pc_be_v1'],
  fs:['will_to','will_ing'], fc:['will_be_v1','will_to'], fp:['perf_v2','will_to'], fpc:['no_been','will_to'] };
const FORM_RU = { pos:'Утверждение (+)', neg:'Отрицание (−)', q:'Вопрос (?)' };
function fxMutants(S) {
  return FX_MUTS[S.t].flatMap(k => MUT[k](S).map(m => ({ toks:(m.toks || assemble(S, m.vp)), reason:m.reason }))).map(m => ({ ...m, text:fText(m.toks, S.f) })).filter(m => m.text !== S.text);
}
function genFChoice(rule) {
  const t = rule.t, f = pick(['pos','neg','q']), s = pick(fGroups(t));
  const S = fS(t, f, s);
  const ms = shuffle(fxMutants(S)).slice(0, 2);
  const others = shuffle(ORDER.filter(x => x !== t)).slice(0, 4).map(c => ({ text:fS(c, f, s).text, reason:`Это формула ${TENSE[c].name}.` }));
  let opts = [{ text:S.text, ok:1, reason:'' }, ...ms, ...others].filter((o, i, a) => a.findIndex(z => z.text === o.text) === i).slice(0, 4);
  opts = shuffle(opts);
  return base(rule, 'choice', { diff:1, f, instr:`Узнай формулу: ${FORM_RU[f]} · ${TENSE[t].name} · ${s.en}`, html:'', mono:true, labels:opts.map(o => o.text), fulls:opts.map(o => o.text),
    reasons:opts.map(o => o.reason), ans:opts.findIndex(o => o.ok), correct:S.text, hint:TENSE[t].meaning });
}
function genFBuild(rule) {
  const t = rule.t, f = pick(['pos','neg','q']), s = pick(fGroups(t));
  const S = fS(t, f, s);
  const cards = S.toks.map(x => ({ id:uid(), txt: isQ(f) && x === s.en ? x.replace(/\b(He|She|It|You|We|They)\b/g, m => m.toLowerCase()) : x }));
  const ct = cards.map(c => c.txt);
  let distract = null;
  const ms = fxMutants(S).filter(m => m.toks.length === S.toks.length);
  for (const m of shuffle(ms)) {
    const gi = m.toks.findIndex((w, i) => w !== S.toks[i]);
    if (gi >= 0 && !ct.includes(m.toks[gi])) { distract = { txt:m.toks[gi], reason:m.reason }; cards.push({ id:uid(), txt:m.toks[gi], extra:1 }); break; }
  }
  return base(rule, 'build', { diff:2, f, formula:true, instr:`Собери формулу по памяти: ${FORM_RU[f]} · ${TENSE[t].name} · ${s.en}`, cards:shuffle(cards),
    accept:acceptSet([ct.join(' ') + (isQ(f) ? '?' : '')]), correct:S.text, distract, ctoks:ct, hint:TENSE[t].meaning });
}

/* ---------- урок-повторение после 3 ошибок ---------- */
function genLesson(ruleId) {
  const r = RULES[ruleId];
  return { id:uid(), type:'lesson', rule:ruleId, t:r.t, chip:TENSE[r.t].name, instr:'Короткий разбор правила' };
}

/* ---------- диспетчер ---------- */
const MECH_DIFF = { choice:2, tf:1, multi:3, fix:3, build:3, input:3, translate:4, chat:3, timeline:3, swapc:2, stat:2, ingc:2, two:3, fchoice:1, fbuild:2 };
function genSpec(rule, spec, diff) {
  const [m, a, b, c] = spec;
  let t = null;
  switch (m) {
    case 'choice': t = genChoice(rule, a, b || [], c || {}, diff || 2); break;
    case 'tf': t = genTF(rule, a, b || [], c || {}); break;
    case 'multi': t = genMulti(rule, a, b || [], c || {}); break;
    case 'fix': t = genFix(rule, a, b || [], c || {}); break;
    case 'build': t = genBuild(rule, a, b, c || {}); break;
    case 'input': t = genInput(rule, a, c || {}); break;
    case 'translate': t = genTranslate(rule); break;
    case 'chat': t = genChat(rule); break;
    case 'timeline': t = genTimeline(rule, a || rule.t); break;
    case 'swapc': t = genSwapc(rule, a || rule.t); break;
    case 'stat': t = genStat(rule, a); break;
    case 'ingc': t = genIngc(rule); break;
    case 'two': t = genTwo(rule, a); break;
    case 'fchoice': t = genFChoice(rule); break;
    case 'fbuild': t = genFBuild(rule); break;
  }
  if (t) { t.mech = m; if (diff && !t.diff) t.diff = diff; }
  return t;
}
function specFits(rule, spec, stage) {
  const [m, f] = spec;
  if (stage === 'formula') return rule.cat === 'fx';
  if (rule.cat === 'fx') return false;
  switch (stage) {
    case 'pos': return f === 'pos' || m === 'ingc';
    case 'neg': return f === 'neg';
    case 'q': return f === 'q' || f === 'wh' || f === 'choiceq';
    case 'fix': return m === 'fix' || m === 'tf';
    case 'dist': return ['timeline','swapc','stat','multi','two'].includes(m);
    case 'free': return ['translate','chat','input','build'].includes(m);
    case 'easy': return ['choice','tf','swapc','stat','ingc'].includes(m) || (m === 'two' && f !== 'build');
    case 'quick': return ['choice','tf','swapc','stat','ingc','fix'].includes(m) || (m === 'two' && f !== 'build');
  }
  return true;
}
function genForRule(id, opt = {}) {
  const r = RULES[id]; if (!r) return null;
  let specs = r.gens.filter(s => !opt.stage || specFits(r, s, opt.stage));
  if (opt.maxDiff) { const e = specs.filter(s => MECH_DIFF[s[0]] <= opt.maxDiff); if (e.length) specs = e; }
  if (opt.notMech) { const e = specs.filter(s => s[0] !== opt.notMech); if (e.length) specs = e; }
  if (!specs.length) specs = r.gens;
  for (const s of shuffle(specs)) { const t = genSpec(r, s, opt.diff); if (t) return t; }
  return null;
}

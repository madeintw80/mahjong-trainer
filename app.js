/* app.js — 出題 / 作答 / 統計
   兩種模式：'eff' 牌效率(何切る) 依賴 engine.js；'def' 防守(讀安全牌) 依賴 defense.js
   白話解釋兩邊都用 explain.js */
'use strict';

const APP_VERSION = 'v0.2.1';

// ---- 難度標籤(依模式不同) ----
const DIFF_LABELS = {
  eff: ['入門 · 聽牌/一向聽', '進階 · 二向聽', '混合'],
  def: ['入門 · 有安全牌', '進階 · 全險牌/副露', '混合'],
};
// 牌效率各難度對應的向聽範圍
const EFF_RANGE = [{ lo: 0, hi: 1 }, { lo: 2, hi: 2 }, { lo: 0, hi: 2 }];

// ---- 全域狀態 ----
let mode = 'eff';       // 'eff' | 'def'
let level = 0;          // 0 入門 / 1 進階 / 2 混合
let answered = false;   // 目前這題答過了沒
let problem = null;     // 牌效率題
let defProblem = null;  // 防守題

// ---- 統計(分模式各存一份) ----
const STATS_KEY = 'mj_stats_v2';
let allStats = loadStats();
function blankOne() { return { total: 0, correct: 0, streak: 0, best: 0 }; }
function loadStats() {
  try { const s = JSON.parse(localStorage.getItem(STATS_KEY)); if (s && s.eff && s.def) return s; } catch (e) {}
  return { eff: blankOne(), def: blankOne() };
}
function saveStats() { localStorage.setItem(STATS_KEY, JSON.stringify(allStats)); }
function stats() { return allStats[mode]; }
function renderStats() {
  const s = stats();
  document.getElementById('st-total').textContent = s.total;
  document.getElementById('st-acc').textContent = s.total ? Math.round(s.correct / s.total * 100) + '%' : '—';
  document.getElementById('st-streak').textContent = s.streak;
  document.getElementById('st-best').textContent = s.best;
}

// ---- 小工具 ----
function randint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function shuffle(arr) {                                  // Fisher–Yates 洗牌
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
function fullWall() { const w = []; for (let i = 0; i < 34; i++) for (let k = 0; k < 4; k++) w.push(i); return w; }
function shantenText(s) { return s === 0 ? '聽牌' : s + ' 向聽'; }

// ---- 畫一張牌(兩模式共用；extra 加額外 class 如 'sm' 小牌) ----
const HONOR_CLASS = { 31: 'red', 32: 'green', 33: 'white' }; // 中/發/白 上色
function makeTile(i, extra) {
  const el = document.createElement('div');
  const suit = MJ.tileSuit(i);
  const suitClass = suit === 's' ? 's-suit' : suit;
  el.className = 'tile ' + suitClass + (extra ? ' ' + extra : '');
  el.dataset.index = i;
  if (i >= 27) {
    el.classList.add('honor');
    if (HONOR_CLASS[i]) el.classList.add(HONOR_CLASS[i]);
    el.innerHTML = '<span class="n">' + MJ.tileLabel(i) + '</span>';
  } else {
    el.innerHTML = '<span class="n">' + MJ.tileNum(i) + '</span><span class="s">' +
      ({ m: '萬', p: '筒', s: '索' })[suit] + '</span>';
  }
  return el;
}

// =====================================================================
//  牌效率模式
// =====================================================================
function drawHand(n) {
  const wall = shuffle(fullWall());
  const counts = new Array(34).fill(0);
  for (let k = 0; k < n; k++) counts[wall[k]]++;
  return counts;
}

// 出題：隨機 17 張，篩成「有選擇差異」的牌效率題
function genProblem() {
  MJ._clearMemo();
  const range = EFF_RANGE[level];
  for (let tries = 0; tries < 800; tries++) {
    const counts = drawHand(17);
    const s17 = MJ.shanten(counts);
    if (s17 < range.lo || s17 > range.hi) continue;
    const best = MJ.bestDiscards(counts);
    const minSh = best[0].shanten;
    const bestUk = best[0].ukeireTotal;
    const optimal = best.filter(b => b.shanten === minSh && b.ukeireTotal === bestUk).map(b => b.discard);
    const hasWorse = best.some(b => b.shanten > minSh || b.ukeireTotal < bestUk);
    if (!hasWorse) continue;
    if (optimal.length > 3) continue;
    return { counts, best, minSh, bestUk, optimal };
  }
  const counts = drawHand(17);
  const best = MJ.bestDiscards(counts);
  const minSh = best[0].shanten, bestUk = best[0].ukeireTotal;
  return { counts, best, minSh, bestUk, optimal: best.filter(b => b.shanten === minSh && b.ukeireTotal === bestUk).map(b => b.discard) };
}

function renderProblem() {
  answered = false;
  const hand = document.getElementById('hand');
  hand.innerHTML = '';
  for (let i = 0; i < 34; i++) {
    for (let k = 0; k < problem.counts[i]; k++) {
      const el = makeTile(i);
      el.addEventListener('click', () => onPick(i, el));
      hand.appendChild(el);
    }
  }
  document.getElementById('hint').textContent = '點下面你想打掉的牌';
  document.getElementById('result').hidden = true;
}

function onPick(idx, el) {
  if (answered) return;
  answered = true;
  const entry = problem.best.find(b => b.discard === idx);
  const isOptimal = problem.optimal.includes(idx);
  const sameShanten = entry.shanten === problem.minSh;

  const s = stats(); s.total++;
  if (isOptimal) { s.correct++; s.streak++; if (s.streak > s.best) s.best = s.streak; }
  else { s.streak = 0; }
  saveStats(); renderStats();

  markHand('#hand', idx, el, problem.optimal, isOptimal);
  renderResult(entry, isOptimal, sameShanten);
}

function renderResult(entry, isOptimal, sameShanten) {
  const verdict = document.getElementById('verdict');
  verdict.className = 'verdict ' + (isOptimal ? 'good' : sameShanten ? 'mid' : 'bad');
  if (isOptimal) {
    verdict.innerHTML = '🎯 完美！這就是進張最多的打法（' + shantenText(problem.minSh) + '，進張 ' + problem.bestUk + ' 張）';
  } else if (sameShanten) {
    verdict.innerHTML = '🟡 可惜，同樣是' + shantenText(problem.minSh) +
      '，但進張少了：你 ' + entry.ukeireTotal + ' 張 vs 最佳 ' + problem.bestUk + ' 張';
  } else {
    verdict.innerHTML = '❌ 退步了：這張變成 ' + shantenText(entry.shanten) + '，最佳其實可到 ' + shantenText(problem.minSh);
  }

  renderExplain('#explain', MJExplain.efficiency(problem, entry));

  // 進張排行表
  let rows = '';
  for (const b of problem.best) {
    const opt = problem.optimal.includes(b.discard);
    const you = b.discard === entry.discard;
    const cls = (opt ? 'opt ' : '') + (you ? 'you' : '');
    const tags = (opt ? '<span class="tag opt">最佳</span> ' : '') + (you ? '<span class="tag you">你</span>' : '');
    const ukNames = b.ukeireTiles.length ? b.ukeireTiles.map(MJ.tileLabel).join(' ') : '—';
    rows += '<tr class="' + cls + '"><td>' + MJ.tileLabel(b.discard) + ' ' + tags +
      '</td><td class="sh">' + shantenText(b.shanten) + '</td><td>' + b.ukeireTotal + ' 張</td><td class="uk-tiles">' + ukNames + '</td></tr>';
  }
  document.getElementById('rank').innerHTML =
    '<table><tr><th>丟這張</th><th>結果</th><th>進張</th><th>聽/進 哪些牌</th></tr>' + rows + '</table>';

  showResult('#result');
}

// =====================================================================
//  防守模式
// =====================================================================
// 從剩牌 rest 湊一個副露(碰優先，preferBig 先找三元/風牌讓玩家練大牌警示)
function makeMeldFrom(rest, preferBig) {
  const cnt = new Array(34).fill(0);
  for (const t of rest) cnt[t]++;
  if (preferBig) {
    for (const t of [31, 32, 33, 27, 28, 29, 30]) if (cnt[t] >= 3) return { type: 'pon', tiles: [t, t, t] };
  }
  const pons = [];
  for (let t = 0; t < 34; t++) if (cnt[t] >= 3) pons.push(t);
  if (pons.length) { const t = pons[randint(0, pons.length - 1)]; return { type: 'pon', tiles: [t, t, t] }; }
  for (let s = 0; s < 3; s++) for (let p = 0; p <= 6; p++) {
    const a = s * 9 + p; if (cnt[a] && cnt[a + 1] && cnt[a + 2]) return { type: 'chi', tiles: [a, a + 1, a + 2] };
  }
  return null;
}

// 防守出題：手牌 17 + 對手牌河 + 副露，篩成有風險落差的題
function genDefenseProblem() {
  for (let tries = 0; tries < 600; tries++) {
    const wall = shuffle(fullWall());
    const hand = new Array(34).fill(0);
    for (let k = 0; k < 17; k++) hand[wall[k]]++;
    let idx = 17;
    const riverLen = level === 0 ? randint(8, 12) : randint(5, 9);
    const river = wall.slice(idx, idx + riverLen); idx += riverLen;
    const rest = wall.slice(idx);

    const melds = [];
    if (level >= 1 && Math.random() < (level === 1 ? 0.7 : 0.5)) {
      const md = makeMeldFrom(rest, true); if (md) melds.push(md);
      if (Math.random() < 0.25) { const md2 = makeMeldFrom(rest, false); if (md2) melds.push(md2); }
    }

    const ranked = MJDefense.rankDiscards(hand, river, melds.length ? melds : null);
    const minRisk = ranked[0].risk;
    const maxRisk = ranked[ranked.length - 1].risk;
    if (maxRisk - minRisk < 40) continue;            // 沒明顯差別=無聊題
    if (level === 0 && minRisk > 12) continue;       // 入門要有安全牌可打
    if (level === 1 && minRisk === 0) continue;      // 進階不白送現物
    const optimal = ranked.filter(r => r.risk === minRisk).map(r => r.tile);
    if (optimal.length > 6) continue;                // 並列最安全太多=太好猜
    return { hand, river, melds, ranked, minRisk, optimal };
  }
  // 放寬保底
  const wall = shuffle(fullWall());
  const hand = new Array(34).fill(0); for (let k = 0; k < 17; k++) hand[wall[k]]++;
  const river = wall.slice(17, 27);
  const ranked = MJDefense.rankDiscards(hand, river, null);
  const minRisk = ranked[0].risk;
  return { hand, river, melds: [], ranked, minRisk, optimal: ranked.filter(r => r.risk === minRisk).map(r => r.tile) };
}

function renderOppo() {
  const oppo = document.getElementById('oppo');
  oppo.innerHTML = '';
  // 對手牌河
  const rr = document.createElement('div'); rr.className = 'oppo-row';
  rr.innerHTML = '<span class="oppo-label">對手捨牌河（丟過的＝現物，絕對安全）</span>';
  const rt = document.createElement('div'); rt.className = 'oppo-tiles';
  for (const t of defProblem.river) rt.appendChild(makeTile(t, 'sm'));
  rr.appendChild(rt); oppo.appendChild(rr);
  // 副露
  if (defProblem.melds.length) {
    const mr = document.createElement('div'); mr.className = 'oppo-row';
    mr.innerHTML = '<span class="oppo-label">對手副露（亮出來的牌）</span>';
    const mt = document.createElement('div'); mt.className = 'oppo-tiles';
    for (const md of defProblem.melds) {
      const g = document.createElement('div'); g.className = 'meld';
      for (const t of md.tiles) g.appendChild(makeTile(t, 'sm'));
      mt.appendChild(g);
    }
    mr.appendChild(mt); oppo.appendChild(mr);
  }
}

function renderDefenseProblem() {
  answered = false;
  renderOppo();
  const hand = document.getElementById('def-hand');
  hand.innerHTML = '';
  for (let i = 0; i < 34; i++) {
    for (let k = 0; k < defProblem.hand[i]; k++) {
      const el = makeTile(i);
      el.addEventListener('click', () => onPickDefense(i, el));
      hand.appendChild(el);
    }
  }
  document.getElementById('def-hint').textContent = '點你想打（覺得最安全）的牌';
  document.getElementById('def-result').hidden = true;
}

function onPickDefense(idx, el) {
  if (answered) return;
  answered = true;
  const entry = defProblem.ranked.find(r => r.tile === idx);
  const isSafe = defProblem.optimal.includes(idx);
  const pos = defProblem.ranked.findIndex(r => r.tile === idx) + 1;

  const s = stats(); s.total++;
  if (isSafe) { s.correct++; s.streak++; if (s.streak > s.best) s.best = s.streak; }
  else { s.streak = 0; }
  saveStats(); renderStats();

  markHand('#def-hand', idx, el, defProblem.optimal, isSafe);
  renderDefenseResult(entry, isSafe, pos);
}

// 風險數字 → 危險等級 class(著色用)
function riskClass(r) { return r === 0 ? 'r0' : r <= 20 ? 'r1' : r <= 50 ? 'r2' : 'r3'; }
// 一張牌「還活著」的牌型摘要(表格用簡短版)
const SHAPE_CN = { ryanmen: '兩面', kanchan: '嵌張', penchan: '邊張', shanpon: '雙碰', tanki: '單騎' };
function shortNote(r) {
  if (r.genbutsu) return '現物·絕對安全';
  const alive = [...new Set(r.shapes.filter(s => s.alive).map(s => SHAPE_CN[s.type]))];
  const note = alive.length ? alive.join('·') : '幾乎安全';
  return MJDefense.isHonor(r.tile) ? ('字牌見' + r.seen + '·' + note) : note;
}

function renderDefenseResult(entry, isSafe, pos) {
  const verdict = document.getElementById('def-verdict');
  verdict.className = 'verdict ' + (isSafe ? 'good' : entry.risk <= 20 ? 'mid' : 'bad');
  if (isSafe) {
    verdict.innerHTML = '🛡️ 安全！這是最不會放槍的打法（' + entry.headline +
      (entry.genbutsu ? '' : '，風險 ' + entry.risk) + '）';
  } else {
    verdict.innerHTML = '⚠️ 有點險：你打的風險 ' + entry.risk + '（第 ' + pos + ' 安全），最安全只要 ' +
      defProblem.minRisk + '，差 ' + (entry.risk - defProblem.minRisk);
  }

  renderExplain('#def-explain', MJExplain.defense(defProblem.ranked, entry.tile));

  // 放槍風險排行表
  let rows = '';
  for (const r of defProblem.ranked) {
    const opt = defProblem.optimal.includes(r.tile);
    const you = r.tile === entry.tile;
    const cls = (opt ? 'opt ' : '') + (you ? 'you' : '');
    const tags = (opt ? '<span class="tag opt">最安全</span> ' : '') + (you ? '<span class="tag you">你</span>' : '');
    const warn = (r.warnings && r.warnings.length) ? ' <span class="tag warn">⚠️</span>' : '';
    rows += '<tr class="' + cls + '"><td>' + MJDefense.tileName(r.tile) + ' ' + tags + '</td>' +
      '<td class="sh">' + r.headline + '</td>' +
      '<td><span class="risk ' + riskClass(r.risk) + '">' + r.risk + '</span></td>' +
      '<td class="uk-tiles">' + shortNote(r) + warn + '</td></tr>';
  }
  document.getElementById('def-rank').innerHTML =
    '<table><tr><th>丟這張</th><th>分類</th><th>風險</th><th>還能被什麼胡</th></tr>' + rows + '</table>';

  showResult('#def-result');
}

// =====================================================================
//  共用：標記手牌 / 顯示解釋 / 顯示結果卡
// =====================================================================
function markHand(sel, pickedIdx, pickedEl, optimal, pickedIsBest) {
  document.querySelectorAll(sel + ' .tile').forEach(t => {
    const ti = +t.dataset.index;
    t.classList.add('locked');
    if (t === pickedEl) t.classList.add(pickedIsBest ? 'pickbest' : 'picked');
    else if (optimal.includes(ti)) t.classList.add('best');
    else t.classList.add('dim');
  });
}
function renderExplain(sel, bullets) {
  const ul = document.querySelector(sel);
  ul.innerHTML = bullets.map(b => '<li>' + b + '</li>').join('');
}
function showResult(sel) {
  const r = document.querySelector(sel);
  r.hidden = false;
  r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// =====================================================================
//  下一題 / 模式 / 難度 / 啟動
// =====================================================================
function nextProblem() {
  if (mode === 'eff') { problem = genProblem(); renderProblem(); }
  else { defProblem = genDefenseProblem(); renderDefenseProblem(); }
}

function updateDiffLabels() {
  const btns = document.querySelectorAll('.diff');
  btns.forEach((b, i) => { b.textContent = DIFF_LABELS[mode][i]; });
}
function updateNote() {
  document.getElementById('note').innerHTML = mode === 'eff'
    ? '<b>牌效率</b>：練「進張最多」的直覺。對局還要看安全牌與場況——切到 🛡️ 防守 練「少放槍」。'
    : '<b>防守</b>：假設對手已聽牌，練「讀安全牌」。風險是教學相對分（現物 0 → 無筋中張最高），非真實放槍率；筋只擋兩面，嵌張/單騎照樣中。';
}

function setMode(m) {
  mode = m;
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  document.querySelectorAll('.mode-eff').forEach(el => el.classList.toggle('hide', m !== 'eff'));
  document.querySelectorAll('.mode-def').forEach(el => el.classList.toggle('hide', m !== 'def'));
  updateDiffLabels();
  updateNote();
  renderStats();
  nextProblem();
}

function setLevel(l) {
  level = l;
  document.querySelectorAll('.diff').forEach(b => b.classList.toggle('on', +b.dataset.level === l));
  nextProblem();
}

function init() {
  document.getElementById('ver').textContent = APP_VERSION;
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('.diff').forEach(b => b.addEventListener('click', () => setLevel(+b.dataset.level)));
  document.getElementById('next').addEventListener('click', nextProblem);
  document.getElementById('def-next').addEventListener('click', nextProblem);

  updateDiffLabels();
  updateNote();
  renderStats();
  nextProblem();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);

/* app.js — 出題 / 作答 / 統計
   三種模式：
     'eff' 牌效率(何切る)      依賴 engine.js
     'def' 防守(讀安全牌)      依賴 defense.js
     'lab' 牌理(橫飛教學)      依賴 engine.js，內含三子題型 atk/iso/wait
   白話解釋三邊都用 explain.js */
'use strict';

const APP_VERSION = 'v0.3.0';

// ---- 難度標籤(牌效率/防守用；牌理改用子題型 bar) ----
const DIFF_LABELS = {
  eff: ['入門 · 聽牌/一向聽', '進階 · 二向聽', '混合'],
  def: ['入門 · 有安全牌', '進階 · 全險牌/副露', '混合'],
};
// 牌效率各難度對應的向聽範圍
const EFF_RANGE = [{ lo: 0, hi: 1 }, { lo: 2, hi: 2 }, { lo: 0, hi: 2 }];

// 牌理點牌題(②孤張/③選聽)的題目提示文字
const SUB_PROMPT = {
  iso: '手上有<b>好幾張孤張</b>（落單牌）——先丟哪張最不虧？',
  wait: '這手能<b>聽牌</b>了，但有好幾種聽法——丟哪張<b>聽得最寬</b>？',
};

// ---- 全域狀態 ----
let mode = 'eff';       // 'eff' | 'def' | 'lab'
let level = 0;          // 0 入門 / 1 進階 / 2 混合(牌效率/防守用)
let sub = 'atk';        // 牌理子題型 'atk' | 'iso' | 'wait'
let answered = false;   // 目前這題答過了沒
let problem = null;     // 牌效率題
let defProblem = null;  // 防守題
let atkProblem = null;  // 牌理·該攻該守題
let pickProblem = null; // 牌理·孤張/選聽題(點牌題，共用)

// ---- 統計(分模式各存一份) ----
const STATS_KEY = 'mj_stats_v2';
let allStats = loadStats();
function blankOne() { return { total: 0, correct: 0, streak: 0, best: 0 }; }
function loadStats() {
  // 讀舊資料並「補齊」缺的模式 key(相容 v0.2 只有 eff/def 的存檔，保留舊數據)
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch (e) {}
  for (const m of ['eff', 'def', 'lab']) if (!s[m]) s[m] = blankOne();
  return s;
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
// 導入橫飛術語：向聽數 = 幾進聽(0 進聽 = 已聽牌)
function shantenText(s) { return s === 0 ? '聽牌' : s + ' 進聽'; }
function jinTing(s) { return s === 0 ? '已聽牌' : s + ' 進聽'; }

// ---- 畫一張牌(各模式共用；extra 加額外 class 如 'sm' 小牌) ----
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
//  點牌題通用引擎 (牌效率 eff + 牌理孤張 iso + 牌理選聽 wait 共用)
//  三者互動完全相同(點手牌選最佳丟牌)、problem 結構相同，只差
//  出題函式、DOM 容器(cfg)、白話解釋(cfg.explainFn) 不同
// =====================================================================
function drawHand(n) {
  const wall = shuffle(fullWall());
  const counts = new Array(34).fill(0);
  for (let k = 0; k < n; k++) counts[wall[k]]++;
  return counts;
}

// 牌效率出題：隨機 17 張，篩成「有選擇差異」的題
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

// 通用：把一手牌鋪成可點的牌，點下去 → onPickTile
function renderPick(prob, cfg) {
  answered = false;
  const hand = document.getElementById(cfg.hand);
  hand.innerHTML = '';
  for (let i = 0; i < 34; i++) {
    for (let k = 0; k < prob.counts[i]; k++) {
      const el = makeTile(i);
      el.addEventListener('click', () => onPickTile(i, el, prob, cfg));
      hand.appendChild(el);
    }
  }
  document.getElementById(cfg.result).hidden = true;
}

function onPickTile(idx, el, prob, cfg) {
  if (answered) return;
  answered = true;
  const entry = prob.best.find(b => b.discard === idx);
  const isOptimal = prob.optimal.includes(idx);
  const sameShanten = entry.shanten === prob.minSh;

  const s = stats(); s.total++;
  if (isOptimal) { s.correct++; s.streak++; if (s.streak > s.best) s.best = s.streak; }
  else { s.streak = 0; }
  saveStats(); renderStats();

  markHand('#' + cfg.hand, idx, el, prob.optimal, isOptimal);
  renderPickResult(prob, entry, isOptimal, sameShanten, cfg);
}

function renderPickResult(prob, entry, isOptimal, sameShanten, cfg) {
  const isTenpai = prob.minSh === 0;                    // 聽牌題(③選聽)措辭用「聽」
  const ukWord = isTenpai ? '聽' : '進張';
  const bestWord = isTenpai ? '聽最寬' : '進張最多';

  const verdict = document.getElementById(cfg.verdict);
  verdict.className = 'verdict ' + (isOptimal ? 'good' : sameShanten ? 'mid' : 'bad');
  if (isOptimal) {
    verdict.innerHTML = '🎯 完美！這就是' + bestWord + '的打法（' + shantenText(prob.minSh) + '，' + ukWord + ' ' + prob.bestUk + ' 張）';
  } else if (sameShanten) {
    verdict.innerHTML = '🟡 可惜，同樣是' + shantenText(prob.minSh) +
      '，但' + ukWord + '少了：你 ' + entry.ukeireTotal + ' 張 vs 最佳 ' + prob.bestUk + ' 張';
  } else {
    verdict.innerHTML = '❌ 退步了：這張變成 ' + shantenText(entry.shanten) + '，最佳其實可到 ' + shantenText(prob.minSh);
  }

  renderExplain('#' + cfg.explain, cfg.explainFn(prob, entry));

  // 進張/聽張排行表
  let rows = '';
  for (const b of prob.best) {
    const opt = prob.optimal.includes(b.discard);
    const you = b.discard === entry.discard;
    const cls = (opt ? 'opt ' : '') + (you ? 'you' : '');
    const tags = (opt ? '<span class="tag opt">最佳</span> ' : '') + (you ? '<span class="tag you">你</span>' : '');
    const ukNames = b.ukeireTiles.length ? b.ukeireTiles.map(MJ.tileLabel).join(' ') : '—';
    rows += '<tr class="' + cls + '"><td>' + MJ.tileLabel(b.discard) + ' ' + tags +
      '</td><td class="sh">' + shantenText(b.shanten) + '</td><td>' + b.ukeireTotal + ' 張</td><td class="uk-tiles">' + ukNames + '</td></tr>';
  }
  document.getElementById(cfg.rank).innerHTML =
    '<table><tr><th>丟這張</th><th>結果</th><th>' + ukWord + '</th><th>聽/進 哪些牌</th></tr>' + rows + '</table>';

  showResult('#' + cfg.result);
}

// 牌效率模式的容器設定
const EFF_CFG = {
  hand: 'hand', result: 'result', verdict: 'verdict', explain: 'explain', rank: 'rank',
  explainFn: (p, e) => MJExplain.efficiency(p, e),
};
// 牌理點牌題(孤張/選聽共用同組 DOM，只換解釋函式)
function pickCfg() {
  return {
    hand: 'pick-hand', result: 'pick-result', verdict: 'pick-verdict', explain: 'pick-explain', rank: 'pick-rank',
    explainFn: sub === 'iso' ? (p, e) => MJExplain.efficiencyIso(p, e) : (p, e) => MJExplain.efficiencyWait(p, e),
  };
}

// =====================================================================
//  牌理 · ① 該攻該守 (判斷題，用 shanten/幾進聽 判定)
// =====================================================================
// 發 16 張手牌，篩成「明確該攻(0-3進聽)或明確該守(6+進聽)」的題
// 避開 4-5 進聽的灰色地帶，答案才客觀無爭議
function genAtk() {
  MJ._clearMemo();
  const wantAttack = Math.random() < 0.5;               // 攻題/守題各半，體驗均衡
  for (let tries = 0; tries < 2500; tries++) {
    const counts = drawHand(16);
    const s = MJ.shanten(counts);
    if (wantAttack ? s <= 3 : s >= 6) {
      return { counts, shanten: s, answer: s <= 3 ? 'atk' : 'def' };
    }
  }
  // 保底(幾乎不會到)：直接判當前手牌
  const counts = drawHand(16);
  const s = MJ.shanten(counts);
  return { counts, shanten: s, answer: s <= 3 ? 'atk' : 'def' };
}

function renderAtk() {
  answered = false;
  const hand = document.getElementById('atk-hand');
  hand.innerHTML = '';
  for (let i = 0; i < 34; i++)
    for (let k = 0; k < atkProblem.counts[i]; k++) {
      const el = makeTile(i);
      el.classList.add('locked');                       // 判斷題：手牌只展示、不可點
      hand.appendChild(el);
    }
  document.querySelectorAll('#atk-card .choice').forEach(b => b.classList.remove('locked', 'correct', 'wrong'));
  document.getElementById('atk-result').hidden = true;
}

function onAnswerAtk(ans) {
  if (answered) return;
  answered = true;
  const correct = ans === atkProblem.answer;

  const s = stats(); s.total++;
  if (correct) { s.correct++; s.streak++; if (s.streak > s.best) s.best = s.streak; }
  else { s.streak = 0; }
  saveStats(); renderStats();

  // 標記按鈕：正解變綠、答錯的選項變紅
  document.querySelectorAll('#atk-card .choice').forEach(b => {
    b.classList.add('locked');
    if (b.dataset.ans === atkProblem.answer) b.classList.add('correct');
    if (b.dataset.ans === ans && !correct) b.classList.add('wrong');
  });
  renderAtkResult(correct);
}

function renderAtkResult(correct) {
  const s = atkProblem.shanten;
  const verdict = document.getElementById('atk-verdict');
  verdict.className = 'verdict ' + (correct ? 'good' : 'bad');
  const tag = atkProblem.answer === 'atk' ? '好牌該攻' : '爛牌該守';
  verdict.innerHTML = (correct ? '🎯 答對！' : '❌ 答錯了，') + '這手是 ' + jinTing(s) + ' → ' + tag;
  renderExplain('#atk-explain', MJExplain.attackDefense(atkProblem));
  showResult('#atk-result');
}

// =====================================================================
//  牌理 · ② 先丟哪張孤張 (點牌題，聚焦孤張選擇)
// =====================================================================
// 找出「孤張」：正好一張、且左右2格內沒有同花色的牌可連(字牌單張也算)
function isolatedTiles(counts) {
  const iso = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i] !== 1) continue;                      // 對子/刻子不是孤張
    if (i >= 27) { iso.push(i); continue; }             // 字牌單張 = 孤張
    const suit = Math.floor(i / 9);
    let connected = false;
    for (let d = -2; d <= 2; d++) {                     // 看左右2格內有沒有同花色的牌
      if (d === 0) continue;
      const j = i + d;
      if (j < 0 || j >= 27) continue;
      if (Math.floor(j / 9) !== suit) continue;         // 跨花色不能連
      if (counts[j] > 0) { connected = true; break; }
    }
    if (!connected) iso.push(i);                        // 附近沒牌 = 孤張
  }
  return iso;
}

// 篩題：手牌有多張孤張，且丟不同孤張「進張差異明顯」→ 教連接力(中張留最後)
function genIso() {
  MJ._clearMemo();
  for (let tries = 0; tries < 2500; tries++) {
    const counts = drawHand(17);
    const best = MJ.bestDiscards(counts);
    const minSh = best[0].shanten;
    if (minSh < 1 || minSh > 3) continue;               // 1~3進聽：孤張連接潛力才反映在進張上
    const iso = isolatedTiles(counts);
    if (iso.length < 2) continue;                       // 要有多張孤張才有得選
    // 全局最佳丟法必須就是「丟某張孤張」(這樣正解才聚焦孤張，不是拆搭)
    if (!iso.includes(best[0].discard)) continue;
    // 各孤張丟法(維持最小進聽)之間進張要有落差
    const isoEntries = best.filter(b => iso.includes(b.discard) && b.shanten === minSh);
    if (isoEntries.length < 2) continue;
    const uks = isoEntries.map(b => b.ukeireTotal);
    if (Math.max.apply(null, uks) - Math.min.apply(null, uks) < 3) continue;
    const bestUk = best[0].ukeireTotal;
    const optimal = best.filter(b => b.shanten === minSh && b.ukeireTotal === bestUk).map(b => b.discard);
    if (optimal.length > 3) continue;
    return { counts, best, minSh, bestUk, optimal, iso };
  }
  return genProblem();                                  // 保底：退回一般牌效率題(結構相容)
}

// =====================================================================
//  牌理 · ③ 選哪種聽法 (點牌題，聽牌時比聽寬)
// =====================================================================
// 隨機構造小工具：檢查/放一組牌(不超過每張 4 枚)
function canPlaceBlock(counts, tiles) {
  const tmp = counts.slice();
  for (const t of tiles) { tmp[t]++; if (tmp[t] > 4) return false; }
  return true;
}
function placeBlock(counts, tiles) { for (const t of tiles) counts[t]++; }

// 篩題：聽牌時有多種聽法、聽寬差異明顯 → 教雙頭>單吊
// ⚠️ 隨機發牌極難湊到聽牌(會卡死)，改「構造法」：主動蓋出 4面子+雀頭+選聽形，再用引擎驗證
function genWait() {
  MJ._clearMemo();
  for (let attempt = 0; attempt < 500; attempt++) {
    const counts = new Array(34).fill(0);
    // 1) 放 4 個面子(隨機順子或刻子)
    let ok = true;
    for (let m = 0; m < 4 && ok; m++) {
      let placed = false;
      for (let t = 0; t < 25 && !placed; t++) {
        let tiles;
        if (Math.random() < 0.72) {                     // 順子
          const a = randint(0, 2) * 9 + randint(0, 6); tiles = [a, a + 1, a + 2];
        } else {                                         // 刻子
          const k = randint(0, 33); tiles = [k, k, k];
        }
        if (canPlaceBlock(counts, tiles)) { placeBlock(counts, tiles); placed = true; }
      }
      if (!placed) ok = false;
    }
    if (!ok) continue;
    // 2) 放雀頭(對子)
    let pair = false;
    for (let t = 0; t < 25 && !pair; t++) {
      const k = randint(0, 33);
      if (canPlaceBlock(counts, [k, k])) { placeBlock(counts, [k, k]); pair = true; }
    }
    if (!pair) continue;
    // 3) 放「選聽形」= 兩面搭 + 隔一張(如 3,4,6)：提供「雙頭 vs 嵌張」取捨，非完整面子
    let shape = false;
    for (let t = 0; t < 25 && !shape; t++) {
      const a = randint(0, 2) * 9 + randint(0, 5);       // p 0~5，確保 a+3 不跨花色
      const tiles = [a, a + 1, a + 3];
      if (canPlaceBlock(counts, tiles)) { placeBlock(counts, tiles); shape = true; }
    }
    if (!shape) continue;
    // 4) 引擎驗證：剛好聽牌、多種聽法、聽寬差夠大
    if (counts.reduce((x, y) => x + y, 0) !== 17) continue;
    const best = MJ.bestDiscards(counts);
    if (best[0].shanten !== 0) continue;
    const tenpai = best.filter(b => b.shanten === 0);
    if (tenpai.length < 2) continue;
    const maxUk = tenpai[0].ukeireTotal, minUk = tenpai[tenpai.length - 1].ukeireTotal;
    if (maxUk - minUk < 3) continue;                    // 聽寬落差要明顯(雙頭 vs 單吊/嵌張)
    const optimal = tenpai.filter(b => b.ukeireTotal === maxUk).map(b => b.discard);
    if (optimal.length > 3) continue;
    return { counts, best, minSh: 0, bestUk: maxUk, optimal };
  }
  return genProblem();                                   // 保底(幾乎不會到)
}

// =====================================================================
//  防守模式 (完全沿用 v0.2，未改動)
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
//  下一題 / 模式 / 難度 / 子題型 / 啟動
// =====================================================================
function nextProblem() {
  if (mode === 'eff') {
    problem = genProblem();
    renderPick(problem, EFF_CFG);
  } else if (mode === 'def') {
    defProblem = genDefenseProblem();
    renderDefenseProblem();
  } else { // lab 牌理
    if (sub === 'atk') {
      atkProblem = genAtk();
      renderAtk();
    } else {
      pickProblem = sub === 'iso' ? genIso() : genWait();
      document.getElementById('pick-prompt').innerHTML = SUB_PROMPT[sub];
      renderPick(pickProblem, pickCfg());
    }
  }
}

function updateDiffLabels() {
  const btns = document.querySelectorAll('.diff');
  btns.forEach((b, i) => { b.textContent = DIFF_LABELS[mode][i]; });
}

// 底部說明文字(依模式/子題型變)
function updateNote() {
  let html;
  if (mode === 'eff') {
    html = '<b>牌效率</b>：練「進張最多」的直覺。對局還要看安全牌與場況——切到 🛡️ 防守 練「少放槍」。';
  } else if (mode === 'def') {
    html = '<b>防守</b>：假設對手已聽牌，練「讀安全牌」。風險是教學相對分（現物 0 → 無筋中張最高），非真實放槍率；筋只擋兩面，嵌張/單騎照樣中。';
  } else {
    const labNotes = {
      atk: '<b>牌理 · 攻守</b>：橫飛「快速原則」——手牌好壞用<b>幾進聽</b>量化。0~3 進聽是好牌該攻、6 進聽以上是爛牌該守；爛牌擺明快不起來，早點轉守才不放槍。',
      iso: '<b>牌理 · 孤張</b>：多張孤張先丟哪張？<b>字牌 &gt; 么九 &gt; 中張</b>——中張鄰牌多、連接潛力大，留最後；引擎用「丟掉後進張多寡」給客觀答案。',
      wait: '<b>牌理 · 選聽</b>：同樣聽牌，聽法差很多。<b>雙頭 &gt; 單吊</b>——兩面聽最多 8 張、單吊剩 3 張，胡牌機會差一倍多。',
    };
    html = labNotes[sub];
  }
  document.getElementById('note').innerHTML = html;
}

function setMode(m) {
  mode = m;
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  document.querySelectorAll('.mode-eff').forEach(el => el.classList.toggle('hide', m !== 'eff'));
  document.querySelectorAll('.mode-def').forEach(el => el.classList.toggle('hide', m !== 'def'));
  document.querySelectorAll('.mode-lab').forEach(el => el.classList.toggle('hide', m !== 'lab'));
  // 難度 bar 只在牌效率/防守顯示；牌理改顯示子題型 bar(一條 bar 兩用)
  document.getElementById('diffbar').classList.toggle('hide', m === 'lab');
  document.getElementById('subbar').classList.toggle('hide', m !== 'lab');
  if (m === 'lab') applyLabSub();                       // 決定 atk / pick 哪組卡顯示
  else updateDiffLabels();
  updateNote();
  renderStats();
  nextProblem();
}

// 牌理模式內：依 sub 顯示「判斷題卡(atk)」或「點牌題卡(iso/wait)」
function applyLabSub() {
  const showAtk = sub === 'atk';
  document.querySelectorAll('.sub-atk').forEach(el => el.classList.toggle('hide', !showAtk));
  document.querySelectorAll('.sub-pick').forEach(el => el.classList.toggle('hide', showAtk));
}

function setLevel(l) {
  level = l;
  document.querySelectorAll('.diff').forEach(b => b.classList.toggle('on', +b.dataset.level === l));
  nextProblem();
}

function setSub(s) {
  sub = s;
  document.querySelectorAll('.sub').forEach(b => b.classList.toggle('on', b.dataset.sub === s));
  applyLabSub();
  updateNote();
  nextProblem();
}

function init() {
  document.getElementById('ver').textContent = APP_VERSION;
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('.diff').forEach(b => b.addEventListener('click', () => setLevel(+b.dataset.level)));
  document.querySelectorAll('.sub').forEach(b => b.addEventListener('click', () => setSub(b.dataset.sub)));
  document.querySelectorAll('#atk-card .choice').forEach(b => b.addEventListener('click', () => onAnswerAtk(b.dataset.ans)));
  document.getElementById('next').addEventListener('click', nextProblem);
  document.getElementById('def-next').addEventListener('click', nextProblem);
  document.getElementById('atk-next').addEventListener('click', nextProblem);
  document.getElementById('pick-next').addEventListener('click', nextProblem);

  updateDiffLabels();
  updateNote();
  renderStats();
  nextProblem();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);

/* app.js — 出題 / 作答 / 統計
   三種模式：
     'eff' 牌效率(何切る)      依賴 engine.js
     'def' 防守(讀安全牌)      依賴 defense.js
     'lab' 牌理(橫飛教學)      依賴 engine.js，內含三子題型 atk/iso/wait
   白話解釋三邊都用 explain.js */
'use strict';

const APP_VERSION = 'v0.7.3';

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
let mode = 'eff';       // 'eff' | 'def' | 'read' | 'lab' | 'tips'
let level = 0;          // 0 入門 / 1 進階 / 2 混合(牌效率/防守用)
let sub = 'atk';        // 牌理子題型 'atk' | 'iso' | 'wait'
let rsub = 'press';     // 讀牌子題型 'press'(向下壓) | 'gua'(六掛) | 'nobe'(衍牌)
let answered = false;   // 目前這題答過了沒
let problem = null;     // 牌效率題
let defProblem = null;  // 防守題
let atkProblem = null;  // 牌理·該攻該守題
let pickProblem = null; // 牌理·孤張/選聽題(點牌題，共用)
let pressProblem = null;    // 讀牌·向下壓題
let readPickProblem = null; // 讀牌·六掛/衍牌題(點牌題，共用)

// ---- 統計(分模式各存一份) ----
const STATS_KEY = 'mj_stats_v2';
let allStats = loadStats();
function blankOne() { return { total: 0, correct: 0, streak: 0, best: 0 }; }
function loadStats() {
  // 讀舊資料並「補齊」缺的模式 key(相容 v0.2 只有 eff/def 的存檔，保留舊數據)
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch (e) {}
  for (const m of ['eff', 'def', 'read', 'lab']) if (!s[m]) s[m] = blankOne();
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
// 牌面圖由 tiles.js 的 MJTiles.face(i) 產生(自繪 SVG)，
// 外層 div 保留花色/honor/sm class 和 dataset.index → 選中/變暗回饋不受影響。
function makeTile(i, extra) {
  const el = document.createElement('div');
  const suit = MJ.tileSuit(i);
  const suitClass = suit === 's' ? 's-suit' : suit;
  el.className = 'tile ' + suitClass + (extra ? ' ' + extra : '');
  el.dataset.index = i;
  if (i >= 27) el.classList.add('honor');
  el.innerHTML = MJTiles.face(i);          // ← 疊上透明的 SVG 牌面
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

// 數牌牌牆(萬筒索共 27 種×4 張，不含字牌)。
// 為什麼要獨立一副：字牌孤張永遠「一律先丟」＝送分題，混進孤張章節會太簡單，
// 所以孤張題絕大多數只從這副數牌牆發牌(見 genIso)。
const NUMBER_WALL = (() => { const w = []; for (let i = 0; i < 27; i++) for (let k = 0; k < 4; k++) w.push(i); return w; })();
function drawFromWall(wall, n) {                          // 從指定牌牆抽 n 張(先 slice 複製再洗，不動到原牌牆)
  const w = shuffle(wall.slice());
  const counts = new Array(34).fill(0);
  for (let k = 0; k < n; k++) counts[w[k]]++;
  return counts;
}

// 牌效率出題：隨機 17 張，篩成「有選擇差異」的題
function genProblem() {
  MJ._clearMemo();
  const range = EFF_RANGE[level];
  // 牌效率題也把字牌大幅降低(比照孤張)：字牌孤張/廢張太好丟＝送分，練不到數牌取捨。
  // 絕大多數只發數牌，字牌僅保留 ~0.8% 出現率；deal() 迴圈與保底共用，字牌不會從保底漏進來。
  const dealHonors = Math.random() < 0.008;             // 這題是否容許字牌：約 0.8%(穩穩 < 1%)
  const deal = () => dealHonors ? drawHand(17) : drawFromWall(NUMBER_WALL, 17);
  for (let tries = 0; tries < 800; tries++) {
    const counts = deal();
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
  const counts = deal();
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
  // 孤張章節要教的是「數牌的連接潛力」(中張鄰牌多、留最後)。字牌孤張永遠先丟＝送分，
  // 混進來只會讓題目變簡單，所以絕大多數只從數牌牌牆發牌；字牌只保留極低出現率(< 1%)，
  // 偶爾複習「字牌先丟」的觀念。deal() 迴圈與保底共用，確保字牌不會從保底漏進來。
  const dealHonors = Math.random() < 0.008;             // 這題是否容許字牌：約 0.8%(留邊際，穩穩 < 1%)
  const deal = () => dealHonors ? drawHand(17) : drawFromWall(NUMBER_WALL, 17);
  for (let tries = 0; tries < 3500; tries++) {          // 只發數牌較難湊到「進張有落差」的題，tries 放寬一點
    const counts = deal();
    const iso = isolatedTiles(counts);                  // 先做便宜的孤張偵測(純掃 34 格)
    if (iso.length < 2) continue;                       // 不到 2 張孤張就跳過：免算下面昂貴的 bestDiscards，生題快 ~3 倍
    const best = MJ.bestDiscards(counts);               // 昂貴(算每張丟法的進張)：只在通過便宜篩選後才做
    const minSh = best[0].shanten;
    if (minSh < 1 || minSh > 3) continue;               // 1~3進聽：孤張連接潛力才反映在進張上
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
  // 保底：仍用同一副牌牆(不漏字牌)，退回結構相容的孤張題
  const counts = deal();
  const best = MJ.bestDiscards(counts);
  const minSh = best[0].shanten, bestUk = best[0].ukeireTotal;
  const optimal = best.filter(b => b.shanten === minSh && b.ukeireTotal === bestUk).map(b => b.discard);
  return { counts, best, minSh, bestUk, optimal, iso: isolatedTiles(counts) };
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
  let chosen = null;                                     // 先選出副露，最後才從 rest 扣掉用到的牌
  if (preferBig) {
    for (const t of [31, 32, 33, 27, 28, 29, 30]) if (cnt[t] >= 3) { chosen = { type: 'pon', tiles: [t, t, t] }; break; }
  }
  if (!chosen) {
    const pons = [];
    for (let t = 0; t < 34; t++) if (cnt[t] >= 3) pons.push(t);
    if (pons.length) { const t = pons[randint(0, pons.length - 1)]; chosen = { type: 'pon', tiles: [t, t, t] }; }
  }
  if (!chosen) {
    for (let s = 0; s < 3 && !chosen; s++) for (let p = 0; p <= 6 && !chosen; p++) {
      const a = s * 9 + p; if (cnt[a] && cnt[a + 1] && cnt[a + 2]) chosen = { type: 'chi', tiles: [a, a + 1, a + 2] };
    }
  }
  if (!chosen) return null;
  // 🔴 把選中的牌從 rest 移除，否則第二個副露會重複拿同一批剩牌(紅中×7 bug：中中中+中中中=6張中，超過上限4)
  for (const t of chosen.tiles) { const k = rest.indexOf(t); if (k >= 0) rest.splice(k, 1); }
  return chosen;
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
//  讀牌模式 (readdiscard.js；從對手捨牌河反推危險/安全，機率讀牌)
//  三子題型：press 向下壓(門選判斷) / gua 六掛(點牌選最危險) / nobe 衍牌(點牌選最危險)
// =====================================================================
const READ_PROMPT = {
  gua: '看對手<b>依序</b>的捨牌河（左早右晚）——下面哪張<b>最危險</b>？（最晚出現、或整段沒出現的掛都危險）',
  nobe: '對手剛<b>拆搭</b>打出一張牌——他要的牌最可能是<b>哪一張</b>？',
};

// ---- 通用：把一串牌鋪進某容器當「對手牌河」展示(小牌；numbered=標巡數給六掛用) ----
function renderRiverInto(containerId, river, label, numbered) {
  const box = document.getElementById(containerId);
  box.innerHTML = '';
  const row = document.createElement('div'); row.className = 'oppo-row';
  row.innerHTML = '<span class="oppo-label">' + label + '</span>';
  const tiles = document.createElement('div'); tiles.className = 'oppo-tiles';
  river.forEach((t, i) => {
    const el = makeTile(t, 'sm');
    if (numbered) {                                     // 六掛要看順序 → 每張標第幾巡
      const wrap = document.createElement('div'); wrap.className = 'turn-wrap';
      const no = document.createElement('span'); no.className = 'turn-no'; no.textContent = i + 1;
      wrap.appendChild(el); wrap.appendChild(no); tiles.appendChild(wrap);
    } else {
      tiles.appendChild(el);
    }
  });
  row.appendChild(tiles); box.appendChild(row);
}

// =========================== ① 向下壓 press ===========================
// 從 pressAnalyze 結果蒐集所有「安全半掛」= {suit, half}('low'=小掛1-4 / 'high'=大掛6-9)
function collectSafeHalves(res) {
  const answers = [];
  for (const r of res) {
    if (r.low_safe) answers.push({ suit: r.suit, half: 'low' });   // 丟過低段核心→小掛半安全
    if (r.high_safe) answers.push({ suit: r.suit, half: 'high' });  // 丟過高段核心→大掛半安全
  }
  return answers;
}
// P6-2 構造「恰好一門有向下壓訊號」的捨牌河：
//   半壓題(only low/high)→ 該門 1 個安全半掛；全壓題(low+high)→ 該門低+高 2 個並列安全半掛。
//   其他門只丟端牌/樞紐/中央(牌1/5/9/4/6)當干擾，不觸發任何 safe → 保證答案聚焦在目標門。
function genPress() {
  for (let tries = 0; tries < 800; tries++) {
    const targetSuit = randint(0, 2);
    const full = Math.random() < 0.35;                         // 35% 全壓(整條=兩半並列)、65% 半壓
    const targetHalf = ['low', 'high'][randint(0, 1)];         // 半壓題壓哪半
    const river = [];
    const dropLow = () => river.push(targetSuit * 9 + [1, 2][randint(0, 1)]);   // 低段核心 牌2/3
    const dropHigh = () => river.push(targetSuit * 9 + [6, 7][randint(0, 1)]);  // 高段核心 牌7/8
    if (full) { dropLow(); dropHigh(); }
    else if (targetHalf === 'low') dropLow();
    else dropHigh();
    if (Math.random() < 0.5) river.push(targetSuit * 9 + [3, 4, 5][randint(0, 2)]); // 中央雜訊(牌4/5/6，不影響)
    // 其他兩門：只丟不觸發 safe 的牌(牌1/5/9端樞、牌4/6中央) → 玩家要能分辨「這些不是向下壓訊號」
    const NOISE = [0, 4, 8, 3, 5];                             // n: 牌1,5,9,4,6(都不是 2/3/7/8)
    for (let s = 0; s < 3; s++) {
      if (s === targetSuit) continue;
      const cnt = randint(1, 2);
      for (let k = 0; k < cnt; k++) river.push(s * 9 + NOISE[randint(0, NOISE.length - 1)]);
    }
    if (Math.random() < 0.6) river.push(27 + randint(0, 6));   // 字牌雜訊
    shuffle(river);
    const res = MJRead.pressAnalyze(river);
    const answers = collectSafeHalves(res);
    // 接受條件：安全半掛數量 = 預期(全壓2/半壓1) 且全部落在目標門 → 恰好一個安全區域
    if (answers.length === (full ? 2 : 1) && answers.every(a => a.suit === targetSuit)) {
      return { river, res, answers, full };
    }
  }
  const river = [2, 9 + 4, 18 + 8]; shuffle(river);            // 保底：3萬(低)壓小掛，5筒/9索當雜訊
  const res = MJRead.pressAnalyze(river);
  return { river, res, answers: collectSafeHalves(res), full: false };
}

function renderPress() {
  answered = false;
  renderRiverInto('press-oppo', pressProblem.river, '對手捨牌河（向下壓只看有沒有丟過，跟順序無關）', false);
  document.querySelectorAll('#press-choices .choice').forEach(b => b.classList.remove('locked', 'correct', 'wrong'));
  document.getElementById('press-result').hidden = true;
}

function onAnswerPress(suit, half) {
  if (answered) return;
  answered = true;
  const correct = pressProblem.answers.some(a => a.suit === suit && a.half === half);
  const s = stats(); s.total++;
  if (correct) { s.correct++; s.streak++; if (s.streak > s.best) s.best = s.streak; } else s.streak = 0;
  saveStats(); renderStats();
  document.querySelectorAll('#press-choices .choice').forEach(b => {
    b.classList.add('locked');
    const bs = +b.dataset.suit, bh = b.dataset.half;
    const isAns = pressProblem.answers.some(a => a.suit === bs && a.half === bh);
    if (isAns) b.classList.add('correct');                    // 所有安全半掛都標綠(整條壓時低+高並列)
    if (bs === suit && bh === half && !correct) b.classList.add('wrong');
  });
  renderPressResult(suit, half, correct);
}

const SUIT_CN = ['萬', '筒', '索'];
// 半掛顯示名：{suit, half} → 例「萬子 1-4（小掛）」
function pressHalfLabel(a) {
  return SUIT_CN[a.suit] + '子 ' + (a.half === 'low' ? '1-4（小掛）' : '6-9（大掛）');
}
function renderPressResult(pickedSuit, pickedHalf, correct) {
  const v = document.getElementById('press-verdict');
  v.className = 'verdict ' + (correct ? 'good' : 'bad');
  const ansNames = pressProblem.answers.map(pressHalfLabel).join('、');
  v.innerHTML = (correct ? '🎯 答對！' : '❌ 答錯了，') + '最安全是 ' + ansNames +
    (pressProblem.full ? '（整條壓）' : '（半條壓）');
  renderExplain('#press-explain', MJExplain.pressRead(pressProblem, pickedSuit, pickedHalf));
  // 逐半掛列判定：3 門各拆低半(1-4)/高半(6-9)共 6 列，標出安全/要防、答案、玩家選的
  let rows = '';
  for (let s = 0; s < 3; s++) {
    const r = pressProblem.res.find(x => x.suit === s);
    for (const half of ['low', 'high']) {
      const safe = half === 'low' ? r.low_safe : r.high_safe;
      const hit = half === 'low' ? r.low_hit : r.high_hit;
      const isAns = pressProblem.answers.some(a => a.suit === s && a.half === half);
      const you = s === pickedSuit && half === pickedHalf;
      const range = half === 'low' ? '1-4' : '6-9';
      const core = half === 'low' ? '低段2/3' : '高段7/8';
      const status = safe ? '<span class="risk r0">安全</span>' : '<span class="risk r3">要防</span>';
      rows += '<tr class="' + (isAns ? 'opt ' : '') + (you ? 'you' : '') + '"><td>' + SUIT_CN[s] + '子' + range +
        '</td><td>' + status + '</td><td class="uk-tiles">' + core + (hit ? ' 丟過✅' : ' 沒丟—') + '</td></tr>';
    }
  }
  document.getElementById('press-rank').innerHTML =
    '<table><tr><th>半掛</th><th>判定</th><th>向下壓訊號</th></tr>' + rows + '</table>';
  showResult('#press-result');
}

// =========================== ② 六掛 gua ===========================
// 從某掛選一張還沒用過的牌當「首次出現」(偏好中心牌)
function pickGuaTile(suit, gua, used) {
  const order = gua === 'small' ? [1, 2, 0, 3] : [6, 7, 5, 8];  // 小掛偏2/3、大掛偏7/8
  for (const n of order) { const t = suit * 9 + n; if (!used.has(t)) return t; }
  return null;
}
// 某掛的「候選代表牌」= 沒用過的中心牌(當危險候選，須非現物)
function guaRepTile(suit, gua, used) {
  const order = gua === 'small' ? [2, 1, 3, 0] : [7, 6, 8, 5];
  for (const n of order) { const t = suit * 9 + n; if (!used.has(t)) return t; }
  return null;
}

// 為全 6 掛各生一張候選代表牌(present 掛+absent 掛都要，讓沒出現的掛也能被點選)
// answers = 所有 danger 掛(最晚出現的 present + 完全沒出現的 absent)的代表牌 → 並列都算對
function buildGuaCands(res, used) {
  const cands = [];
  for (const o of res) {                               // res 已含全 6 掛
    const rep = guaRepTile(o.suit, o.gua, used);
    if (rep == null) return null;
    cands.push({ tile: rep, suit: o.suit, gua: o.gua, first_turn: o.first_turn, present: o.present, danger: o.danger });
    used.add(rep);
  }
  return cands;
}
// P6-3 方案A 構造：present 4~5 掛依序丟出、1~2 掛完全沒出現(當陷阱)；
//   answers = 最晚出現的掛 + 所有沒出現的掛(2~3 張並列，點哪個都算對)。
function genGua() {
  const ALL = [];
  for (let s = 0; s < 3; s++) for (const g of ['small', 'big']) ALL.push({ suit: s, gua: g });
  for (let tries = 0; tries < 800; tries++) {
    const shuffled = ALL.slice(); shuffle(shuffled);
    const nPresent = randint(4, 5);                    // 4~5 掛出現 → 1~2 掛完全沒出現
    const chosen = shuffled.slice(0, nPresent);        // 依序丟，最後一個最晚出現
    const river = [];
    const used = new Set();
    let ok = true;
    for (const c of chosen) {
      const t = pickGuaTile(c.suit, c.gua, used);
      if (t == null) { ok = false; break; }
      river.push(t); used.add(t);
    }
    if (!ok) continue;
    const res = MJRead.guaAnalyze(river);
    const present = res.filter(r => r.present);
    if (present.length !== nPresent) continue;         // 全部都要有出現(防呆)
    if (present[0].first_turn === present[1].first_turn) continue;   // 最晚出現要唯一(present 天然互異，防呆)
    const cands = buildGuaCands(res, used);
    if (!cands) continue;
    // answers = 所有 danger 掛代表牌(最晚present 1 個 + absent 1~2 個 = 2~3 張並列)
    const answers = cands.filter(c => c.danger).map(c => c.tile);
    if (answers.length < 2) continue;                  // 方案A要「最晚 + 沒出現」並列，至少 2 張
    shuffle(cands);                                     // 打散候選顯示順序
    return { river, res, cands, answers, dangerList: res.filter(r => r.danger) };
  }
  // 保底：只 3 掛出現(萬小2萬→筒大8筒→索小2索)、3 掛沒出現 → danger=索小(最晚)+3 absent
  const river = [1, 9 + 7, 18 + 1];
  const res = MJRead.guaAnalyze(river);
  const cands = buildGuaCands(res, new Set(river)) || [];
  const answers = cands.filter(c => c.danger).map(c => c.tile);
  return { river, res, cands, answers, dangerList: res.filter(r => r.danger) };
}

// =========================== ③ 衍牌 nobe ===========================
// 對手拆搭丟 N(中央牌 3~7)，問鄰近最危險
// ★ 衍牌牌理本來就是「N 的左右鄰都危險」——中央牌的 N-1/N+1 對稱、危險分相同，
//   所以「最危險」允許並列(都算對)，不硬湊唯一解(硬湊會變成每題同一個模子、還教錯兩鄰同險)。
function topAnswers(res) {
  const top = res[0].score;
  return res.filter(c => c.score === top).map(c => c.tile);   // 所有並列最高分的牌
}
function genNobe() {
  for (let tries = 0; tries < 400; tries++) {
    const suit = randint(0, 2);
    const N = suit * 9 + randint(0, 8);               // 牌1~9 全段(P6-1:放寬含端牌1/2/8/9，練端牌不對稱拆搭)
    const river = [];
    if (Math.random() < 0.5) {                         // 一半機率丟一張同門現物：可能剛好排除某鄰牌
      const base = MJRead.nobeAnalyze(N, []);          //   → 打破左右對稱，練「現物排除、另一邊才危險」
      const others = base.slice(1).map(c => c.tile);
      if (others.length) river.push(others[randint(0, others.length - 1)]);
    }
    const res = MJRead.nobeAnalyze(N, river);
    if (res.length < 3) continue;
    const answers = topAnswers(res);
    if (answers.length > 2) continue;                 // 正常只會 1~2 張(N±1)並列；>2 太發散不出
    return { N, river, res, answers, cands: shuffle(res.slice()) };
  }
  const N = 4;                                          // 保底：拆搭丟5萬
  const res = MJRead.nobeAnalyze(N, []);
  return { N, river: [], res, answers: topAnswers(res), cands: shuffle(res.slice()) };
}

// ---- 六掛/衍牌共用的「點候選牌選最危險」出題 ----
function renderReadPick() {
  answered = false;
  const prob = readPickProblem;
  document.getElementById('read-prompt').innerHTML = READ_PROMPT[rsub];
  if (rsub === 'gua') {
    renderRiverInto('read-oppo', prob.river, '對手依序的捨牌河（數字＝第幾巡丟的）', true);
  } else {
    renderRiverInto('read-oppo', [prob.N], '對手剛剛拆搭、打出這張', false);
  }
  const box = document.getElementById('read-cands');
  box.innerHTML = '';
  for (const c of prob.cands) {
    const tile = c.tile;
    const el = makeTile(tile);
    el.addEventListener('click', () => onPickRead(tile, el));
    box.appendChild(el);
  }
  document.getElementById('read-result').hidden = true;
}

function onPickRead(tile, el) {
  if (answered) return;
  answered = true;
  const prob = readPickProblem;
  const correct = prob.answers.includes(tile);                 // 並列最危險都算對(衍牌 N±1 常同險)
  const s = stats(); s.total++;
  if (correct) { s.correct++; s.streak++; if (s.streak > s.best) s.best = s.streak; } else s.streak = 0;
  saveStats(); renderStats();
  markHand('#read-cands', tile, el, prob.answers, correct);    // 所有並列答案綠框、選錯紅框(復用共用標記)
  renderReadPickResult(tile, correct);
}

function nobeRiskClass(sc) { return sc >= 6 ? 'r3' : sc >= 4 ? 'r2' : sc >= 2 ? 'r1' : 'r0'; }

function renderReadPickResult(pickedTile, correct) {
  const prob = readPickProblem;
  const v = document.getElementById('read-verdict');
  v.className = 'verdict ' + (correct ? 'good' : 'bad');
  const ansNames = prob.answers.map(t => MJ.tileLabel(t)).join('、');
  v.innerHTML = (correct ? '🎯 答對！' : '❌ 不對，') + '最危險' + (prob.answers.length > 1 ? '（並列）' : '') + '是 ' + ansNames;
  renderExplain('#read-explain', rsub === 'gua' ? MJExplain.guaRead(prob, pickedTile) : MJExplain.nobeRead(prob, pickedTile));

  let rows = '';
  if (rsub === 'gua') {
    const GN = { small: '小掛', big: '大掛' };
    for (const c of prob.res) {                         // 全 6 掛，res 已按危險→安全排序
      const rep = prob.cands.find(x => x.suit === c.suit && x.gua === c.gua);
      const you = rep && pickedTile === rep.tile;
      const when = c.present ? ('第 ' + (c.first_turn + 1) + ' 巡') : '沒出現';
      const read = c.danger ? (c.present ? '最晚→最危險' : '沒出現→也危險') : '較早→較安全';
      rows += '<tr class="' + (c.danger ? 'opt ' : '') + (you ? 'you' : '') + '"><td>' + (rep ? MJ.tileLabel(rep.tile) : '—') +
        '</td><td>' + SUIT_CN[c.suit] + GN[c.gua] + '</td><td class="sh">' + when + '</td>' +
        '<td class="uk-tiles">' + read + '</td></tr>';
    }
    document.getElementById('read-rank').innerHTML =
      '<table><tr><th>候選</th><th>掛</th><th>首次出現</th><th>判讀</th></tr>' + rows + '</table>';
  } else {
    for (const c of prob.res) {                         // 各候選依危險分列表
      const isAns = prob.answers.includes(c.tile);      // 並列最危險都標最佳
      const you = c.tile === pickedTile;
      rows += '<tr class="' + (isAns ? 'opt ' : '') + (you ? 'you' : '') + '"><td>' + MJ.tileLabel(c.tile) + '</td>' +
        '<td><span class="risk ' + nobeRiskClass(c.score) + '">' + c.score + '</span></td>' +
        '<td class="uk-tiles">' + c.shapes.map(sp => SHAPE_CN[sp]).join('、') + '</td></tr>';
    }
    document.getElementById('read-rank').innerHTML =
      '<table><tr><th>候選</th><th>危險分</th><th>能聽到的搭子</th></tr>' + rows + '</table>';
  }
  showResult('#read-result');
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
//  心法 (純教學卡，手風琴摺疊；內容來自 tips.js 的 MJTips)
// =====================================================================
let tipsBuilt = false;                                  // 內容是靜態的，只生成一次
function renderTips() {
  if (tipsBuilt) return;
  const list = document.getElementById('tips-list');
  // 每個主題 = 一張可摺疊卡：標題列(head) + 內文(body)。預設全收合，點標題才展開。
  list.innerHTML = MJTips.map((t, i) => (
    '<article class="tips-item" data-i="' + i + '">' +
      '<button class="tips-head" type="button" aria-expanded="false">' +
        '<span class="tips-emoji">' + t.emoji + '</span>' +
        '<span class="tips-tt">' +
          '<span class="tips-title">' + t.title + '</span>' +
          '<span class="tips-sub">' + t.sub + '</span>' +
        '</span>' +
        '<span class="tips-arrow">▾</span>' +
      '</button>' +
      '<div class="tips-body">' + t.body + '</div>' +
    '</article>'
  )).join('');
  tipsBuilt = true;
}

// 點標題 → 展開/收合該卡(各卡獨立，可同時展開多張，方便對照)
function toggleTip(head) {
  const item = head.closest('.tips-item');
  const open = item.classList.toggle('open');
  head.setAttribute('aria-expanded', open ? 'true' : 'false');
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
  } else if (mode === 'read') {           // 讀牌
    if (rsub === 'press') {
      pressProblem = genPress();
      renderPress();
    } else {
      readPickProblem = rsub === 'gua' ? genGua() : genNobe();
      renderReadPick();
    }
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
  } else if (mode === 'tips') {
    html = '<b>心法</b>：橫飛的觀念與戰術精華，純閱讀不作答。點主題展開細讀——練牌卡住時回來複習觀念最有效。';
  } else if (mode === 'read') {
    const readNotes = {
      press: '<b>讀牌 · 向下壓</b>：對手丟低段(2/3)→小掛半條(1-4)不做、丟高段(7/8)→大掛半條(6-9)不做、兩頭都丟→整條安全。挑<b>最安全</b>的那半。屬機率讀牌、不是保證。',
      gua: '<b>讀牌 · 六掛</b>：每門分小掛(1-4)、大掛(6-9)共六掛。<b>最晚才動</b>的掛(剛拆到)＋<b>整段沒出現</b>的掛(整條留著)都＝真牌熱區，靠捨牌先後讀出來。',
      nobe: '<b>讀牌 · 衍牌</b>：對手拆搭丟一張 N，真牌就落在 <b>N 的鄰近</b>(N±1、N±2)——越貼近、能組越多搭子的牌越危險。',
    };
    html = readNotes[rsub];
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
  document.querySelectorAll('.mode-read').forEach(el => el.classList.toggle('hide', m !== 'read'));
  document.querySelectorAll('.mode-lab').forEach(el => el.classList.toggle('hide', m !== 'lab'));
  document.querySelectorAll('.mode-tips').forEach(el => el.classList.toggle('hide', m !== 'tips'));

  const isTips = m === 'tips';
  // 難度 bar 只在牌效率/防守顯示；牌理用 subbar、讀牌用 readbar、心法都不需要
  document.getElementById('diffbar').classList.toggle('hide', m === 'read' || m === 'lab' || isTips);
  document.getElementById('subbar').classList.toggle('hide', m !== 'lab');
  document.getElementById('readbar').classList.toggle('hide', m !== 'read');
  // 心法是純閱讀、沒有作答統計 → 隱藏上方統計列
  document.getElementById('stats').classList.toggle('hide', isTips);

  updateNote();

  if (isTips) {                                         // 心法：畫手風琴、不出題、不碰統計
    renderTips();
    return;
  }
  if (m === 'lab') applyLabSub();                       // 決定 atk / pick 哪組卡顯示
  else if (m === 'read') applyReadSub();                // 決定 press / pick 哪組卡顯示
  else updateDiffLabels();
  renderStats();
  nextProblem();
}

// 牌理模式內：依 sub 顯示「判斷題卡(atk)」或「點牌題卡(iso/wait)」
function applyLabSub() {
  const showAtk = sub === 'atk';
  document.querySelectorAll('.sub-atk').forEach(el => el.classList.toggle('hide', !showAtk));
  document.querySelectorAll('.sub-pick').forEach(el => el.classList.toggle('hide', showAtk));
}

// 讀牌模式內：依 rsub 顯示「向下壓門選卡(press)」或「點牌卡(gua/nobe)」
function applyReadSub() {
  const showPress = rsub === 'press';
  document.querySelectorAll('.rsub-press').forEach(el => el.classList.toggle('hide', !showPress));
  document.querySelectorAll('.rsub-pick').forEach(el => el.classList.toggle('hide', showPress));
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

function setRSub(s) {
  rsub = s;
  document.querySelectorAll('.rsub').forEach(b => b.classList.toggle('on', b.dataset.rsub === s));
  applyReadSub();
  updateNote();
  nextProblem();
}

function init() {
  document.getElementById('ver').textContent = APP_VERSION;
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('.diff').forEach(b => b.addEventListener('click', () => setLevel(+b.dataset.level)));
  document.querySelectorAll('.sub').forEach(b => b.addEventListener('click', () => setSub(b.dataset.sub)));
  document.querySelectorAll('.rsub').forEach(b => b.addEventListener('click', () => setRSub(b.dataset.rsub)));
  document.querySelectorAll('#atk-card .choice').forEach(b => b.addEventListener('click', () => onAnswerAtk(b.dataset.ans)));
  document.querySelectorAll('#press-choices .choice').forEach(b => b.addEventListener('click', () => onAnswerPress(+b.dataset.suit, b.dataset.half)));
  document.getElementById('next').addEventListener('click', nextProblem);
  document.getElementById('def-next').addEventListener('click', nextProblem);
  document.getElementById('atk-next').addEventListener('click', nextProblem);
  document.getElementById('pick-next').addEventListener('click', nextProblem);
  document.getElementById('press-next').addEventListener('click', nextProblem);
  document.getElementById('read-next').addEventListener('click', nextProblem);
  // 心法手風琴：用事件委派(卡片內容由 renderTips 才生成，直接綁會綁不到)
  document.getElementById('tips-list').addEventListener('click', e => {
    const head = e.target.closest('.tips-head');
    if (head) toggleTip(head);
  });

  updateDiffLabels();
  updateNote();
  renderStats();
  nextProblem();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);

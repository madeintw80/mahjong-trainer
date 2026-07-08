/*
 * readdiscard.js — 台灣麻將「讀捨牌河 / 進階防守」規則引擎 (JavaScript 版，PWA 使用)
 * 與 Python 參考版 reference/readdiscard.py 完全相同，已用向量交叉驗證(0 誤差)。
 *
 * 和靜態安全牌 defense.js 是兩種不同的防守：
 *   defense.js     假設對手「已聽牌」→ 算我打哪張最不會放槍(現物/筋/壁/字牌)
 *   readdiscard.js 從對手「捨牌河的內容與順序」→ 反推他不太可能聽哪 / 真牌藏哪
 *
 * ★ 這是機率性讀牌(啟發式)，不是保證安全。引擎把橫飛口訣寫成確定性規則，
 *   讓 JS/Python 逐位對拍一致；安全/危險是教學相對判斷，不是真實放槍率。
 *
 * 三個子引擎：
 *   pressAnalyze 向下壓：丟低段(2/3)→小掛半條安全、丟高段(7/8)→大掛半條安全、兩半都丟→整條安全
 *   guaAnalyze   六掛斷聽：每門小掛(1-4)/大掛(6-9)共六掛，最晚才丟的掛 + 完全沒丟過的掛=真牌=最危險
 *   nobeAnalyze  衍牌險張：拆搭丟出 N → 用含 N 的搭子拆解算 N 鄰近哪張最危險
 *
 * 牌編號 0~33：0-8 萬 / 9-17 筒 / 18-26 索 / 27-33 字牌(讀捨牌河只看數字牌)
 */
(function (global) {
  'use strict';

  const SUIT = ['萬', '筒', '索'];

  function tileName(t) { return (t % 9 + 1) + SUIT[Math.floor(t / 9)]; }
  function suitOf(t) { return Math.floor(t / 9); }
  function numOf(t) { return t % 9; }
  function isNumber(t) { return t < 27; }

  // ===================================================================
  //  ① 向下壓 pressAnalyze — 哪半條 / 整條安全
  // ===================================================================
  // 低段代表=牌2,3(n1,2)、高段代表=牌7,8(n6,7)。端牌1/9本來就常丟(不算訊號)、
  // 中央4/5/6太好用(丟了很可疑)，只有 2/3 與 7/8 被丟才代表「這一段放棄了」。
  // P6-2 半門：丟低段核心→小掛半條(1-4)安全、丟高段核心→大掛半條(6-9)安全、兩半都丟→整條安全。
  const PRESS_LOW = new Set([1, 2]);
  const PRESS_HIGH = new Set([6, 7]);

  function pressAnalyze(river) {
    const out = [];
    for (let suit = 0; suit < 3; suit++) {
      const nset = new Set();
      for (const t of river) if (isNumber(t) && suitOf(t) === suit) nset.add(numOf(t));
      const ns = [...nset].sort((a, b) => a - b);
      const lowHit = ns.some(n => PRESS_LOW.has(n));
      const highHit = ns.some(n => PRESS_HIGH.has(n));
      // P6-2 半門安全：丟了哪半的核心，哪半就相對安全(low_safe/high_safe)；兩半都安全=整條 pressed
      const lowSafe = lowHit, highSafe = highHit;
      // ★ key 順序要和 Python dict 一致(JSON 對拍逐位比)
      out.push({ suit: suit, pressed: lowSafe && highSafe, low_hit: lowHit, high_hit: highHit, low_safe: lowSafe, high_safe: highSafe, discarded: ns });
    }
    return out;
  }

  // ===================================================================
  //  ② 六掛斷聽 guaAnalyze — 哪一掛最危險(看捨牌順序)
  // ===================================================================
  // 小掛=牌1-4(n0-3)、大掛=牌6-9(n5-8)、牌5(n4)樞紐不歸掛
  // P6-3 方案A：最晚出現的掛 + 完全沒出現的掛，並列都算最危險(danger)
  function guaOf(t) {
    if (!isNumber(t)) return null;
    const n = numOf(t);
    if (n <= 3) return [suitOf(t), 'small'];
    if (n >= 5) return [suitOf(t), 'big'];
    return null;                                  // n==4 牌5 樞紐
  }

  function guaAnalyze(river) {
    const first = {};                             // 'suit-gua' -> 首次 index
    for (let i = 0; i < river.length; i++) {
      const g = guaOf(river[i]);
      if (g) { const k = g[0] + '-' + g[1]; if (!(k in first)) first[k] = i; }
    }
    const out = [];
    for (let suit = 0; suit < 3; suit++) {
      for (const gua of ['small', 'big']) {
        const k = suit + '-' + gua;
        const ft = (k in first) ? first[k] : null;
        out.push({ suit: suit, gua: gua, first_turn: ft, present: ft !== null });
      }
    }
    // 「最晚出現」= present 掛裡 first_turn 最大者(可能並列)；沒任何掛出現時為 null
    const presentFts = out.filter(o => o.present).map(o => o.first_turn);
    const latest = presentFts.length ? Math.max(...presentFts) : null;
    for (const o of out) {
      // P6-3 danger：完全沒出現 或 最晚出現的 present 掛(方案A：兩來源並列最危險)
      o.danger = (!o.present) || (o.first_turn === latest);
    }
    // 排序「危險→安全」，和 Python sort_key (danger_rank, present_rank, -ft, suit, gua_rank) 一致
    out.sort((a, b) => {
      const da = a.danger ? 0 : 1, db = b.danger ? 0 : 1;
      if (da !== db) return da - db;              // danger 掛排最前
      const pa = a.present ? 0 : 1, pb = b.present ? 0 : 1;
      if (pa !== pb) return pa - pb;              // danger 內：最晚 present 掛排在沒出現的掛前
      const fa = a.present ? a.first_turn : -1, fb = b.present ? b.first_turn : -1;
      if (fa !== fb) return fb - fa;              // first_turn 大(晚)的排前
      if (a.suit !== b.suit) return a.suit - b.suit;
      return (a.gua === 'small' ? 0 : 1) - (b.gua === 'small' ? 0 : 1);
    });
    return out;
  }

  // ===================================================================
  //  ③ 衍牌險張 nobeAnalyze — 拆搭丟出 N，N 鄰近哪張最危險
  // ===================================================================
  const NOBE_W = { ryanmen: 4, kanchan: 2, penchan: 2, shanpon: 1 };

  function nobeAnalyze(N, river) {
    river = river || [];
    const suit = suitOf(N), n = numOf(N);
    const genbutsu = new Set();
    for (const t of river) if (isNumber(t) && suitOf(t) === suit) genbutsu.add(numOf(t));

    // 貼近被丟的 N = 搭子至少一張落在 [n-1,n+1]
    const near = (...ns) => ns.some(x => Math.abs(x - n) <= 1);
    const order = { ryanmen: 0, kanchan: 1, penchan: 2, shanpon: 3 };
    const cand = [];

    for (let dt = -3; dt <= 3; dt++) {
      const m = n + dt;
      if (m < 0 || m > 8 || m === n) continue;
      if (genbutsu.has(m)) continue;              // 現物：詐胡不能胡，不是真牌
      const T = suit * 9 + m;
      let score = 0;
      const shapes = [];

      // 兩面(下端/上端聽 m)；12聽3、89聽7 算邊張
      for (const [a, b] of [[m - 2, m - 1], [m + 1, m + 2]]) {
        if (a >= 0 && a <= 8 && b >= 0 && b <= 8 && near(a, b)) {
          const isPen = (a === 0 && b === 1) || (a === 7 && b === 8);
          const typ = isPen ? 'penchan' : 'ryanmen';
          score += NOBE_W[typ]; shapes.push(typ);
        }
      }
      // 嵌張 (m-1,m+1) 夾聽 m
      const a = m - 1, b = m + 1;
      if (a >= 0 && a <= 8 && b >= 0 && b <= 8 && near(a, b)) {
        score += NOBE_W.kanchan; shapes.push('kanchan');
      }
      // 雙碰/對子
      if (near(m)) { score += NOBE_W.shanpon; shapes.push('shanpon'); }

      if (score > 0) {
        const uniq = [...new Set(shapes)].sort((x, y) => order[x] - order[y]);
        cand.push({ tile: T, n: m, score: score, shapes: uniq });
      }
    }
    cand.sort((x, y) => (y.score - x.score) || (x.tile - y.tile));   // 分數高→低，同分牌編號升序
    return cand;
  }

  // ---- 小工具：字串 → 牌 list(保留順序，給捨牌河用) ----
  function parseTiles(str) {
    const base = { m: 0, p: 9, s: 18 };
    const out = []; let nums = [];
    for (const ch of str) {
      if (ch >= '0' && ch <= '9') nums.push(+ch);
      else if (ch in base) { for (const x of nums) out.push(base[ch] + x - 1); nums = []; }
    }
    return out;
  }

  global.MJRead = {
    tileName, suitOf, numOf, isNumber,
    PRESS_LOW, PRESS_HIGH, pressAnalyze,
    guaOf, guaAnalyze,
    NOBE_W, nobeAnalyze, parseTiles
  };
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * engine.js — 台灣麻將 16 張「牌效率」引擎 (JavaScript 版，PWA 使用)
 * 演算法與 Python 參考版 reference/engine.py 完全相同，已用 500 組向量交叉驗證(0 誤差)。
 *
 * 名詞：
 *   向聽數 shanten — 還差幾步才聽牌；16 張時 0 = 已聽牌
 *   進張   ukeire  — 摸到後能讓向聽數 -1 的牌 / 還剩幾張可摸
 *   面子   meld    — 順子(345)或刻子(555)
 *   搭子   taatsu  — 只差一張就成面子的兩張(34、55、35)
 *   將     eye     — 當眼睛的對子
 *
 * 牌編號 0~33：0-8 萬 / 9-17 筒 / 18-26 索 / 27-33 東南西北中發白
 */
(function (global) {
  'use strict';

  const NEED_MELDS = 5; // 台麻要 5 個面子

  function isNumberTile(i) { return i < 27; } // 只有萬筒索能組順子

  // 記憶化快取：同一組剩牌不重算
  const _memo = new Map();

  // 從第 i 種牌開始，回傳剩餘牌能達成的 [面子數, 搭子數] 組合(已去掉被支配的爛解)
  function _achievable(counts, i) {
    while (i < 34 && counts[i] === 0) i++;      // 跳過沒有的牌
    if (i >= 34) return [[0, 0]];

    const key = counts.join(',') + '#' + i;
    const cached = _memo.get(key);
    if (cached) return cached;

    const results = new Set();                   // 用 "m,t" 字串去重
    const add = (m, t) => results.add(m + ',' + t);

    // 分支1：丟一張廢牌不用
    counts[i]--;
    for (const mt of _achievable(counts, i)) add(mt[0], mt[1]);
    counts[i]++;

    // 分支2：刻子
    if (counts[i] >= 3) {
      counts[i] -= 3;
      for (const mt of _achievable(counts, i)) add(mt[0] + 1, mt[1]);
      counts[i] += 3;
    }
    // 分支3：對子當搭子(等第三張成刻)
    if (counts[i] >= 2) {
      counts[i] -= 2;
      for (const mt of _achievable(counts, i)) add(mt[0], mt[1] + 1);
      counts[i] += 2;
    }
    if (isNumberTile(i)) {
      const pos = i % 9;                          // 在該花色 0~8 = 1~9
      // 分支4：順子
      if (pos <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 1]--; counts[i + 2]--;
        for (const mt of _achievable(counts, i)) add(mt[0] + 1, mt[1]);
        counts[i]++; counts[i + 1]++; counts[i + 2]++;
      }
      // 分支5：兩面/邊張搭子(34 等)
      if (pos <= 7 && counts[i + 1] > 0) {
        counts[i]--; counts[i + 1]--;
        for (const mt of _achievable(counts, i)) add(mt[0], mt[1] + 1);
        counts[i]++; counts[i + 1]++;
      }
      // 分支6：嵌張搭子(35 等)
      if (pos <= 6 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 2]--;
        for (const mt of _achievable(counts, i)) add(mt[0], mt[1] + 1);
        counts[i]++; counts[i + 2]++;
      }
    }

    // Pareto 精簡：丟掉面子搭子都不比別人多的爛解
    const arr = [...results].map(s => s.split(',').map(Number));
    const pruned = [];
    for (const [m, t] of arr) {
      let dominated = false;
      for (const [m2, t2] of arr) {
        if ((m2 !== m || t2 !== t) && m2 >= m && t2 >= t) { dominated = true; break; }
      }
      if (!dominated) pruned.push([m, t]);
    }
    _memo.set(key, pruned);
    return pruned;
  }

  // 由 (面子 m, 搭子 t, 有沒有將) 算向聽數
  function _shantenFromBlocks(m, t, need, hasEye) {
    const mUse = Math.min(m, need);
    const tUse = Math.min(t, need - mUse);       // 面子+搭子最多用 need 組
    return need * 2 - 2 * mUse - tUse - (hasEye ? 1 : 0);
  }

  // 算一手牌的向聽數
  function shanten(counts, need) {
    need = need || NEED_MELDS;
    counts = counts.slice();
    let best = 99;
    // 情況A：不指定將
    for (const [m, t] of _achievable(counts, 0)) best = Math.min(best, _shantenFromBlocks(m, t, need, false));
    // 情況B：每種對子都試著當將
    for (let p = 0; p < 34; p++) {
      if (counts[p] >= 2) {
        counts[p] -= 2;
        for (const [m, t] of _achievable(counts, 0)) best = Math.min(best, _shantenFromBlocks(m, t, need, true));
        counts[p] += 2;
      }
    }
    return best;
  }

  // 一手 16 張的進張：回傳 {total 張數, tiles 進張牌, shanten}
  function ukeire(counts16, need) {
    need = need || NEED_MELDS;
    counts16 = counts16.slice();
    const s = shanten(counts16, need);
    const tiles = [];
    let total = 0;
    for (let t = 0; t < 34; t++) {
      if (counts16[t] < 4) {
        counts16[t]++;
        if (shanten(counts16, need) === s - 1) {
          tiles.push(t);
          total += 4 - (counts16[t] - 1);        // 還剩幾張可摸(扣掉自己手上的)
        }
        counts16[t]--;
      }
    }
    return { total: total, tiles: tiles, shanten: s };
  }

  // 輸入剛摸完的 17 張，回傳每張丟法的分析，依(向聽小、進張多)排序
  function bestDiscards(counts17, need) {
    need = need || NEED_MELDS;
    counts17 = counts17.slice();
    const out = [];
    for (let d = 0; d < 34; d++) {
      if (counts17[d] > 0) {
        counts17[d]--;
        const s = shanten(counts17, need);
        const uk = ukeire(counts17, need);
        out.push({ discard: d, shanten: s, ukeireTotal: uk.total, ukeireTiles: uk.tiles });
        counts17[d]++;
      }
    }
    out.sort((a, b) => a.shanten - b.shanten || b.ukeireTotal - a.ukeireTotal);
    return out;
  }

  // ---- 牌面顯示 ----
  const SUIT_CN = ['萬', '筒', '索'];
  const HONOR_CN = ['東', '南', '西', '北', '中', '發', '白'];

  function tileLabel(i) {            // 給人看的中文：'3萬' '東'
    if (i < 27) return (i % 9 + 1) + SUIT_CN[Math.floor(i / 9)];
    return HONOR_CN[i - 27];
  }
  function tileSuit(i) {             // 花色代號：'m'/'p'/'s'/'z'
    if (i < 9) return 'm';
    if (i < 18) return 'p';
    if (i < 27) return 's';
    return 'z';
  }
  function tileNum(i) {              // 數字牌回 1~9，字牌回 0
    return i < 27 ? (i % 9 + 1) : 0;
  }

  function parseHand(str) {          // '123m456p11z' -> counts
    const base = { m: 0, p: 9, s: 18, z: 27 };
    const counts = new Array(34).fill(0);
    let nums = [];
    for (const ch of str) {
      if (ch >= '0' && ch <= '9') nums.push(+ch);
      else if (ch in base) { for (const n of nums) counts[base[ch] + n - 1]++; nums = []; }
    }
    return counts;
  }

  global.MJ = {
    NEED_MELDS, shanten, ukeire, bestDiscards,
    tileLabel, tileSuit, tileNum, parseHand,
    _clearMemo: () => _memo.clear()
  };
})(typeof window !== 'undefined' ? window : globalThis);

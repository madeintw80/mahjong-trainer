/*
 * defense.js — 台灣麻將「防守 / 讀安全牌」規則引擎 (JavaScript 版，PWA 使用)
 * 與 Python 參考版 reference/defense.py 完全相同，已用向量交叉驗證(0 誤差)。
 *
 * 和攻擊引擎 engine.js 完全獨立：
 *   engine.js  → 進張最多(何切る)
 *   defense.js → 打哪張最不會放槍(讀安全牌)
 *
 * 核心 = 規則式安全度：假設對手已聽牌，列出他能用哪些牌型胡我，
 *        每張候選牌還有多少「活著」的牌型能胡到它 → 越多 = 越危險。
 *   兩面/嵌張/邊張/單騎/雙碰，現物→全死、筋→擋兩面、壁→拿不到牌、字牌→只剩單雙碰。
 *
 * 牌編號 0~33：0-8 萬 / 9-17 筒 / 18-26 索 / 27-33 東南西北中發白
 */
(function (global) {
  'use strict';

  // 各聽牌型的相對危險權重(整數，和 Python 版一致)
  const W = { ryanmen: 32, kanchan: 16, penchan: 16, shanpon: 12, tanki: 8 };

  // 場況/大牌警示加分
  const DRAGON_BUMP_1 = 16, DRAGON_BUMP_2 = 40, WIND_BUMP = 16, FLUSH_BUMP = 8;

  const SUIT = ['萬', '筒', '索'];
  const HONOR = ['東', '南', '西', '北', '中', '發', '白'];
  const DRAGONS = [31, 32, 33];   // 中 發 白
  const WINDS = [27, 28, 29, 30]; // 東 南 西 北

  function isHonor(t) { return t >= 27; }

  function tileName(t) {
    if (t < 27) return (t % 9 + 1) + SUIT[Math.floor(t / 9)];
    return HONOR[t - 27];
  }

  // 目標牌 T 可能被哪些聽牌型胡到
  function waitShapes(T) {
    const shapes = [];
    if (isHonor(T)) {
      shapes.push({ type: 'tanki', need: [T], others: [] });
      shapes.push({ type: 'shanpon', need: [T, T], others: [] });
      return shapes;
    }
    const suit = Math.floor(T / 9);
    const n = T % 9;                 // 0~8 = 1~9
    const idx = k => suit * 9 + k;

    if (n >= 3) shapes.push({ type: 'ryanmen', need: [idx(n - 2), idx(n - 1)], others: [idx(n - 3)] });
    if (n <= 5) shapes.push({ type: 'ryanmen', need: [idx(n + 1), idx(n + 2)], others: [idx(n + 3)] });
    if (n >= 1 && n <= 7) shapes.push({ type: 'kanchan', need: [idx(n - 1), idx(n + 1)], others: [] });
    if (n === 2) shapes.push({ type: 'penchan', need: [idx(0), idx(1)], others: [] });
    if (n === 6) shapes.push({ type: 'penchan', need: [idx(7), idx(8)], others: [] });
    shapes.push({ type: 'tanki', need: [T], others: [] });
    shapes.push({ type: 'shanpon', need: [T, T], others: [] });
    return shapes;
  }

  function countNeeded(need) {
    const c = {};
    for (const t of need) c[t] = (c[t] || 0) + 1;
    return c;
  }

  // 一個聽牌型是不是活的 → 回 [alive, why]；why: 'suji'/'wall'/'few'/''
  function evalShape(shape, visible, genbutsu) {
    for (const o of shape.others) {
      if (genbutsu.has(o)) return [false, 'suji'];   // 振聽=筋
    }
    const need = countNeeded(shape.need);
    for (const tile in need) {
      const unseen = 4 - visible[tile];
      if (unseen < need[tile]) {
        const why = (shape.type === 'tanki' || shape.type === 'shanpon') ? 'few' : 'wall';
        return [false, why];
      }
    }
    return [true, ''];
  }

  // 分類標籤(標題)
  function headline(T, shapeResults) {
    if (isHonor(T)) return '字牌';
    const ryanmen = shapeResults.filter(r => r.type === 'ryanmen');
    const R = ryanmen.length;
    const dead = ryanmen.filter(r => !r.alive);
    const alive = ryanmen.filter(r => r.alive);
    if (alive.length === 0) {
      const whys = new Set(dead.map(r => r.why));
      if (R === 2) {
        if (whys.size === 1 && whys.has('suji')) return '中筋';
        if (whys.size === 1 && whys.has('wall')) return '壁';
        return '筋壁';
      }
      return whys.has('suji') ? '筋' : '壁';
    }
    if (dead.length) return dead[0].why === 'suji' ? '半筋' : '半壁';
    return '無筋';
  }

  // 分析打出 T 的放槍風險
  function analyzeTile(T, visible, genbutsu, dangerMap) {
    if (genbutsu.has(T)) {
      return { tile: T, risk: 0, genbutsu: true, headline: '現物', seen: visible[T], shapes: [], warnings: [] };
    }
    const shapeResults = [];
    let risk = 0;
    for (const sh of waitShapes(T)) {
      const [alive, why] = evalShape(sh, visible, genbutsu);
      if (alive) risk += W[sh.type];
      shapeResults.push({ type: sh.type, alive: alive, why: why });
    }
    risk += (4 - visible[T]);                 // 生張加權(同分 tiebreak)
    const hl = headline(T, shapeResults);
    const warnings = [];
    if (dangerMap[T]) {
      warnings.push(dangerMap[T][0]);
      risk += dangerMap[T][1];
    }
    return { tile: T, risk: risk, genbutsu: false, headline: hl, seen: visible[T], shapes: shapeResults, warnings: warnings };
  }

  // 看得見的牌 = 我方手牌 + 對手牌河 + 對手副露；現物 = 對手牌河
  function buildVisible(hand, river, melds) {
    const visible = hand.slice();
    const genbutsu = new Set();
    for (const t of river) { visible[t]++; genbutsu.add(t); }
    if (melds) for (const md of melds) for (const t of md.tiles) visible[t]++;
    return [visible, genbutsu];
  }

  // 從對手副露推大牌警示
  function buildDangerMap(melds) {
    const dm = {};
    if (!melds) return dm;
    const melded = [];
    for (const md of melds) melded.push(...md.tiles);
    const meldedSet = new Set(melded);

    const mdDrag = DRAGONS.filter(d => meldedSet.has(d));
    if (mdDrag.length) {
      const bump = mdDrag.length >= 2 ? DRAGON_BUMP_2 : DRAGON_BUMP_1;
      const note = '⚠️對手已碰 ' + mdDrag.map(tileName).join('/') + '，慎防大三元';
      for (const d of DRAGONS) if (!meldedSet.has(d)) dm[d] = [note, bump];
    }

    const mdWind = WINDS.filter(w => meldedSet.has(w));
    if (mdWind.length >= 2) {
      const note = '⚠️對手多門風牌副露，慎防大四喜';
      for (const w of WINDS) if (!meldedSet.has(w)) dm[w] = [note, WIND_BUMP];
    }

    const numMelds = melds.filter(md => md.tiles.some(t => t < 27));
    const suits = new Set();
    for (const md of numMelds) for (const t of md.tiles) if (t < 27) suits.add(Math.floor(t / 9));
    if (numMelds.length >= 2 && suits.size === 1) {
      const s = [...suits][0];
      const note = '⚠️對手副露集中在' + SUIT[s] + '，疑似混/清一色，該花色偏危險';
      for (let k = 0; k < 9; k++) { const t = s * 9 + k; if (!dm[t]) dm[t] = [note, FLUSH_BUMP]; }
    }
    return dm;
  }

  // 主入口：17 張手牌 + 對手牌河 + 副露 → 每張可打牌的風險，安全→危險排序
  function rankDiscards(hand, river, melds) {
    const [visible, genbutsu] = buildVisible(hand, river, melds || null);
    const dangerMap = buildDangerMap(melds || null);
    const out = [];
    for (let t = 0; t < 34; t++) {
      if (hand[t] > 0) out.push(analyzeTile(t, visible, genbutsu, dangerMap));
    }
    out.sort((a, b) => a.risk - b.risk || a.tile - b.tile);
    return out;
  }

  // ---- 小工具 ----
  function parseHand(str) {
    const base = { m: 0, p: 9, s: 18, z: 27 };
    const counts = new Array(34).fill(0);
    let nums = [];
    for (const ch of str) {
      if (ch >= '0' && ch <= '9') nums.push(+ch);
      else if (ch in base) { for (const n of nums) counts[base[ch] + n - 1]++; nums = []; }
    }
    return counts;
  }
  function parseTiles(str) {
    const c = parseHand(str), out = [];
    for (let t = 0; t < 34; t++) for (let k = 0; k < c[t]; k++) out.push(t);
    return out;
  }
  function pon(tile) { return { type: 'pon', tiles: [tile, tile, tile] }; }
  function chi(a, b, c) { return { type: 'chi', tiles: [a, b, c] }; }

  global.MJDefense = {
    W, FLUSH_BUMP, DRAGON_BUMP_1, DRAGON_BUMP_2, WIND_BUMP,
    isHonor, tileName, waitShapes, evalShape, headline, analyzeTile,
    buildVisible, buildDangerMap, rankDiscards, parseHand, parseTiles, pon, chi
  };
})(typeof window !== 'undefined' ? window : globalThis);

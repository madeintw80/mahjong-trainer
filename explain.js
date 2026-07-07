/*
 * explain.js — 結果面板的「白話分點解釋」產生器 (牌效率 + 防守共用)
 *
 * 設計原則：說明只用「保證正確」的資訊
 *   - 牌效率：向聽數、進張張數/牌種、每張進張牌「配手上哪幾張成型」全是從實際手牌讀出，不會亂講。
 *   - 防守  ：直接把 defense.js 算好的每個聽牌型(活/死+死因)翻成白話。
 * 回傳一律是「一句一點」的字串陣列，前端逐點列成 <li>。
 */
(function (global) {
  'use strict';

  const tl = i => MJ.tileLabel(i);                  // 3萬 這種標籤
  const shantenText = s => (s === 0 ? '聽牌' : s + ' 向聽');

  // 丟掉 d 之後剩下的手牌
  function keptAfter(counts, d) { const c = counts.slice(); c[d]--; return c; }

  // 進張牌 u 在剩牌 kept 裡「配什麼成型」→ 事實短語(讀真牌，不會錯)
  function whyHelps(kept, u) {
    if (u < 27) {
      const p = u % 9;
      if (p >= 2 && kept[u - 2] > 0 && kept[u - 1] > 0) return '配 ' + tl(u - 2) + tl(u - 1) + ' 成順';
      if (p <= 6 && kept[u + 1] > 0 && kept[u + 2] > 0) return '配 ' + tl(u + 1) + tl(u + 2) + ' 成順';
      if (p >= 1 && p <= 7 && kept[u - 1] > 0 && kept[u + 1] > 0) return '補 ' + tl(u - 1) + tl(u + 1) + ' 的嵌張';
      if (kept[u] >= 2) return '和手上一對湊成刻';
      if (kept[u] === 1) return '和單張配成對';
    } else {
      if (kept[u] >= 2) return '湊成字牌刻子';
      if (kept[u] === 1) return '配成字牌對子';
    }
    return '推進聽牌';
  }

  // 找一個「確定的兩面搭子」(兩頭都在進張裡) → 拿來當教學 tip
  function findRyanmen(kept, ukeireTiles) {
    for (let s = 0; s < 3; s++) {
      for (let p = 1; p <= 6; p++) {
        const a = s * 9 + p;
        if (kept[a] > 0 && kept[a + 1] > 0 &&
            ukeireTiles.includes(a - 1) && ukeireTiles.includes(a + 2)) {
          return { pair: tl(a) + tl(a + 1), lo: a - 1, hi: a + 2 };
        }
      }
    }
    return null;
  }

  // ---- 牌效率解釋 ----
  function efficiency(problem, entry) {
    const best = problem.best;
    const bestTile = problem.optimal[0];
    const be = best.find(b => b.discard === bestTile);
    const keptBest = keptAfter(problem.counts, bestTile);
    const out = [];

    // 1) 結論
    out.push('打 ' + tl(bestTile) + '：保持 ' + shantenText(be.shanten) +
             '，進張最多 ' + be.ukeireTotal + ' 張（' + be.ukeireTiles.length + ' 種牌）');

    // 2) 進張來源(逐張說配什麼成型，全是事實)
    const detail = be.ukeireTiles.slice(0, 6).map(u => tl(u) + '（' + whyHelps(keptBest, u) + '）').join('、');
    out.push('進張來源：' + detail + (be.ukeireTiles.length > 6 ? ' …等' : ''));

    // 3) 對比：你的選擇 vs 最佳(或最佳 vs 反例)
    if (!problem.optimal.includes(entry.discard)) {
      if (entry.shanten > be.shanten) {
        out.push('你打 ' + tl(entry.discard) + ' 會退步到 ' + shantenText(entry.shanten) +
                 '，進張只剩 ' + entry.ukeireTotal + ' 張，比最佳少 ' + (be.ukeireTotal - entry.ukeireTotal) + ' 張');
      } else {
        const lost = be.ukeireTiles.filter(u => !entry.ukeireTiles.includes(u));
        out.push('你打 ' + tl(entry.discard) + ' 一樣 ' + shantenText(entry.shanten) +
                 '，但少了 ' + (lost.length ? lost.map(tl).join('、') : '一些') +
                 ' 這 ' + (be.ukeireTotal - entry.ukeireTotal) + ' 張進張');
      }
    } else {
      const worst = best[best.length - 1];
      if (worst.discard !== bestTile) {
        const cmp = worst.shanten > be.shanten ? ('退步到 ' + shantenText(worst.shanten))
          : ('進張只剩 ' + worst.ukeireTotal + ' 張');
        const lost = be.ukeireTiles.filter(u => !worst.ukeireTiles.includes(u));
        out.push('反例：改打 ' + tl(worst.discard) + ' 就 ' + cmp +
                 (lost.length ? ('，少了 ' + lost.slice(0, 5).map(tl).join('、')) : ''));
      }
    }

    // 4) 牌感 tip(只在確定有兩面時給，避免亂教)
    const ry = findRyanmen(keptBest, be.ukeireTiles);
    if (ry) out.push('💡 留住 ' + ry.pair + ' 這種兩面搭子，兩頭 ' + tl(ry.lo) + '、' + tl(ry.hi) +
                     ' 都能進——這就是兩面比嵌張(只進一種)強的原因');
    return out;
  }

  // ---- 防守解釋 ----
  const SHAPE_CN = { ryanmen: '兩面', kanchan: '嵌張', penchan: '邊張', shanpon: '雙碰', tanki: '單騎' };
  const WHY_CN = { suji: '筋', wall: '壁', few: '張數' };

  // 把一張牌的風險拆成白話原因
  function reasons(a) {
    if (a.genbutsu) return ['對手丟過這張，詐胡不能胡 → 絕對安全'];
    const out = [];
    if (MJDefense.isHonor(a.tile)) out.push('字牌只剩單騎/雙碰，目前見 ' + a.seen + ' 張');
    const alive = [...new Set(a.shapes.filter(s => s.alive).map(s => SHAPE_CN[s.type]))];
    const deadSeq = a.shapes.filter(s => !s.alive && (s.type === 'ryanmen' || s.type === 'kanchan' || s.type === 'penchan'));
    const dead = [...new Set(deadSeq.map(s => SHAPE_CN[s.type] + '被' + (WHY_CN[s.why] || '') + '封'))];
    if (dead.length) out.push('已封死：' + dead.join('、'));
    if (alive.length) out.push('還活著：' + alive.join('、') + ' 能胡到你');
    return out;
  }

  function defense(ranked, pickedTile) {
    const safest = ranked[0];
    const pick = ranked.find(r => r.tile === pickedTile);
    const out = [];

    out.push('✅ 最安全：打 ' + MJDefense.tileName(safest.tile) + '（' + safest.headline +
             (safest.genbutsu ? '' : '，風險 ' + safest.risk) + '）— ' + reasons(safest).join('；'));

    if (pick && pick.tile !== safest.tile) {
      out.push('⚠️ 你打 ' + MJDefense.tileName(pick.tile) + '（' + pick.headline + '，風險 ' + pick.risk +
               '）比較危險 — ' + reasons(pick).join('；'));
    }

    // 場況/大牌警示(去重)
    const warns = [...new Set(ranked.flatMap(r => r.warnings || []))];
    for (const w of warns) out.push(w);

    out.push('💡 口訣：現物最穩；筋牌只擋「兩面」，嵌張/單騎/雙碰照樣中，別把筋牌當免死金牌');
    return out;
  }

  global.MJExplain = { efficiency, defense };
})(typeof window !== 'undefined' ? window : globalThis);

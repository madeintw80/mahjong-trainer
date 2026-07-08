/*
 * explain.js — 結果面板的「白話分點解釋」產生器 (牌效率 + 防守 + 牌理共用)
 *
 * 設計原則：說明只用「保證正確」的資訊
 *   - 牌效率/牌理：向聽(進聽)數、進張張數/牌種、每張進張牌「配手上哪幾張成型」全是從實際手牌讀出，不會亂講。
 *   - 防守      ：直接把 defense.js 算好的每個聽牌型(活/死+死因)翻成白話。
 * 橫飛術語導入(2026-07-08)：進聽=向聽、兩面>嵌張>對子>邊張、雙頭>單吊、字牌>么九>中張、
 *   快速原則、千金斷訣——道地術語 + 每條都附「為什麼」白話(用戶是初學者，重懂道理)。
 * 回傳一律是「一句一點」的字串陣列，前端逐點列成 <li>。
 */
(function (global) {
  'use strict';

  const tl = i => MJ.tileLabel(i);                  // 3萬 這種標籤
  // 導入橫飛術語：向聽數 = 進聽(0 進聽 = 已聽牌)
  const shantenText = s => (s === 0 ? '聽牌' : s + ' 進聽');
  const jinTing = s => (s === 0 ? '已聽牌' : s + ' 進聽');

  // 一張牌的「孤張等級」(客觀牌性，可安全講)：字牌 > 么九 > 中張(越左越先丟)
  function isoKind(i) {
    if (i >= 27) return '字牌';
    const p = i % 9;                                // 0~8 = 1~9
    return (p === 0 || p === 8) ? '么九' : '中張';
  }

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

  // ---- 牌效率解釋(導入橫飛術語) ----
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

    // 4) 橫飛牌感 tip：有確定兩面就給具體、否則給造型排序通則
    const ry = findRyanmen(keptBest, be.ukeireTiles);
    if (ry) {
      out.push('💡 留住 ' + ry.pair + ' 這種<b>兩面(雙頭)</b>搭子，兩頭 ' + tl(ry.lo) + '、' + tl(ry.hi) +
               ' 都能進——這就是橫飛鐵律<b>兩面 &gt; 嵌張</b>(嵌張只進中間一種)的原因');
    } else {
      out.push('💡 橫飛造型鐵律：<b>兩面 &gt; 嵌張 &gt; 對子 &gt; 邊張</b>。同樣差一張成面子，兩面兩頭都進(最多 8 張)最強，留搭子優先留兩面');
    }
    return out;
  }

  // ---- 牌理 ① 該攻該守解釋(幾進聽量尺) ----
  function attackDefense(prob) {
    const s = prob.shanten;
    const out = [];
    if (prob.answer === 'atk') {
      out.push('這手 ' + jinTing(s) + '，落在<b>「0～3 進聽」的好牌區 → 該攻</b>');
      if (s === 0) out.push('為什麼攻：已經聽牌了，當然全力打、等胡就好，沒有守的理由');
      else out.push('為什麼攻：離聽牌很近，全力追進張、搶速度最划算，這就是橫飛<b>「快速原則」</b>——用機率盡快聽牌');
      out.push('打法：每張捨牌都選「進張最大」的走法，別分心防守把好牌拖慢');
    } else {
      out.push('這手 ' + jinTing(s) + '，落在<b>「6 進聽以上」的爛牌區 → 該守</b>');
      out.push('為什麼守：離聽牌太遠，硬追也快不起來——橫飛口訣<b>「爛牌擺明快不起來」</b>，這時保命比搶胡重要');
      out.push('打法：先留安全牌、盯著別人的牌河，寧可不胡也別放槍送大牌');
    }
    out.push('💡 幾進聽量尺：<b>0~3 該攻、4~5 看場況、6+ 該守</b>。進聽數(還差幾步聽牌)就是手牌好壞最客觀的溫度計');
    return out;
  }

  // ---- 牌理 ② 先丟哪張孤張解釋(連接力排序) ----
  function efficiencyIso(problem, entry) {
    const best = problem.best;
    const bestTile = problem.optimal[0];
    const be = best.find(b => b.discard === bestTile);
    const iso = problem.iso || [];
    const out = [];

    out.push('先丟 ' + tl(bestTile) + '（' + isoKind(bestTile) + '孤張）：這手最該退的孤張，丟了保持 ' +
             shantenText(be.shanten) + '、進張最多 ' + be.ukeireTotal + ' 張');

    // 反例：丟另一張孤張進張較少 → 說明為什麼該留它
    const cand = best.filter(b => iso.includes(b.discard) && b.discard !== bestTile)
                     .sort((a, b) => a.ukeireTotal - b.ukeireTotal)[0];
    if (cand) {
      const diff = be.ukeireTotal - cand.ukeireTotal;
      const kind = isoKind(cand.discard);
      const why = kind === '中張'
        ? '中張鄰牌多、連接力最強，丟了最虧，該留到最後'
        : '它比 ' + tl(bestTile) + ' 更有連接潛力，先留著別急著丟';
      out.push('別改丟 ' + tl(cand.discard) + '（' + kind + '孤張）：進張會少 ' + diff + ' 張——' + why);
    }

    out.push('💡 橫飛孤張捨牌順序：<b>字牌 &gt; 么九 &gt; 中張</b>(越左越先丟)。' +
             '為什麼：字牌只能等自己成對(1 種進張)，么九只有一頭能接，中張左右都能連(最多鄰牌)——所以先退字牌、留中張');
    return out;
  }

  // ---- 牌理 ③ 選哪種聽法解釋(雙頭>單吊) ----
  function efficiencyWait(problem, entry) {
    const best = problem.best;
    const bestTile = problem.optimal[0];
    const be = best.find(b => b.discard === bestTile);
    const out = [];

    out.push('丟 ' + tl(bestTile) + '：聽得最寬，等 ' + be.ukeireTiles.map(tl).join('、') +
             ' 共 ' + be.ukeireTotal + ' 張可胡');

    // 對比較窄的聽法
    const others = best.filter(b => b.shanten === 0 && b.discard !== bestTile)
                       .sort((a, b) => a.ukeireTotal - b.ukeireTotal);
    if (others.length) {
      const w = others[0];
      out.push('若改丟 ' + tl(w.discard) + '：只聽 ' + w.ukeireTiles.map(tl).join('、') +
               ' 共 ' + w.ukeireTotal + ' 張，白白少了 ' + (be.ukeireTotal - w.ukeireTotal) + ' 張胡牌機會');
    }

    out.push('💡 橫飛聽牌型排序：<b>雙頭(兩面) &gt; 雙碰 &gt; 嵌張/邊張 &gt; 單吊</b>。' +
             '為什麼優先雙頭：胡牌靠等別人打或自摸，能胡的牌越多越好——雙頭最多 8 張、單吊剩 3 張，胡牌機會差一倍多');
    return out;
  }

  // ---- 防守解釋(已高度術語化，補千金斷訣心法) ----
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

    out.push('💡 橫飛<b>千金斷訣</b>：從對手捨牌反推危險牌。現物最穩；筋牌只擋<b>兩面</b>，嵌張/單騎/雙碰照樣中，別把筋牌當免死金牌');
    return out;
  }

  global.MJExplain = { efficiency, attackDefense, efficiencyIso, efficiencyWait, defense };
})(typeof window !== 'undefined' ? window : globalThis);

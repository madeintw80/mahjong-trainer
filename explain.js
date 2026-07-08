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
  // ---- 攻守「怎麼算出幾進聽」用的牌型分解顯示小工具 ----
  const SUITZ = ['萬', '筒', '索'];
  function compactTiles(tiles) {                    // [5,6,7]→"678萬"；字牌→逐張"東東東"
    if (tiles[0] >= 27) return tiles.map(tl).join('');
    return tiles.map(t => (t % 9 + 1)).join('') + SUITZ[Math.floor(tiles[0] / 9)];
  }
  function taatsuInfo(t) {                           // 搭子 → {label, kind, need(欠什麼)}
    const a = t[0], b = t[1];
    if (a === b) return { label: compactTiles(t), kind: '對子', need: tl(a) };            // 欠同張成刻
    if (b === a + 2) return { label: compactTiles(t), kind: '嵌張', need: tl(a + 1) };    // 欠中間
    const p = a % 9;                                // [a,a+1] 兩面/邊張
    if (p === 0) return { label: compactTiles(t), kind: '邊張', need: tl(a + 2) };        // 12→欠3
    if (p === 7) return { label: compactTiles(t), kind: '邊張', need: tl(a - 1) };        // 89→欠7
    return { label: compactTiles(t), kind: '兩面', need: tl(a - 1) + '或' + tl(a + 2) };
  }
  // 把手牌拆成面子/搭子/雀頭，解釋「幾進聽」怎麼算出來(標出實際牌)
  function shantenBreakdown(prob, s) {
    const d = MJ.decompose(prob.counts);
    const out = [];
    const pieces = [];
    if (d.melds.length) pieces.push('面子 <b>' + d.melds.map(compactTiles).join('、') + '</b>');
    if (d.pair !== null) pieces.push('雀頭 <b>' + tl(d.pair) + tl(d.pair) + '</b>');
    if (d.taatsu.length) pieces.push('搭子 <b>' +
      d.taatsu.map(t => { const x = taatsuInfo(t); return x.label + '(' + x.kind + '欠' + x.need + ')'; }).join('、') + '</b>');
    const floatTxt = d.floats.length ? '，散張 ' + d.floats.map(tl).join(' ') : '';
    out.push('🀄 拆牌看組成：' + (pieces.length ? pieces.join('、') : '沒有現成面子/搭子') + floatTxt);
    out.push('🧮 算幾進聽：胡牌要 <b>5 面子＋1 雀頭</b>；這手 ' + d.melds.length + ' 面子＋' + d.taatsu.length + ' 搭子＋' +
      (d.pair !== null ? '有雀頭' : '沒雀頭') + ' → ' +
      (s === 0 ? '<b>已聽牌</b>' : '還差 <b>' + s + ' 步</b>，就是 <b>' + s + ' 進聽</b>'));
    return out;
  }

  function attackDefense(prob) {
    const s = prob.shanten;
    const out = [];
    const atk = prob.answer === 'atk';
    if (atk) out.push('這手 ' + jinTing(s) + '，落在<b>「0～3 進聽」的好牌區 → 該攻</b>');
    else out.push('這手 ' + jinTing(s) + '，落在<b>「6 進聽以上」的爛牌區 → 該守</b>');
    for (const line of shantenBreakdown(prob, s)) out.push(line);   // 怎麼算出幾進聽(拆牌標出牌)
    if (atk) {
      if (s === 0) out.push('為什麼攻：已經聽牌了，當然全力打、等胡就好，沒有守的理由');
      else out.push('為什麼攻：離聽牌很近，全力追進張、搶速度最划算，這就是橫飛<b>「快速原則」</b>——用機率盡快聽牌');
      out.push('打法：每張捨牌都選「進張最大」的走法，別分心防守把好牌拖慢');
    } else {
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

  // =====================================================================
  //  讀捨牌河解釋 (讀牌模式 readdiscard.js；全是「機率讀牌」不是保證安全)
  // =====================================================================
  const SUIT_CN = ['萬', '筒', '索'];
  const GUA_CN = { small: '小掛', big: '大掛' };

  // ---- ① 向下壓：為什麼某門整條安全 ----
  function pressRead(prob, pickedSuit, pickedHalf) {
    const out = [];
    const full = prob.full;
    const suit = prob.answers[0].suit;                      // 答案都落在同一門
    const r = prob.res.find(x => x.suit === suit);
    // discarded 是 n 值(0~8)，轉回牌名；低段=2/3(n1,2)、高段=7/8(n6,7)
    const nameOf = n => tl(suit * 9 + n);
    const lows = r.discarded.filter(n => n === 1 || n === 2).map(nameOf);
    const highs = r.discarded.filter(n => n === 6 || n === 7).map(nameOf);
    if (full) {
      out.push('✅ ' + SUIT_CN[suit] + '子<b>整條安全</b>：低段丟過 ' + lows.join('、') + '、高段丟過 ' +
               highs.join('、') + ' → 上下兩頭都放棄了');
      out.push('為什麼整條：2/3(低段)和 7/8(高段)是搭子的「連接核心」，兩頭都當廢牌丟了 → ' +
               SUIT_CN[suit] + '子這門根本沒搭子在做 → 整條 1~9 都不太會聽');
    } else {
      const half = prob.answers[0].half;
      if (half === 'low') {
        out.push('✅ ' + SUIT_CN[suit] + '子<b>小掛半條(1-4)安全</b>：對手丟過 ' + lows.join('、') + '（低段核心）');
        out.push('為什麼只有半條：2/3 是低段的搭子連接核心，丟了 → 低段(1-4)沒搭子在做；' +
                 '但高段(7/8)還沒丟 → 大掛半條(6-9)可能還有搭、<b>仍要防</b>');
      } else {
        out.push('✅ ' + SUIT_CN[suit] + '子<b>大掛半條(6-9)安全</b>：對手丟過 ' + highs.join('、') + '（高段核心）');
        out.push('為什麼只有半條：7/8 是高段的搭子連接核心，丟了 → 高段(6-9)沒搭子在做；' +
                 '但低段(2/3)還沒丟 → 小掛半條(1-4)可能還有搭、<b>仍要防</b>');
      }
    }
    // 選錯：玩家選的半掛不在答案裡 → 那半的核心沒被丟過(丟了的話它就 safe、會列進答案)
    if (pickedSuit != null && !prob.answers.some(a => a.suit === pickedSuit && a.half === pickedHalf)) {
      const range = pickedHalf === 'low' ? '1-4' : '6-9';
      const core = pickedHalf === 'low' ? '低段(2/3)' : '高段(7/8)';
      out.push('⚠️ 你選的 ' + SUIT_CN[pickedSuit] + '子' + range + '：' + core +
               ' 還沒被對手丟過 → 那半段他可能還有搭子在做，不算安全');
    }
    out.push('💡 橫飛<b>向下壓</b>：丟低段核心(2/3)→小掛半條不做、丟高段核心(7/8)→大掛半條不做、' +
             '兩頭都丟→整條壓。這是<b>讀牌機率</b>不是保證，只是他聽那半的機會很低');
    return out;
  }

  // ---- ② 六掛：為什麼最晚出現的掛最危險 ----
  function guaRead(prob, pickedTile) {
    const out = [];
    const repOf = g => prob.cands.find(c => c.suit === g.suit && c.gua === g.gua);
    const latePresent = prob.dangerList.find(x => x.present);   // 最晚出現的掛(有的話)
    const absents = prob.dangerList.filter(x => !x.present);    // 完全沒出現的掛

    const ansNames = prob.answers.map(t => tl(t)).join('、');
    out.push('⚠️ 最危險（並列）：' + ansNames + ' —— 危險來自兩種不同訊號，都得防');
    // (甲) 最晚出現的掛：剛拆到那附近
    if (latePresent) {
      const rep = repOf(latePresent);
      out.push('①「' + SUIT_CN[latePresent.suit] + GUA_CN[latePresent.gua] + '」(候選 ' + (rep ? tl(rep.tile) : '?') +
               ')到第 ' + (latePresent.first_turn + 1) + ' 巡<b>最晚</b>才第一次被丟：玩家先丟沒用的牌區，' +
               '能撐到最後才吐＝剛拆到那附近＝真牌貼手');
    }
    // (乙) 完全沒出現的掛：整條留著在做
    if (absents.length) {
      const names = absents.map(a => {
        const rep = repOf(a);
        return '「' + SUIT_CN[a.suit] + GUA_CN[a.gua] + '」(候選 ' + (rep ? tl(rep.tile) : '?') + ')';
      }).join('、');
      out.push('②' + names + '<b>整段完全沒丟過</b>：對手可能一路留著在做那條，真牌整條藏著、一樣危險');
    }
    out.push('為什麼並列：①剛拆到、②整條留著，來源不同但都危險——硬把「沒出現」當最安全會踩雷（真牌常藏在沒表態的掛）');
    // 對照最安全的掛(res 排序最後一個=最早出現、非 danger)
    const safest = prob.res[prob.res.length - 1];
    if (safest && !safest.danger && safest.present) {
      out.push('對照：「' + SUIT_CN[safest.suit] + GUA_CN[safest.gua] + '」第 ' + (safest.first_turn + 1) +
               ' 巡就丟了(最早)→ 老早放棄那區，相對安全');
    }
    if (pickedTile != null && !prob.answers.includes(pickedTile)) {
      out.push('你選的 ' + tl(pickedTile) + ' 所屬的掛「早早出現、又不是最晚」→ 他老早放棄那區，沒那麼危險');
    }
    out.push('💡 橫飛<b>六掛斷聽</b>：每門分小掛(1-4)、大掛(6-9)共六掛。<b>最晚才動</b>的掛(剛拆到)＋<b>完全沒表態</b>的掛(整條留著)都是真牌熱區。機率讀牌、非保證');
    return out;
  }

  // ---- ③ 衍牌：為什麼 N 鄰近某張最危險 ----
  const NOBE_SHAPE = { ryanmen: '兩面', kanchan: '嵌張', penchan: '邊張', shanpon: '雙碰' };
  function nobeRead(prob, pickedTile) {
    const top = prob.res[0];
    const out = [];
    const tie = prob.answers && prob.answers.length > 1;
    if (tie) {
      const names = prob.answers.map(t => tl(t)).join('、');
      const nN = prob.N % 9;
      const someLower = prob.answers.some(t => (t % 9) < nN);   // 有並列危險牌在 N 下方(數字更小)
      const someHigher = prob.answers.some(t => (t % 9) > nN);  // 有並列危險牌在 N 上方(數字更大)
      if (someLower && someHigher) {
        // 中央牌：左右鄰對稱、危險分相同 → 誠實講「兩鄰同險」(衍牌真正的牌理)
        out.push('⚠️ 最危險（並列）：' + names + '——拆掉含 ' + tl(prob.N) + ' 的搭子後，' +
                 tl(prob.N) + ' 的<b>左右鄰牌一樣危險</b>（兩邊都能組搭子聽牌）');
      } else {
        // 端牌(1/9)：並列危險牌都在同一側(邊緣那側沒牌可接) → 講「同側並列」而非「左右」
        const side = someHigher ? '數字較大' : '數字較小';
        out.push('⚠️ 最危險（並列）：' + names + '——' + tl(prob.N) + ' 是<b>端牌</b>，這幾張都在<b>' +
                 side + '的一側</b>（往中央走）、危險一樣高，這就是端牌拆搭的<b>不對稱</b>');
      }
    } else {
      const shapeCn = top.shapes.map(s => NOBE_SHAPE[s]).join('、');
      out.push('⚠️ 最危險 ' + tl(top.tile) + '（危險分 ' + top.score + '）：對手拆掉含 ' + tl(prob.N) +
               ' 的搭子後，還能用 ' + shapeCn + ' 這些搭子聽到它');
      // P6-1 端牌(1/2/8/9)：靠牌河邊緣那側幾乎沒牌可接 → 危險偏單側、不對稱(有別中央牌左右都危)
      const nEdge = prob.N % 9;
      if (nEdge <= 1 || nEdge >= 7) {
        const side = nEdge <= 1 ? '數字較大' : '數字較小';
        out.push('🔸 ' + tl(prob.N) + ' 是<b>端牌</b>，靠牌河邊緣那側幾乎沒牌可接 → 危險<b>偏向' + side +
                 '的一側</b>（往中央走），不像中央牌左右都得防——這就是端牌拆搭的<b>不對稱</b>');
      }
    }
    out.push('為什麼真牌在 ' + tl(prob.N) + ' 附近：他拆一個含 ' + tl(prob.N) + ' 的搭子、丟出 ' + tl(prob.N) +
             '，是為了讓「旁邊」成型才拆——搭子由相鄰牌組成，所以真牌就落在丟出牌的鄰近');
    if (pickedTile != null && !prob.answers.includes(pickedTile)) {
      const p = prob.res.find(x => x.tile === pickedTile);
      out.push(p
        ? '你選的 ' + tl(pickedTile) + '（危險分 ' + p.score + '）：也危險，但能聽到它的搭子較少、排在後面'
        : '你選的牌離 ' + tl(prob.N) + ' 較遠，被聽到的機會低');
    }
    out.push('💡 橫飛<b>衍牌(N±1、N±2)</b>：拆搭丟 N，鄰牌最危險、越貼近越險。' +
             '(橫飛實戰的精細排序帶經驗成分，這裡用「搭子數量」給你客觀的相對危險)');
    return out;
  }

  global.MJExplain = {
    efficiency, attackDefense, efficiencyIso, efficiencyWait, defense,
    pressRead, guaRead, nobeRead
  };
})(typeof window !== 'undefined' ? window : globalThis);

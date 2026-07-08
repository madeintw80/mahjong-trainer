/* tiles.js — 麻將牌面 SVG（全自繪，版權自有；純靜態、可離線）
   ------------------------------------------------------------------
   為什麼這樣設計：
   1. 每張牌只回傳「牌面內層 SVG 字串」，背景透明、只畫花紋/文字。
      牌的白底、圓角、立體邊、選中/變暗的外框，通通還是由 CSS 的 .tile 提供，
      SVG 只是浮在上面那層圖 → 所以作答回饋(picked/best/dim)完全不受影響。
   2. 座標系統固定用 48 x 64 的 viewBox，會自動縮放到 .tile 的 42x56（一般）
      或 30x40（小牌 sm）→ 一套圖兩種尺寸共用，不必畫兩份。
   3. 牌編號 0-33：0-8=1~9萬 / 9-17=1~9筒 / 18-26=1~9索 / 27-33=東南西北中發白。
   ------------------------------------------------------------------ */
'use strict';

const MJTiles = (function () {
  // ---- 固定配色（模擬真牌；深色模式牌面仍是淺色，所以沿用同一組色） ----
  const C = {
    manNum: '#26313b',   // 萬：上方中文數字（深墨）
    man:    '#c0392b',   // 萬：下方「萬」字（紅）
    pin:    '#1f6feb',   // 筒：藍（外環）
    pinAlt: '#1e8449',   // 筒：綠（中心點點綴，如 5筒/9筒 中央）
    red:    '#c0392b',   // 紅點芯 / 紅中 / 紅竹
    sou:    '#1e8449',   // 索：綠竹
    souAlt: '#c0392b',   // 索：紅竹（點綴，如 5索中央/7索頂）
    wind:   '#28344c',   // 東南西北：深藍墨
    green:  '#1e8449',   // 發：綠
    frame:  '#2f6fed',   // 白板：藍框
  };
  // 中文字型（Windows/iOS/一般都涵蓋），粗體讓牌面清楚
  const CJK = "font-family:'Microsoft JhengHei','PingFang TC','Heiti TC',sans-serif;font-weight:700";
  const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九']; // 萬的中文數字
  const WIND = ['東', '南', '西', '北'];

  // ---- 小零件 ----
  // 一顆「筒」的圓點：外環 + 白留白 + 紅(或指定)芯，像真牌的同心圓
  function dot(cx, cy, r, ring, core) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ring}"/>` +
           `<circle cx="${cx}" cy="${cy}" r="${(r * 0.44).toFixed(1)}" fill="#fffdf7"/>` +
           `<circle cx="${cx}" cy="${cy}" r="${(r * 0.22).toFixed(1)}" fill="${core}"/>`;
  }
  // 一根「索」的竹子：圓角綠條 + 上下小節頭 + 兩道竹節線
  // node = 竹節線顏色(預設深綠；八索傳綠色讓節線融進竹身、不顯黑)
  function bamboo(cx, cy, h, col, node) {
    node = node || '#0b4a27';
    const w = 5, x = cx - w / 2, y = cy - h / 2;
    const n1 = y + h * 0.36, n2 = y + h * 0.64;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.4" fill="${col}"/>` +
           `<circle cx="${cx}" cy="${y}" r="2.3" fill="${col}"/>` +
           `<circle cx="${cx}" cy="${y + h}" r="2.3" fill="${col}"/>` +
           `<line x1="${x}" y1="${n1.toFixed(1)}" x2="${x + w}" y2="${n1.toFixed(1)}" stroke="${node}" stroke-width="0.9"/>` +
           `<line x1="${x}" y1="${n2.toFixed(1)}" x2="${x + w}" y2="${n2.toFixed(1)}" stroke="${node}" stroke-width="0.9"/>`;
  }
  // 一索：傳統是一隻鳥（孔雀/麻雀），這裡畫一隻小綠鳥
  function bird() {                                          // 整體上移、尾巴不貼底邊
    return '' +
      `<ellipse cx="25" cy="34" rx="8" ry="10.5" fill="${C.sou}"/>` +                  // 身體
      `<path d="M27 27 q6.5 5 3 14 q-3 4 -6.5 2 z" fill="#14603a"/>` +                 // 翅膀(深綠)
      `<circle cx="21" cy="19" r="5.8" fill="${C.sou}"/>` +                            // 頭
      `<path d="M15 18 L21 15 L21 22 Z" fill="${C.red}"/>` +                           // 喙(紅)
      `<path d="M20 12 L18 7 L23 10 Z" fill="${C.red}"/>` +                            // 冠(紅)
      `<circle cx="22" cy="18" r="1.5" fill="#fffdf7"/><circle cx="22" cy="18" r="0.8" fill="#14181d"/>` + // 眼
      `<path d="M23 43 L18 52 M25 44 L25 53 M27 43 L32 52" stroke="${C.sou}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` + // 尾羽
      `<path d="M23 44 L21 50 M28 44 L30 50" stroke="${C.red}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`; // 腳
  }

  // ---- 筒（1-9）----
  function pin(n) {
    if (n === 1) {                                          // 一筒：華麗大同心圓
      const cx = 24, cy = 32;
      return `<circle cx="${cx}" cy="${cy}" r="14" fill="${C.pin}"/>` +
             `<circle cx="${cx}" cy="${cy}" r="10.5" fill="#fffdf7"/>` +
             `<circle cx="${cx}" cy="${cy}" r="7.5" fill="${C.pinAlt}"/>` +
             `<circle cx="${cx}" cy="${cy}" r="4.2" fill="#fffdf7"/>` +
             `<circle cx="${cx}" cy="${cy}" r="2.2" fill="${C.red}"/>`;
    }
    const R = { 2: 8, 3: 7, 4: 7, 5: 7, 6: 6.5, 7: 5.6, 8: 5.6, 9: 5.6 }[n];
    // 每張的圓點座標；第三格 'c' = 中心，用綠環點綴
    const P = {
      2: [[24, 20], [24, 44]],
      3: [[15, 18], [24, 32], [33, 46]],
      4: [[16, 20], [32, 20], [16, 44], [32, 44]],
      5: [[16, 19], [32, 19], [24, 32, 'c'], [16, 45], [32, 45]],
      6: [[16, 18], [32, 18], [16, 32], [32, 32], [16, 46], [32, 46]],
      // 七筒：上方斜三角（一條斜線）+ 下方田字 2×2；點跟八筒同大(r5.6)、邊界對齊
      7: [[14, 24], [24, 19], [34, 14], [16, 39], [32, 39], [16, 51], [32, 51]],
      8: [[16, 15], [32, 15], [16, 27], [32, 27], [16, 39], [32, 39], [16, 51], [32, 51]],
      9: [[13, 17], [24, 17], [35, 17], [13, 32], [24, 32, 'c'], [35, 32], [13, 47], [24, 47], [35, 47]],
    }[n];
    return P.map(p => dot(p[0], p[1], R, p[2] === 'c' ? C.pinAlt : C.pin, C.red)).join('');
  }

  // ---- 索（1-9）----
  function sou(n) {
    if (n === 1) return bird();
    if (n === 8) return sou8();                              // 八索：交錯斜排(見 sou8)
    // 每根竹子座標 [x, y, 高度]；第四格 'r' = 紅竹點綴
    const B = {
      2: [[24, 20, 18], [24, 44, 18]],                       // 二索：上下直排(同二筒豎疊)
      3: [[24, 17, 17], [15, 45, 17], [33, 45, 17]],         // 三索：上1下2三角
      4: [[16, 20, 16], [32, 20, 16], [16, 44, 16], [32, 44, 16]],
      5: [[16, 19, 15], [32, 19, 15], [24, 32, 16, 'r'], [16, 45, 15], [32, 45, 15]],
      6: [[13, 20, 16], [24, 20, 16], [35, 20, 16], [13, 44, 16], [24, 44, 16], [35, 44, 16]],
      7: [[24, 13, 12, 'r'], [13, 30, 13], [24, 30, 13], [35, 30, 13], [13, 47, 13], [24, 47, 13], [35, 47, 13]],
      9: [[13, 17, 13], [24, 17, 13], [35, 17, 13], [13, 32, 13], [24, 32, 13, 'r'], [35, 32, 13], [13, 47, 13], [24, 47, 13], [35, 47, 13]],
    }[n];
    return B.map(b => bamboo(b[0], b[1], b[2], b[3] === 'r' ? C.souAlt : C.sou)).join('');
  }
  // 一段「斜竹子」：從 (x1,y1) 畫到 (x2,y2)，樣式跟直竹子一致(給八索的 W/M 用)
  function bambooSeg(x1, y1, x2, y2, node) {
    node = node || '#0b4a27';
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const L = Math.hypot(x2 - x1, y2 - y1);
    const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 90; // 把直竹子轉到線段方向
    const w = 4.2, x = mx - w / 2, y = my - L / 2;
    const n1 = y + L * 0.34, n2 = y + L * 0.66;                     // 兩道竹節
    return `<g transform="rotate(${ang.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})">` +
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${L.toFixed(1)}" rx="2.1" fill="${C.sou}"/>` +
      `<line x1="${x.toFixed(1)}" y1="${n1.toFixed(1)}" x2="${(x + w).toFixed(1)}" y2="${n1.toFixed(1)}" stroke="${node}" stroke-width="0.8"/>` +
      `<line x1="${x.toFixed(1)}" y1="${n2.toFixed(1)}" x2="${(x + w).toFixed(1)}" y2="${n2.toFixed(1)}" stroke="${node}" stroke-width="0.8"/>` +
      `</g>`;
  }
  // 八索：兩側各上下一根直竹(共 4) + 中央 4 根斜竹拼成 ∧(上)∨(下) 交錯(共 8 根 = 八索)，
  //        斜竹尖端與接點放竹節頭，跟參考圖的華麗八索一致
  function sou8() {
    // 竹身綠、竹節線用預設深綠(#0b4a27) → 跟其他索一樣有「黑黑的竹節」
    const verts = bamboo(13, 20, 14, C.sou) + bamboo(13, 45, 14, C.sou) +   // 左：上、下直竹
                  bamboo(35, 20, 14, C.sou) + bamboo(35, 45, 14, C.sou);    // 右：上、下直竹(邊界縮進)
    const diag = bambooSeg(15, 27, 24, 14) + bambooSeg(33, 27, 24, 14) +   // 上 ∧
                 bambooSeg(15, 38, 24, 51) + bambooSeg(33, 38, 24, 51);    // 下 ∨
    const knobPts = [[24, 14], [24, 51], [15, 27], [33, 27], [15, 38], [33, 38]];
    const knobs = knobPts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.3" fill="${C.sou}"/>`).join('');
    return verts + diag + knobs;
  }

  // ---- 萬（1-9）：上中文數字 + 下「萬」字，跟真牌一樣直式 ----
  function man(n) {
    return `<text x="24" y="27" text-anchor="middle" font-size="16" fill="${C.manNum}" style="${CJK}">${NUM[n - 1]}</text>` +
           `<text x="24" y="54" text-anchor="middle" font-size="20" fill="${C.man}" style="${CJK}">萬</text>`;
  }

  // ---- 字牌（27-33）----
  function honor(i) {
    if (i <= 30) {                                          // 東南西北：深藍墨大字
      return `<text x="24" y="41" text-anchor="middle" font-size="30" fill="${C.wind}" style="${CJK}">${WIND[i - 27]}</text>`;
    }
    if (i === 31) {                                         // 中：紅框 + 紅「中」
      return `<rect x="9" y="11" width="30" height="42" rx="3" fill="none" stroke="${C.red}" stroke-width="1.8"/>` +
             `<text x="24" y="42" text-anchor="middle" font-size="25" fill="${C.red}" style="${CJK}">中</text>`;
    }
    if (i === 32) {                                         // 發：綠框 + 綠「發」
      return `<rect x="9" y="11" width="30" height="42" rx="3" fill="none" stroke="${C.green}" stroke-width="1.8"/>` +
             `<text x="24" y="42" text-anchor="middle" font-size="23" fill="${C.green}" style="${CJK}">發</text>`;
    }
    // 33 白：藍色雙空框（白板，牌面留白）
    return `<rect x="10" y="10" width="28" height="44" rx="3" fill="none" stroke="${C.frame}" stroke-width="1.8"/>` +
           `<rect x="14" y="14" width="20" height="36" rx="2" fill="none" stroke="${C.frame}" stroke-width="0.9"/>`;
  }

  // ---- 對外：回傳第 i 張牌的內層 SVG 字串 ----
  function face(i) {
    let art;
    if (i < 9) art = man(i + 1);
    else if (i < 18) art = pin(i - 9 + 1);
    else if (i < 27) art = sou(i - 18 + 1);
    else art = honor(i);
    // aria-hidden：牌面純視覺，語意由外層 div 的 dataset.index 決定
    return `<svg class="face" viewBox="0 0 48 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${art}</svg>`;
  }

  return { face };
})();

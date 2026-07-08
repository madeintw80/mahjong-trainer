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
  function bamboo(cx, cy, h, col) {
    const w = 5, x = cx - w / 2, y = cy - h / 2;
    const n1 = y + h * 0.36, n2 = y + h * 0.64;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.4" fill="${col}"/>` +
           `<circle cx="${cx}" cy="${y}" r="2.3" fill="${col}"/>` +
           `<circle cx="${cx}" cy="${y + h}" r="2.3" fill="${col}"/>` +
           `<line x1="${x}" y1="${n1.toFixed(1)}" x2="${x + w}" y2="${n1.toFixed(1)}" stroke="#0b4a27" stroke-width="0.9"/>` +
           `<line x1="${x}" y1="${n2.toFixed(1)}" x2="${x + w}" y2="${n2.toFixed(1)}" stroke="#0b4a27" stroke-width="0.9"/>`;
  }
  // 一索：傳統是一隻鳥（孔雀/麻雀），這裡畫一隻小綠鳥
  function bird() {
    return '' +
      `<ellipse cx="25" cy="39" rx="8" ry="11" fill="${C.sou}"/>` +                    // 身體
      `<path d="M27 31 q7 5 3 15 q-3 4 -7 2 z" fill="#14603a"/>` +                      // 翅膀(深綠)
      `<circle cx="21" cy="23" r="6" fill="${C.sou}"/>` +                               // 頭
      `<path d="M15 22 L21 19 L21 26 Z" fill="${C.red}"/>` +                            // 喙(紅)
      `<path d="M20 15 L18 10 L23 13 Z" fill="${C.red}"/>` +                            // 冠(紅)
      `<circle cx="22" cy="22" r="1.5" fill="#fffdf7"/><circle cx="22" cy="22" r="0.8" fill="#14181d"/>` + // 眼
      `<path d="M23 49 L18 59 M25 50 L25 60 M27 49 L32 59" stroke="${C.sou}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` + // 尾羽
      `<path d="M23 50 L21 57 M28 50 L30 57" stroke="${C.red}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`; // 腳
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
    const R = { 2: 8, 3: 7, 4: 7, 5: 7, 6: 6.5, 7: 6, 8: 5.6, 9: 5.6 }[n];
    // 每張的圓點座標；第三格 'c' = 中心，用綠環點綴
    const P = {
      2: [[24, 20], [24, 44]],
      3: [[15, 18], [24, 32], [33, 46]],
      4: [[16, 20], [32, 20], [16, 44], [32, 44]],
      5: [[16, 19], [32, 19], [24, 32, 'c'], [16, 45], [32, 45]],
      6: [[16, 18], [32, 18], [16, 32], [32, 32], [16, 46], [32, 46]],
      7: [[13, 15], [24, 15], [35, 15], [16, 34], [32, 34], [16, 48], [32, 48]],
      8: [[16, 15], [32, 15], [16, 27], [32, 27], [16, 39], [32, 39], [16, 51], [32, 51]],
      9: [[13, 17], [24, 17], [35, 17], [13, 32], [24, 32, 'c'], [35, 32], [13, 47], [24, 47], [35, 47]],
    }[n];
    return P.map(p => dot(p[0], p[1], R, p[2] === 'c' ? C.pinAlt : C.pin, C.red)).join('');
  }

  // ---- 索（1-9）----
  function sou(n) {
    if (n === 1) return bird();
    // 每根竹子座標 [x, y, 高度]；第四格 'r' = 紅竹點綴
    const B = {
      2: [[18, 32, 32], [30, 32, 32]],
      3: [[13, 32, 30], [24, 32, 30], [35, 32, 30]],
      4: [[16, 20, 16], [32, 20, 16], [16, 44, 16], [32, 44, 16]],
      5: [[16, 19, 15], [32, 19, 15], [24, 32, 16, 'r'], [16, 45, 15], [32, 45, 15]],
      6: [[13, 20, 16], [24, 20, 16], [35, 20, 16], [13, 44, 16], [24, 44, 16], [35, 44, 16]],
      7: [[24, 13, 12, 'r'], [13, 30, 13], [24, 30, 13], [35, 30, 13], [13, 47, 13], [24, 47, 13], [35, 47, 13]],
      8: [[12, 22, 16], [21, 22, 16], [30, 22, 16], [39, 22, 16], [12, 44, 16], [21, 44, 16], [30, 44, 16], [39, 44, 16]],
      9: [[13, 17, 13], [24, 17, 13], [35, 17, 13], [13, 32, 13], [24, 32, 13, 'r'], [35, 32, 13], [13, 47, 13], [24, 47, 13], [35, 47, 13]],
    }[n];
    return B.map(b => bamboo(b[0], b[1], b[2], b[3] === 'r' ? C.souAlt : C.sou)).join('');
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

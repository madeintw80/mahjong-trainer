# 🀄 麻將練習（Mahjong Trainer）

台灣麻將 16 張練習 PWA — 手機優先、深色配色、可加主畫面離線使用。

**線上使用**：https://madeintw80.github.io/mahjong-trainer/

## 兩種模式

- **🀄 牌效率（何切る）**：摸進一張後，練習「打哪張進張最多」，計算向聽數與進張。
- **🛡️ 防守（讀安全牌）**：假設對手已聽牌，練習「打哪張最不會放槍」，用現物／筋／壁等牌型判斷安全度。

三檔難度（入門 / 進階 / 混合），兩模式共用；統計（題數 / 最佳率 / 連對）存在瀏覽器本機。

## 技術

純靜態站，無 build step。前端 `index.html` + `app.js` + `engine.js`（牌效率引擎）+ `defense.js`（防守引擎）+ `explain.js`（白話解釋）+ `style.css`；PWA 靠 `manifest.json` + `sw.js`。

`reference/` 是 Python 驗證工具（不進線上站）：兩套引擎各經「窮舉 oracle 對照 + selftest 向量 JS↔Python 一致性」雙層驗證。

## 開發

```bash
# 本機預覽（純靜態，任一 http server 皆可）
python -m http.server 3463

# 引擎驗證（需 Python）
python reference/validate.py           # 牌效率 vs 窮舉 oracle
python reference/validate_defense.py   # 防守規則 + 不變式
```

改版時記得同步升 `app.js` 的 `APP_VERSION` 與 `sw.js` 的 `CACHE` 版本號。

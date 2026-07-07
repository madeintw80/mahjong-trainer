# -*- coding: utf-8 -*-
"""跑一個 demo + 產出測試向量 testvectors.json (給 JS 移植版對答案用)"""
import json, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import engine
from validate import near_tenpai_hand, random_hand

# ---- 產測試向量 ----
rng = random.Random(42)
vectors = []
for k in range(500):
    counts = near_tenpai_hand(rng) if k % 2 == 0 else random_hand(16, rng)
    s = engine.shanten(counts)
    total, tiles = engine.ukeire(counts)
    vectors.append({"counts": counts, "shanten": s, "ukeire_total": total, "ukeire_tiles": tiles})

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'testvectors.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(vectors, f)
print("已寫出", len(vectors), "組向量 ->", os.path.abspath(out))

# ---- demo：一手 17 張，看該丟什麼 ----
demo = engine.parse_hand('123456789m123p5578s1z')  # 4順子+123p+55s+78s+東(1z) = 17 張
print('\ndemo 手牌 17 張，向聽/進張分析（前 5 個最佳丟法）：')
for d, s, tot, tiles in engine.best_discards(demo)[:5]:
    names = ",".join(engine.tile_name(t) for t in tiles) if tiles else "-"
    print(f'  丟 {engine.tile_name(d):>3} -> 向聽 {s}, 進張 {tot:>2} 張 ({names})')

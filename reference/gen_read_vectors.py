# -*- coding: utf-8 -*-
"""
產讀牌測試向量 testvectors_read.json，給 JS 版 readdiscard.js 對答案用。
每筆 = {func, 輸入, Python 算出的 expected}，三個子引擎(press/gua/nobe)都涵蓋。
"""
import json, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
from readdiscard import press_analyze, gua_analyze, nobe_analyze, parse_tiles

rng = random.Random(555)
vectors = []


def add_press(river):
    vectors.append({'func': 'press', 'river': river, 'expected': press_analyze(river)})


def add_gua(river):
    vectors.append({'func': 'gua', 'river': river, 'expected': gua_analyze(river)})


def add_nobe(N, river):
    vectors.append({'func': 'nobe', 'N': N, 'river': river, 'expected': nobe_analyze(N, river)})


# ---- 手工邊界情境(確保每個分支都被測到) ----
for s in ('38m', '3m', '8m', '19m', '5m', '27m', '38m3p8s', '123456789m', ''):
    add_press(parse_tiles(s))
for s in ('83m9s4p8p2s', '3m8m', '8m3m', '24m', '3m', '555m', '111222333m', ''):
    add_gua(parse_tiles(s))
for N in range(9):
    add_nobe(N, [])
    add_nobe(N, parse_tiles('4m'))          # 帶一張萬子現物
    add_nobe(N, parse_tiles('456p'))        # 帶跨門現物(不該干擾)

# ---- 大量隨機情境(覆蓋碼路 + 順序敏感) ----
for _ in range(500):
    river = [rng.randrange(34) for _ in range(rng.randint(0, 15))]
    add_press(river)
    add_gua(river)
for _ in range(400):
    river = [rng.randrange(34) for _ in range(rng.randint(0, 12))]
    add_nobe(rng.randrange(9), river)                    # 萬子 N
    add_nobe(9 + rng.randrange(9), river)                # 筒子 N
    add_nobe(18 + rng.randrange(9), river)               # 索子 N

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'testvectors_read.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(vectors, f, ensure_ascii=False)
print('已寫出', len(vectors), '組讀牌向量 ->', os.path.abspath(out))

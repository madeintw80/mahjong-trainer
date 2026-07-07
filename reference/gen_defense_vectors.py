# -*- coding: utf-8 -*-
"""
產防守測試向量 testvectors_defense.json，給 JS 版 defense.js 對答案用。
每筆 = 一個情境(手牌+牌河+副露) + Python 版算出的完整 rank_discards 結果。
"""
import json, random, sys, os
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import defense
from defense import rank_discards, parse_hand, parse_tiles, pon, chi

rng = random.Random(1234)
vectors = []


def add(hand, river, melds):
    vectors.append({
        'hand': hand,
        'river': river,
        'melds': melds,
        'expected': rank_discards(hand, river, melds or None),
    })


# ---- 隨機情境(大量覆蓋碼路) ----
for k in range(400):
    wall = [t for t in range(34) for _ in range(4)]
    rng.shuffle(wall)
    hand_tiles = wall[:17]
    rest = wall[17:]
    hand = [0] * 34
    for t in hand_tiles:
        hand[t] += 1
    rk = rng.randint(4, 12)
    river = rest[:rk]
    melds = []
    if k % 4 == 0:                              # 四分之一帶副露
        cc = Counter(rest[rk:])
        pons = [t for t, c in cc.items() if c >= 3]
        if pons:
            t = rng.choice(pons)
            melds.append({'type': 'pon', 'tiles': [t, t, t]})
    add(hand, river, melds)

# ---- 手工副露情境(確保大牌/一色分支都被測到) ----
h = parse_hand('19m19p19s1234567z')          # 一堆么九字(當防守候選)
add(h, parse_tiles('55m5p'), [pon(31)])                        # 碰中 → 防大三元
add(h, parse_tiles('2m3p'), [pon(32), pon(33)])               # 碰發+白 → 聽大三元
add(h, parse_tiles('9m'), [chi(9, 10, 11), pon(13)])          # 筒子吃+碰 → 疑清一色
add(h, parse_tiles('5s'), [pon(27), pon(28)])                 # 東+南 → 防大四喜
add(h, parse_tiles('123m456p'), [])                           # 無副露對照組

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'testvectors_defense.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(vectors, f, ensure_ascii=False)
print('已寫出', len(vectors), '組防守向量 ->', os.path.abspath(out))

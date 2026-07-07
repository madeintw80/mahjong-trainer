# -*- coding: utf-8 -*-
"""
防守引擎 defense.py 的獨立驗證器。

和攻擊面 validate.py 的精神一樣，但防守是「規則式啟發」沒有窮舉 oracle，
所以標準答案 = 人工逐題算好的期望值(每筆都在註解寫出算式)，逐項比對。
再加幾條「不變式」與一組整合排序測試把關。
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import random
import defense
from defense import analyze_tile, rank_discards, build_danger_map, wait_shapes, parse_tiles, pon, chi, tile_name

fails = 0
checks = 0


def vis(*pairs):
    """建 visible 陣列：vis((4,1),(3,1)) = 5m 看見1張、4m 看見1張"""
    v = [0] * 34
    for t, c in pairs:
        v[t] = c
    return v


def expect(label, got, want):
    global fails, checks
    checks += 1
    if got != want:
        fails += 1
        print(f'[FAIL] {label}: got={got} want={want}')


# ------------------------------------------------------------------ 單點案例
# 牌編號：1m=0..9m=8 / 1p=9.. / 1s=18.. / 東=27 南28 西29 北30 中31 發32 白33

# 1) 現物：對手丟過 5m → 打 5m 絕對安全
a = analyze_tile(4, vis((4, 1)), {4}, {})
expect('現物-risk', a['risk'], 0)
expect('現物-headline', a['headline'], '現物')
expect('現物-genbutsu', a['genbutsu'], True)

# 2) 無筋 5m：什麼線索都沒有 → 兩面x2(64)+嵌張16+單8+雙12 + 生張(4-1=3) = 103
a = analyze_tile(4, vis((4, 1)), set(), {})
expect('無筋5m-risk', a['risk'], 103)
expect('無筋5m-headline', a['headline'], '無筋')

# 3) 中筋 5m：對手丟過 2m 與 8m → 兩面全死，剩 嵌16+單8+雙12+3 = 39
a = analyze_tile(4, vis((4, 1)), {1, 7}, {})
expect('中筋5m-risk', a['risk'], 39)
expect('中筋5m-headline', a['headline'], '中筋')

# 4) 半筋 5m：只丟過 2m → 下兩面死、上兩面活 → 32+16+8+12+3 = 71
a = analyze_tile(4, vis((4, 1)), {1}, {})
expect('半筋5m-risk', a['risk'], 71)
expect('半筋5m-headline', a['headline'], '半筋')

# 5) 筋 1m：對手丟過 4m → 唯一的兩面(23m)死；1m 無嵌張無邊張 → 單8+雙12+3 = 23
a = analyze_tile(0, vis((0, 1)), {3}, {})
expect('筋1m-risk', a['risk'], 23)
expect('筋1m-headline', a['headline'], '筋')

# 6) 壁(半壁) 6m：5m 四張全見 → 下兩面(45m)與嵌張(57m)都缺 5m 而死；上兩面(78m)活
#    32(上兩面)+單8+雙12 + 生張(4-1=3) = 55
a = analyze_tile(5, vis((5, 1), (4, 4)), set(), {})
expect('壁6m-risk', a['risk'], 55)
expect('壁6m-headline', a['headline'], '半壁')

# 7) 字牌 中 見3張：只剩單騎(雙碰要2張、剩1張湊不出) → 單8 + (4-3=1) = 9
a = analyze_tile(31, vis((31, 3)), set(), {})
expect('字牌見3-risk', a['risk'], 9)
expect('字牌見3-headline', a['headline'], '字牌')

# 8) 字牌 中 見1張：單8+雙12 + (4-1=3) = 23
a = analyze_tile(31, vis((31, 1)), set(), {})
expect('字牌見1-risk', a['risk'], 23)

# 9) 現物字牌：對手丟過中 → 0
a = analyze_tile(31, vis((31, 1)), {31}, {})
expect('現物字牌-risk', a['risk'], 0)

# 10) 手牌壁字牌：自己抓滿 4 張中(非現物) → 單騎雙碰都湊不出 → 0
a = analyze_tile(31, vis((31, 4)), set(), {})
expect('手牌壁字牌-risk', a['risk'], 0)
expect('手牌壁字牌-genbutsu', a['genbutsu'], False)

# 11) 大三元警示：對手碰中 → 發變危險。發 見1(23) + 大三元加分16 = 39，且有警語
dm = build_danger_map([pon(31)])
a = analyze_tile(32, vis((32, 1)), set(), dm)
expect('大三元-發-risk', a['risk'], 39)
expect('大三元-發-有警語', len(a['warnings']) >= 1, True)
expect('大三元-中不在map', 31 in dm, False)

# 12) 一色警示：對手吃 123m + 碰 555m(兩組數字副露同花色) → 萬子全體加警示 bump 8
dm = build_danger_map([chi(0, 1, 2), pon(4)])
expect('一色-9m有警示', dm.get(8, (None, 0))[1], defense.FLUSH_BUMP)
expect('一色-1p無警示', 9 in dm, False)

# ------------------------------------------------------------------ 不變式
rng = random.Random(20260708)

# A) 字牌永遠不會有順子相關牌型(兩面/嵌張/邊張)
for T in range(27, 34):
    types = set(s['type'] for s in wait_shapes(T))
    expect(f'字牌{tile_name(T)}無順子型', types <= {'tanki', 'shanpon'}, True)

# B) 危險排序：無筋 > 半筋 > 中筋 > 現物(同一張 5m)
r_none = analyze_tile(4, vis((4, 1)), set(), {})['risk']
r_half = analyze_tile(4, vis((4, 1)), {1}, {})['risk']
r_naka = analyze_tile(4, vis((4, 1)), {1, 7}, {})['risk']
r_gen = analyze_tile(4, vis((4, 1)), {4}, {})['risk']
expect('排序 無筋>半筋', r_none > r_half, True)
expect('排序 半筋>中筋', r_half > r_naka, True)
expect('排序 中筋>現物', r_naka > r_gen, True)

# C) 端牌的筋比中張的中筋更安全(1m筋 vs 5m中筋)：筋19 只剩單雙碰、無嵌張
expect('筋端牌 < 中筋中張', r_gen < 999 and analyze_tile(0, vis((0, 1)), {3}, {})['risk'] < r_naka, True)

# D) 隨機情境：現物一定 risk 0，且排序後一定在最前面
for _ in range(300):
    hand = [0] * 34
    for _ in range(17):
        while True:
            t = rng.randrange(34)
            if hand[t] < 4:
                hand[t] += 1
                break
    river = [rng.randrange(34) for _ in range(rng.randint(4, 12))]
    ranked = rank_discards(hand, river)
    checks += 1
    # 排序單調(risk 非遞減)
    if any(ranked[i]['risk'] > ranked[i + 1]['risk'] for i in range(len(ranked) - 1)):
        fails += 1
        print('[FAIL] 排序非單調', [r['risk'] for r in ranked])
    # 現物必為 0
    gb = set(river)
    for r in ranked:
        if r['tile'] in gb and r['risk'] != 0:
            fails += 1
            print(f"[FAIL] 現物非0 {tile_name(r['tile'])}={r['risk']}")

# ------------------------------------------------------------------ 整合排序
# 手牌 1m 5m 中 9s；對手丟過 4m 9s
#   9s=現物(0) / 1m=筋(23) / 中=字牌見1(23) / 5m=無筋(103)
#   依 (risk, tile) 排序 → 9s(26,0) 1m(0,23) 中(31,23) 5m(4,103)
hand = [0] * 34
for t in (0, 4, 31, 26):
    hand[t] = 1
ranked = rank_discards(hand, parse_tiles('4m9s'))
expect('整合-順序', [r['tile'] for r in ranked], [26, 0, 31, 4])
expect('整合-風險', [r['risk'] for r in ranked], [0, 23, 23, 103])

# ------------------------------------------------------------------ 收尾
print(f'\n==== 防守引擎檢查 {checks} 項，失敗 {fails} 項 ====')
print('✅ 全部通過，防守引擎正確' if fails == 0 else '❌ 有錯，需修 defense.py')
sys.exit(1 if fails else 0)

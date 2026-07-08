# -*- coding: utf-8 -*-
"""
讀捨牌河引擎 readdiscard.py 的獨立驗證器。

和防守 validate_defense.py 同精神：讀牌是「規則式啟發」沒有窮舉 oracle，
標準答案 = 人工逐題算好(每筆在註解寫出推理)，逐項比對；再加一組「不變式」把關
(對稱性 / 順序單調 / 現物排除…)，最後跑隨機情境確保不炸。
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
import random
from readdiscard import (press_analyze, gua_analyze, nobe_analyze, gua_of,
                         parse_tiles, tile_name)

fails = 0
checks = 0


def expect(label, got, want):
    global fails, checks
    checks += 1
    if got != want:
        fails += 1
        print(f'[FAIL] {label}: got={got} want={want}')


def suit_res(results, suit):
    """從 press_analyze 結果取某門那筆"""
    return next(r for r in results if r['suit'] == suit)


# ===================================================================== 向下壓
# 規則：某門「低段代表(牌2/3)」和「高段代表(牌7/8)」都被丟過 → 整條安全(pressed)
# 牌編號：1m=0..9m=8。門內 n = 編號%9(0..8 = 1..9)

# 1) 萬子丟過 3萬(n2,低)+8萬(n7,高) → 整條安全
r = press_analyze(parse_tiles('38m'))
expect('壓-萬pressed', suit_res(r, 0)['pressed'], True)
expect('壓-萬discarded', suit_res(r, 0)['discarded'], [2, 7])
expect('壓-筒未丟', suit_res(r, 1)['pressed'], False)

# 2) 只丟低段 3萬 → 不觸發(高段沒表態)
r = press_analyze(parse_tiles('3m'))
expect('壓-只低段', suit_res(r, 0)['pressed'], False)
expect('壓-只低段-low_hit', suit_res(r, 0)['low_hit'], True)
expect('壓-只低段-high_hit', suit_res(r, 0)['high_hit'], False)

# 3) 只丟高段 8萬 → 不觸發
r = press_analyze(parse_tiles('8m'))
expect('壓-只高段', suit_res(r, 0)['pressed'], False)

# 4) 純端牌 1萬+9萬 → 不觸發(端牌本來就常丟，不算放棄搭子的訊號)
r = press_analyze(parse_tiles('19m'))
expect('壓-純端牌不觸發', suit_res(r, 0)['pressed'], False)

# 5) 只丟樞紐 5萬(n4) → 不歸低也不歸高 → 不觸發
r = press_analyze(parse_tiles('5m'))
expect('壓-樞紐5不觸發', suit_res(r, 0)['pressed'], False)

# 6) 2萬(n1,低)+7萬(n6,高) → 觸發
r = press_analyze(parse_tiles('27m'))
expect('壓-2+7觸發', suit_res(r, 0)['pressed'], True)

# 7) 三門獨立：萬觸發、筒只低、索只高
r = press_analyze(parse_tiles('38m3p8s'))
expect('壓-三門-萬', suit_res(r, 0)['pressed'], True)
expect('壓-三門-筒(只低)', suit_res(r, 1)['pressed'], False)
expect('壓-三門-索(只高)', suit_res(r, 2)['pressed'], False)

# --- P6-2 半門安全：丟低段→low_safe、丟高段→high_safe、兩半都丟→整條 pressed ---
# 8) 只丟低段 3萬 → 小掛半條(1-4)安全、大掛半條(6-9)仍要防
r = press_analyze(parse_tiles('3m'))
expect('半門-只低-low_safe', suit_res(r, 0)['low_safe'], True)
expect('半門-只低-high_safe', suit_res(r, 0)['high_safe'], False)
expect('半門-只低-pressed', suit_res(r, 0)['pressed'], False)

# 9) 只丟高段 8萬 → 大掛半條安全、小掛半條仍要防
r = press_analyze(parse_tiles('8m'))
expect('半門-只高-low_safe', suit_res(r, 0)['low_safe'], False)
expect('半門-只高-high_safe', suit_res(r, 0)['high_safe'], True)

# 10) 低+高都丟 38萬 → 兩半都安全 = 整條 pressed
r = press_analyze(parse_tiles('38m'))
expect('半門-整條-low_safe', suit_res(r, 0)['low_safe'], True)
expect('半門-整條-high_safe', suit_res(r, 0)['high_safe'], True)
expect('半門-整條-pressed', suit_res(r, 0)['pressed'], True)

# 11) 端牌/樞紐(19m/5m)不觸發任何半門安全
r = press_analyze(parse_tiles('159m'))
expect('半門-端牌樞紐-low_safe', suit_res(r, 0)['low_safe'], False)
expect('半門-端牌樞紐-high_safe', suit_res(r, 0)['high_safe'], False)


# ===================================================================== 六掛
# 掛歸屬：小掛=牌1-4(n0-3)、大掛=牌6-9(n5-8)、牌5(n4)樞紐不歸掛
expect('掛-1萬=萬小', gua_of(0), (0, 'small'))
expect('掛-4萬=萬小', gua_of(3), (0, 'small'))
expect('掛-5萬=樞紐None', gua_of(4), None)
expect('掛-6萬=萬大', gua_of(5), (0, 'big'))
expect('掛-9萬=萬大', gua_of(8), (0, 'big'))
expect('掛-字牌None', gua_of(31), None)

# 依序丟 8萬 3萬 9索 4筒 8筒 2索 → 各掛首現：
#   萬大(8萬)=0, 萬小(3萬)=1, 索大(9索)=2, 筒小(4筒)=3, 筒大(8筒)=4, 索小(2索)=5
g = gua_analyze(parse_tiles('83m9s4p8p2s'))
expect('掛-最危險=索小', (g[0]['suit'], g[0]['gua']), (2, 'small'))
expect('掛-最危險first', g[0]['first_turn'], 5)
expect('掛-次危險=筒大', (g[1]['suit'], g[1]['gua']), (1, 'big'))
expect('掛-次危險first', g[1]['first_turn'], 4)
expect('掛-最安全=萬大first0', (g[5]['suit'], g[5]['gua']), (0, 'big'))

# 順序敏感：先丟 3萬 vs 先丟 8萬 → 萬小/萬大的 first_turn 對調
ga = gua_analyze(parse_tiles('3m8m'))   # 3萬(小)在前
gb = gua_analyze(parse_tiles('8m3m'))   # 8萬(大)在前
def ft(res, suit, gua):
    return next(x['first_turn'] for x in res if x['suit'] == suit and x['gua'] == gua)
expect('掛-順序a-萬小first0', ft(ga, 0, 'small'), 0)
expect('掛-順序a-萬大first1', ft(ga, 0, 'big'), 1)
expect('掛-順序b-萬大first0', ft(gb, 0, 'big'), 0)
expect('掛-順序b-萬小first1', ft(gb, 0, 'small'), 1)

# 同掛多張只記首次：2萬 4萬(都萬小) → 萬小 first=0
expect('掛-同掛記首次', ft(gua_analyze(parse_tiles('24m')), 0, 'small'), 0)

# 沒出現的掛 present=False
g = gua_analyze(parse_tiles('3m'))       # 只有萬小出現
present = [x for x in g if x['present']]
absent = [x for x in g if not x['present']]
expect('掛-只1掛present', len(present), 1)
expect('掛-present=萬小', (present[0]['suit'], present[0]['gua']), (0, 'small'))
expect('掛-其餘5掛absent', len(absent), 5)
# P6-3 方案A：萬小(唯一present=最晚) + 5個沒出現的掛，全部並列 danger
expect('掛-3m全部danger', all(x['danger'] for x in g), True)
# danger 內：有順序訊號的 present 掛排最前、沒出現的掛排後段
expect('掛-最晚present排最前', (g[0]['present'], g[0]['suit'], g[0]['gua']), (True, 0, 'small'))
expect('掛-沒出現的排後段', g[-1]['present'], False)

# --- P6-3 方案A 核心：最晚出現的掛 + 完全沒出現的掛 = 並列危險 ---
# 依序丟 8萬(萬大)0 3萬(萬小)1 9索(索大)2 4筒(筒小)3 8筒(筒大)4 → 索小整段沒出現
#   present 最晚 = 筒大(ft4)；absent = 索小 → danger 應為 {筒大, 索小} 共2掛並列
g = gua_analyze(parse_tiles('8m3m9s4p8p'))
danger = [x for x in g if x['danger']]
dset = {(x['suit'], x['gua']) for x in danger}
expect('方A-danger共2掛', len(danger), 2)
expect('方A-含最晚出現筒大', (1, 'big') in dset, True)
expect('方A-含沒出現索小', (2, 'small') in dset, True)
expect('方A-筒大(最晚)排最前', (g[0]['suit'], g[0]['gua']), (1, 'big'))
expect('方A-索小(沒出現)排第2', (g[1]['suit'], g[1]['gua'], g[1]['present']), (2, 'small', False))
# 較早出現的掛非 danger(安全)
expect('方A-萬大(最早)非danger', next(x['danger'] for x in g if x['suit'] == 0 and x['gua'] == 'big'), False)

# 2個掛都沒出現時 → 兩個 absent 都算 danger(和最晚present並列)
# 丟 8萬(萬大)0 3萬(萬小)1 9索(索大)2 4筒(筒小)3 → 筒大、索小都沒出現
g = gua_analyze(parse_tiles('8m3m9s4p'))
danger = [x for x in g if x['danger']]
dset = {(x['suit'], x['gua']) for x in danger}
expect('方A-2absent時danger共3', len(danger), 3)
expect('方A-2absent含筒大', (1, 'big') in dset, True)
expect('方A-2absent含索小', (2, 'small') in dset, True)
expect('方A-2absent含最晚筒小', (1, 'small') in dset, True)

# 六掛全出現(沒有absent) → danger 退化成唯一「最晚出現」(相容舊行為)
g = gua_analyze(parse_tiles('83m9s4p8p2s'))   # 六掛全present，索小(ft5)最晚
danger = [x for x in g if x['danger']]
expect('方A-全present時danger唯一', len(danger), 1)
expect('方A-全present時danger=索小', (danger[0]['suit'], danger[0]['gua']), (2, 'small'))


# ===================================================================== 衍牌
# 丟 2萬(n1) → 手算(near = 搭子含 [n-1,n+1]=牌1,2,3 至少一張)：
#   4萬 score6[ryanmen(牌2,3聽1,4)+kanchan(牌3,5夾4)]
#   1萬 score5[ryanmen(牌2,3聽1,4)+shanpon(牌1對)]
#   3萬 score5[kanchan(牌2,4夾3)+penchan(牌1,2聽3)+shanpon(牌3對)]
#   5萬 score4[ryanmen(牌3,4聽5)]
c = nobe_analyze(1)
expect('衍-捨2萬-最危險=4萬', c[0]['tile'], 3)
expect('衍-捨2萬-最危險score', c[0]['score'], 6)
expect('衍-捨2萬-第2=1萬', c[1]['tile'], 0)
expect('衍-捨2萬-筆數', len(c), 4)
expect('衍-捨2萬-score序', [x['score'] for x in c], [6, 5, 5, 4])
expect('衍-捨2萬-4萬shapes', c[0]['shapes'], ['ryanmen', 'kanchan'])

# 捨 3萬(n2) → 前兩名 3萬…不對，是 2萬>4萬(和橫飛前二一致)
c = nobe_analyze(2)
expect('衍-捨3萬-最危險=2萬', c[0]['tile'], 1)
expect('衍-捨3萬-第2=4萬', c[1]['tile'], 3)
expect('衍-捨3萬-前二score都7', [c[0]['score'], c[1]['score']], [7, 7])

# 對稱不變式：捨 n 與捨 (8-n) 在門內鏡像 → {位置:分數} 對稱
# 用中央牌 3萬(n2) vs 7萬(n6)：n2 的每個 {n:score} 應等於 n6 的 {8-n:score}
ca = {x['n']: x['score'] for x in nobe_analyze(2)}   # 捨3萬
cb = {x['n']: x['score'] for x in nobe_analyze(6)}   # 捨7萬
mirror = {8 - k: v for k, v in ca.items()}
expect('衍-對稱(3萬↔7萬)', mirror, cb)

# 另一組對稱：捨 4萬(n3) vs 6萬(n5)
ca = {x['n']: x['score'] for x in nobe_analyze(3)}
cb = {x['n']: x['score'] for x in nobe_analyze(5)}
expect('衍-對稱(4萬↔6萬)', {8 - k: v for k, v in ca.items()}, cb)

# 現物排除：捨 2萬 但 4萬已在捨牌河 → 4萬(現物)不列入，最危險換 1萬(score5)
c = nobe_analyze(1, river=parse_tiles('4m'))
expect('衍-現物排除-無4萬', all(x['tile'] != 3 for x in c), True)
expect('衍-現物排除-最危險=1萬', c[0]['tile'], 0)

# 跨門不干擾：river 的筒子現物不影響萬子衍牌
c1 = nobe_analyze(1)
c2 = nobe_analyze(1, river=parse_tiles('4p'))     # 4筒和萬子無關
expect('衍-跨門不干擾', [x['tile'] for x in c1], [x['tile'] for x in c2])

# 分數都 > 0(不列 0 分候選)
for N in range(9):
    for x in nobe_analyze(N):
        checks += 1
        if x['score'] <= 0:
            fails += 1
            print(f'[FAIL] 衍-{tile_name(N)}有0分候選 {x}')


# ===================================================================== 不變式(隨機)
rng = random.Random(20260708)
for _ in range(500):
    # 隨機捨牌河
    river = [rng.randrange(34) for _ in range(rng.randint(3, 14))]

    # A) 向下壓：pressed 一定 = low_safe and high_safe；半門 safe 對應 hit
    for r in press_analyze(river):
        checks += 1
        if r['pressed'] != (r['low_safe'] and r['high_safe']):
            fails += 1
            print('[FAIL] 壓-pressed定義不符', r)
        checks += 1
        if r['low_safe'] != r['low_hit'] or r['high_safe'] != r['high_hit']:
            fails += 1
            print('[FAIL] 壓-半門safe≠hit', r)

    # B) 六掛(方案A)：danger 定義 + 排序不變式
    g = gua_analyze(river)
    # b1) danger 定義：完全沒出現 or first_turn == 最晚present
    present_fts = [x['first_turn'] for x in g if x['present']]
    latest = max(present_fts) if present_fts else None
    for x in g:
        checks += 1
        want = (not x['present']) or (x['first_turn'] == latest)
        if x['danger'] != want:
            fails += 1
            print('[FAIL] 掛-danger定義不符', x)
    # b2) danger 掛一定全排在非danger前面
    checks += 1
    seen_nd = False
    ok = True
    for x in g:
        if not x['danger']:
            seen_nd = True
        elif seen_nd:
            ok = False
    if not ok:
        fails += 1
        print('[FAIL] 掛-danger未排在非danger前', [(x['gua'], x['danger']) for x in g])
    # b3) 非danger掛(都present)的 first_turn 單調不遞增(越前越晚出現=越危險)
    nd = [x for x in g if not x['danger']]
    checks += 1
    if any(nd[i]['first_turn'] < nd[i + 1]['first_turn'] for i in range(len(nd) - 1)):
        fails += 1
        print('[FAIL] 掛-非danger排序非單調', [x['first_turn'] for x in nd])
    # b4) danger組內：有出現的(最晚)present 掛排在沒出現的 absent 掛前面
    dg = [x for x in g if x['danger']]
    checks += 1
    seen_absent = False
    ok = True
    for x in dg:
        if not x['present']:
            seen_absent = True
        elif seen_absent:
            ok = False
    if not ok:
        fails += 1
        print('[FAIL] 掛-danger內present未排在absent前', [(x['gua'], x['present']) for x in dg])

    # C) 衍牌：結果一定照 score 由大到小(同分 tile 升序)
    for N in range(9):
        c = nobe_analyze(N, river=river)
        checks += 1
        if any((c[i]['score'], -c[i]['tile']) < (c[i + 1]['score'], -c[i + 1]['tile'])
               for i in range(len(c) - 1)):
            fails += 1
            print(f'[FAIL] 衍-{tile_name(N)}排序錯', [(x['tile'], x['score']) for x in c])
        # 現物一定不在候選裡
        gb = {x % 9 for t in river if t < 27 and t // 9 == N // 9 for x in [t]}
        for x in c:
            checks += 1
            if x['n'] in gb:
                fails += 1
                print(f'[FAIL] 衍-{tile_name(N)}含現物 {x}')


# ===================================================================== 收尾
print(f'\n==== 讀牌引擎檢查 {checks} 項，失敗 {fails} 項 ====')
print('✅ 全部通過，讀牌引擎正確' if fails == 0 else '❌ 有錯，需修 readdiscard.py')
sys.exit(1 if fails else 0)

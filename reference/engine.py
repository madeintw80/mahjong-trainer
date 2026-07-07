# -*- coding: utf-8 -*-
"""
台灣麻將 16 張「牌效率」引擎 — Python 參考版 (reference implementation)

這支只是「標準答案產生器」，用來驗證之後 PWA 要用的 JavaScript 版算得對不對。
核心概念：
- 一副胡牌 = 5 個面子(順子/刻子) + 1 個對子(將) = 17 張
- 手上 16 張時，「向聽數 shanten」= 還差幾步才能聽牌；0 = 已經聽牌
- 「進張 ukeire」= 摸到哪些牌能讓向聽數 -1（越多張=這手越好聽）

牌的編號 (0~33)：
  0-8   萬 1~9   (man)
  9-17  筒 1~9   (pin)
  18-26 索 1~9   (sou)
  27-33 字牌      東 南 西 北 中 發 白
"""

from functools import lru_cache

NEED_MELDS = 5  # 台麻要湊 5 個面子


def is_number_tile(i):
    """是不是數字牌(萬筒索)，只有數字牌能組順子；字牌不行"""
    return i < 27


# ---------------------------------------------------------------------------
# 核心遞迴：把剩下的牌拆成「面子 + 搭子」，回傳所有可能的 (面子數, 搭子數) 組合
# 搭子 = 只差一張就能變面子的兩張牌 (如 3筒4筒、5索5索)
# ---------------------------------------------------------------------------
@lru_cache(maxsize=None)
def _achievable(counts_t, i):
    """
    從第 i 種牌開始，回傳剩餘牌能達成的 (melds, taatsu) 集合(已去掉被支配的爛組合)。
    counts_t: 長度 34 的 tuple，每種牌還剩幾張
    """
    counts = list(counts_t)
    # 跳過數量 0 的牌，找到最小 index 還有牌的位置
    while i < 34 and counts[i] == 0:
        i += 1
    if i >= 34:
        return frozenset({(0, 0)})

    results = set()

    # 分支 1：這張牌當廢牌丟掉一張，不參與任何組合
    counts[i] -= 1
    for (m, t) in _achievable(tuple(counts), i):
        results.add((m, t))
    counts[i] += 1

    # 分支 2：刻子 (三張一樣)
    if counts[i] >= 3:
        counts[i] -= 3
        for (m, t) in _achievable(tuple(counts), i):
            results.add((m + 1, t))
        counts[i] += 3

    # 分支 3：對子當搭子 (兩張一樣，等第三張變刻子)
    if counts[i] >= 2:
        counts[i] -= 2
        for (m, t) in _achievable(tuple(counts), i):
            results.add((m, t + 1))
        counts[i] += 2

    # 只有數字牌才有順子相關的拆法
    if is_number_tile(i):
        pos = i % 9  # 在該花色中的位置 0~8 (代表 1~9)
        # 分支 4：順子 (i, i+1, i+2)
        if pos <= 6 and counts[i + 1] > 0 and counts[i + 2] > 0:
            counts[i] -= 1; counts[i + 1] -= 1; counts[i + 2] -= 1
            for (m, t) in _achievable(tuple(counts), i):
                results.add((m + 1, t))
            counts[i] += 1; counts[i + 1] += 1; counts[i + 2] += 1
        # 分支 5：兩面/邊張搭子 (i, i+1)
        if pos <= 7 and counts[i + 1] > 0:
            counts[i] -= 1; counts[i + 1] -= 1
            for (m, t) in _achievable(tuple(counts), i):
                results.add((m, t + 1))
            counts[i] += 1; counts[i + 1] += 1
        # 分支 6：嵌張搭子 (i, i+2)，中間差一張
        if pos <= 6 and counts[i + 2] > 0:
            counts[i] -= 1; counts[i + 2] -= 1
            for (m, t) in _achievable(tuple(counts), i):
                results.add((m, t + 1))
            counts[i] += 1; counts[i + 2] += 1

    # Pareto 精簡：丟掉「面子和搭子都不比別人多」的爛組合，加速上層
    pruned = set()
    for (m, t) in results:
        dominated = False
        for (m2, t2) in results:
            if (m2, t2) != (m, t) and m2 >= m and t2 >= t:
                dominated = True
                break
        if not dominated:
            pruned.add((m, t))
    return frozenset(pruned)


def _shanten_from_blocks(m, t, need, has_eye):
    """
    由 (面子數 m, 搭子數 t, 有沒有將 has_eye) 算向聽數。
    公式：need*2 - 2*(有效面子) - (有效搭子) - (有將加 1)
    面子+搭子最多用 need 組(多了沒用，因為只需要 need 個面子)
    """
    m_use = min(m, need)
    t_use = min(t, need - m_use)
    return need * 2 - 2 * m_use - t_use - (1 if has_eye else 0)


def shanten(counts, need=NEED_MELDS):
    """算一手牌的向聽數。counts = 長度 34 的 list。16 張時 0 = 聽牌。"""
    counts = list(counts)
    best = 99

    # 情況 A：先不指定將，讓遞迴自由拆
    for (m, t) in _achievable(tuple(counts), 0):
        best = min(best, _shanten_from_blocks(m, t, need, False))

    # 情況 B：每一種對子都試試看拿去當「將」，剩下的再去湊面子
    for p in range(34):
        if counts[p] >= 2:
            counts[p] -= 2
            for (m, t) in _achievable(tuple(counts), 0):
                best = min(best, _shanten_from_blocks(m, t, need, True))
            counts[p] += 2

    return best


def ukeire(counts16, need=NEED_MELDS):
    """
    一手 16 張，回傳 (進張張數, 進張牌列表)。
    進張 = 摸到後能讓向聽數 -1 的牌；張數 = 牌堆裡還剩幾張(用 4 - 手上張數估)
    """
    counts16 = list(counts16)
    s = shanten(counts16, need)
    tiles = []
    total = 0
    for t in range(34):
        if counts16[t] < 4:
            counts16[t] += 1
            if shanten(counts16, need) == s - 1:  # 摸這張向聽 -1
                tiles.append(t)
                total += 4 - (counts16[t] - 1)   # 還剩幾張(扣掉自己手上的)
            counts16[t] -= 1
    return total, tiles


def best_discards(counts17, need=NEED_MELDS):
    """
    輸入剛摸完的 17 張，回傳每張可丟的牌 → (丟哪張, 丟完向聽, 進張張數, 進張列表)，
    依 (向聽小、進張多) 排序，第一個就是最佳解。
    """
    counts17 = list(counts17)
    out = []
    for d in range(34):
        if counts17[d] > 0:
            counts17[d] -= 1
            s = shanten(counts17, need)
            total, tiles = ukeire(counts17, need)
            out.append((d, s, total, tiles))
            counts17[d] += 1
    out.sort(key=lambda x: (x[1], -x[2]))  # 向聽小優先，其次進張多
    return out


# ---------------------------------------------------------------------------
# 牌面字串 <-> 編號，方便測試 (採用常見的 riichi 記法)
#   123m=萬 456p=筒 789s=索 1234567z=東南西北中發白
# ---------------------------------------------------------------------------
_SUIT_BASE = {'m': 0, 'p': 9, 's': 18, 'z': 27}
_TILE_NAMES = (
    ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'] +
    ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'] +
    ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'] +
    ['東', '南', '西', '北', '中', '發', '白']
)


def parse_hand(s):
    """把 '123m456p789s11z' 這種字串轉成 counts(長度34)"""
    counts = [0] * 34
    nums = []
    for ch in s:
        if ch.isdigit():
            nums.append(int(ch))
        elif ch in _SUIT_BASE:
            base = _SUIT_BASE[ch]
            for n in nums:
                counts[base + (n - 1)] += 1
            nums = []
    return counts


def tile_name(i):
    return _TILE_NAMES[i]


if __name__ == '__main__':
    # 手動 sanity check：一手 16 張，看看該丟什麼
    demo = parse_hand('123456789m123p55s')  # 15 張示範(湊個數字玩)
    print('demo counts sum =', sum(demo))

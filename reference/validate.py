# -*- coding: utf-8 -*-
"""
驗證器：用「完全獨立、窮舉式」的方法算出標準答案，交叉比對 engine.py。
只要有一手牌對不上就會印出來 → 確認引擎 100% 算對才收工。
"""
import random
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # 讓 import engine 找得到同資料夾
sys.stdout.reconfigure(encoding='utf-8')  # Windows 主控台預設 cp950，強制 utf-8 才印得出中文/emoji
import engine
from engine import NEED_MELDS, is_number_tile


# ---------- Oracle：最原始的窮舉胡牌判定，跟 engine 用不同寫法 ----------
def _can_form_melds(counts, need):
    """剩下的牌能不能剛好拆成 need 個面子(不留任何牌)"""
    if need == 0:
        return all(c == 0 for c in counts)
    i = 0
    while counts[i] == 0:
        i += 1
    # 試刻子
    if counts[i] >= 3:
        counts[i] -= 3
        if _can_form_melds(counts, need - 1):
            counts[i] += 3
            return True
        counts[i] += 3
    # 試順子
    if is_number_tile(i) and (i % 9) <= 6 and counts[i + 1] > 0 and counts[i + 2] > 0:
        counts[i] -= 1; counts[i + 1] -= 1; counts[i + 2] -= 1
        if _can_form_melds(counts, need - 1):
            counts[i] += 1; counts[i + 1] += 1; counts[i + 2] += 1
            return True
        counts[i] += 1; counts[i + 1] += 1; counts[i + 2] += 1
    return False


def is_complete(counts, need=NEED_MELDS):
    """一副牌是不是胡牌 (5 面子 + 1 將)"""
    if sum(counts) != need * 3 + 2:
        return False
    for p in range(34):
        if counts[p] >= 2:
            counts[p] -= 2
            ok = _can_form_melds(list(counts), need)
            counts[p] += 2
            if ok:
                return True
    return False


def is_tenpai(counts16, need=NEED_MELDS):
    """
    16 張是不是聽牌 (結構式定義：再補 1 張就能胡，就算那張自己已抓滿 4 張也算)。
    這樣才和 engine 的「向聽數」用同一套定義。
    """
    counts16 = list(counts16)
    for t in range(34):
        counts16[t] += 1          # 不設 <4 上限：死聽(4張全抓)在結構上仍是聽牌
        ok = is_complete(counts16, need)
        counts16[t] -= 1
        if ok:
            return True
    return False


def winning_tiles(counts16, need=NEED_MELDS):
    """16 張聽牌時，實際『摸得到』能胡的牌 (要扣掉自己抓滿 4 張的死張)"""
    counts16 = list(counts16)
    res = []
    for t in range(34):
        if counts16[t] < 4:       # 這裡才要 <4：真的還有牌可摸
            counts16[t] += 1
            if is_complete(counts16, need):
                res.append(t)
            counts16[t] -= 1
    return res


# ---------- 隨機發牌 ----------
def random_hand(n, rng):
    """從 4×34 的牌堆隨機抽 n 張"""
    wall = [i for i in range(34) for _ in range(4)]
    rng.shuffle(wall)
    counts = [0] * 34
    for t in wall[:n]:
        counts[t] += 1
    return counts


def _complete_hand(rng):
    """隨機組一副完整 17 張胡牌 (5 面子 + 1 將)"""
    counts = [0] * 34
    used = [0] * 34

    def take(i, k):
        counts[i] += k
        used[i] += k

    for _ in range(NEED_MELDS):
        while True:
            if rng.random() < 0.5:  # 刻子
                i = rng.randrange(34)
                if used[i] + 3 <= 4:
                    take(i, 3); break
            else:                   # 順子(只在數字牌，且不跨花色)
                i = rng.randrange(27)
                if (i % 9) <= 6 and used[i] < 4 and used[i + 1] < 4 and used[i + 2] < 4:
                    take(i, 1); take(i + 1, 1); take(i + 2, 1); break
    while True:                     # 湊將
        i = rng.randrange(34)
        if used[i] + 2 <= 4:
            take(i, 2); break
    return counts


def near_tenpai_hand(rng):
    """完整 17 張 → 隨機換掉 1~3 張再補回 16 張，火力集中在聽牌/一向聽邊界"""
    counts = _complete_hand(rng)
    swaps = rng.randint(1, 3)
    tiles = [i for i in range(34) for _ in range(counts[i])]
    rng.shuffle(tiles)
    for i in tiles[:swaps]:
        counts[i] -= 1
    for _ in range(16 - sum(counts)):
        while True:
            i = rng.randrange(34)
            if counts[i] < 4:
                counts[i] += 1
                break
    return counts


# ---------- 測試 ----------
def run():
    rng = random.Random(20260708)  # 固定種子，可重現
    fails = 0
    checked = 0
    N = 8000

    # 測試 1：engine 向聽=0  <=>  oracle 結構式聽牌
    for k in range(N):
        counts = near_tenpai_hand(rng) if k % 2 == 0 else random_hand(16, rng)
        s = engine.shanten(counts)
        ora = is_tenpai(counts)
        checked += 1
        if (s == 0) != ora:
            fails += 1
            if fails <= 5:
                print(f'[FAIL 聽牌邊界] shanten={s} oracle={ora} hand={counts}')

    # 測試 2：聽牌手的「進張(可摸的胡牌張)」engine == oracle
    for k in range(N):
        counts = near_tenpai_hand(rng)
        if is_tenpai(counts):
            _, eng_tiles = engine.ukeire(counts)
            ora_tiles = winning_tiles(counts)
            checked += 1
            if sorted(eng_tiles) != sorted(ora_tiles):
                fails += 1
                if fails <= 10:
                    print(f'[FAIL 進張] eng={eng_tiles} oracle={ora_tiles} hand={counts}')

    # 測試 3：17 張的向聽 == 所有丟法裡最小的 16 張向聽 (ukeire 計算的隱含前提)
    for k in range(2000):
        c17 = random_hand(17, rng)
        s17 = engine.shanten(c17)
        best16 = 99
        for d in range(34):
            if c17[d] > 0:
                c17[d] -= 1
                best16 = min(best16, engine.shanten(c17))
                c17[d] += 1
        checked += 1
        if s17 != best16:
            fails += 1
            if fails <= 10:
                print(f'[FAIL 17張向聽] s17={s17} best16={best16} hand={c17}')

    # 測試 4：鐵則 — 完整 17 張胡牌拿掉任一張，剩 16 張一定是聽牌(向聽 0)
    for k in range(3000):
        counts = _complete_hand(rng)
        tiles = [i for i in range(34) for _ in range(counts[i])]
        d = rng.choice(tiles)
        counts[d] -= 1
        s = engine.shanten(counts)
        checked += 1
        if s != 0:
            fails += 1
            if fails <= 10:
                print(f'[FAIL 完整-1應聽牌] shanten={s} hand={counts}')

    print(f'\n==== 檢查 {checked} 手，失敗 {fails} 手 ====')
    print('✅ 全部通過，引擎正確' if fails == 0 else '❌ 有錯，需修引擎')
    return fails


if __name__ == '__main__':
    sys.exit(1 if run() > 0 else 0)

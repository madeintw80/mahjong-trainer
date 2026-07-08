# -*- coding: utf-8 -*-
"""
台灣麻將 16 張「讀捨牌河 / 進階防守」規則引擎 — Python 參考版 (reference implementation)

和靜態安全牌 defense.py 是兩種不同的防守：
  defense.py     假設對手「已經聽牌」，算「我打哪張最不會放槍」(看現物/筋/壁/字牌)
  readdiscard.py 從對手「捨牌河的內容與順序」反推「他不太可能聽哪 / 真牌藏在哪」

★★ 這是機率性「讀牌」(啟發式)，不是保證安全 ★★
   defense 的現物/筋是數學上「保證」的安全牌；讀牌是從捨牌河「推測」對手手牌，沒有 100% 保證。
   所以這支引擎的做法 = 把橫飛(張晉慊)的讀牌口訣寫成「確定性規則」，
   讓 Python 版與 JS 版(readdiscard.js)逐位對拍一致；安全/危險是教學相對判斷，不是真實放槍率。

三個子引擎(各自獨立，對應三種橫飛讀牌技巧)：
  1. press_analyze 向下壓：丟低段(2/3)→小掛半條安全、丟高段(7/8)→大掛半條安全、兩半都丟→整條安全
  2. gua_analyze  六掛斷聽：每門分小掛(牌1-4)、大掛(牌6-9)共六掛；最晚才被丟的掛 + 完全沒丟過的掛 = 真牌 = 最危險
  3. nobe_analyze 衍牌險張：對手拆搭丟出一張 N → 用「含 N 的搭子拆解」算 N 鄰近哪張最危險

牌編號 0~33：0-8 萬 / 9-17 筒 / 18-26 索 / 27-33 字牌(讀捨牌河只看數字牌，字牌一律略過)
"""

SUIT = ['萬', '筒', '索']


# ---------------------------------------------------------------------------
# 共用小工具
# ---------------------------------------------------------------------------
def tile_name(t):
    """牌編號 → 中文名(只處理數字牌，例 0 -> '1萬')"""
    return str(t % 9 + 1) + SUIT[t // 9]


def suit_of(t):
    """牌編號 → 花色(0萬/1筒/2索)"""
    return t // 9


def num_of(t):
    """牌編號 → 門內位置 0~8(代表 1~9)"""
    return t % 9


def is_number(t):
    """是不是數字牌(讀捨牌河只看數字牌)"""
    return t < 27


# ===========================================================================
#  ① 向下壓 press_analyze — 哪一門整條安全
# ===========================================================================
# 「低段代表」= 牌2,3 (n=1,2)；「高段代表」= 牌7,8 (n=6,7)
#
# 為什麼取這幾張、不取別的(這是規則的靈魂，一定要懂)：
#   - 牌1、牌9 是端牌，本來就是最沒用、最早被丟的牌 → 丟了「不能」代表他這段沒搭(可能在做 12/89 邊張)
#   - 牌4、5、6 太靠中央、連接力最強 → 玩家通常留到最後，丟了反而很可疑(不能當「放棄」的訊號)
#   - 只有 2、3(低段的連接核心) 和 7、8(高段的連接核心) 被當廢牌丟出來，
#     才真的代表「這一段我沒有搭子在做、放棄了」
#   → 低段和高段「都放棄」= 整門放棄 = 整條相對安全(向下壓)
PRESS_LOW = {1, 2}    # n 值 → 牌 2、3
PRESS_HIGH = {6, 7}   # n 值 → 牌 7、8


def press_analyze(river):
    """
    向下壓：逐門判斷「哪半條 / 整條」相對安全。
    river = 對手捨牌河(牌編號 list)。★向下壓只看「有沒有丟過」，跟順序無關。

    ★ P6-2 半門安全(這版新增)：向下壓不必「整條」才安全，常常只放棄「半條」——
        丟過低段核心(2/3) → 低段沒搭子在做 → 「小掛半條(牌1-4)」相對安全(low_safe)；
        丟過高段核心(7/8) → 高段沒搭子在做 → 「大掛半條(牌6-9)」相對安全(high_safe)；
        兩半都放棄 → 整條安全(pressed)。牌5(樞紐)只有整條壓才算跟著安全。

    回傳 3 個 dict(萬/筒/索各一)：
        suit       花色 0/1/2
        pressed    整條安全 = low_safe and high_safe(相容舊欄位)
        low_hit    低段(2/3)有沒有被丟過(原始訊號)
        high_hit   高段(7/8)有沒有被丟過(原始訊號)
        low_safe   小掛半條(牌1-4)相對安全 = low_hit(丟了低段核心→低段沒搭)
        high_safe  大掛半條(牌6-9)相對安全 = high_hit(丟了高段核心→高段沒搭)
        discarded  這門捨過哪些 n 值(排序，給解釋/顯示用)
    """
    out = []
    for suit in range(3):
        ns = sorted({num_of(t) for t in river if is_number(t) and suit_of(t) == suit})
        low_hit = any(n in PRESS_LOW for n in ns)
        high_hit = any(n in PRESS_HIGH for n in ns)
        # 半門安全：丟了哪半的核心，哪半就相對安全(此版 safe 等價於 hit，但語意分層：
        #   hit=「捨牌河出現的原始訊號」、safe=「讀出來的安全結論」，方便日後獨立演化門檻)
        low_safe = low_hit
        high_safe = high_hit
        pressed = low_safe and high_safe         # 兩半都安全 = 整條安全
        out.append({'suit': suit, 'pressed': pressed,
                    'low_hit': low_hit, 'high_hit': high_hit,
                    'low_safe': low_safe, 'high_safe': high_safe, 'discarded': ns})
    return out


# ===========================================================================
#  ② 六掛斷聽 gua_analyze — 哪一掛最危險(看捨牌順序)
# ===========================================================================
# 掛的定義：每門分「小掛=牌1-4(n 0-3)」「大掛=牌6-9(n 5-8)」，三門共六掛。
#   牌5(n=4)是兩掛的樞紐、連接力最強 → 不歸任何一掛(讀牌時它太模糊，直接跳過)。
def gua_of(t):
    """牌編號 → (花色, 'small'/'big')；字牌或樞紐牌5 回 None"""
    if not is_number(t):
        return None
    n = num_of(t)
    if n <= 3:
        return (suit_of(t), 'small')    # 牌 1-4
    if n >= 5:
        return (suit_of(t), 'big')      # 牌 6-9
    return None                          # n==4 → 牌5 樞紐，不歸掛


def gua_analyze(river):
    """
    六掛斷聽：掃「有順序」的捨牌河，算每一掛「首次出現的巡數(index)」，
    再標記每一掛是不是「並列最危險(danger)」。

    ★ P6-3 方案A：危險有兩種來源，並列都算危險(不硬分唯一正解)——
        (甲) 有出現的掛裡「最晚才第一次被丟」的 → 對手剛拆到那附近 = 真牌貼手；
        (乙) 「整段完全沒丟過」的掛 → 對手可能一路留著在做那條 = 真牌整條藏著。
      為什麼並列：兩種來源機制不同、但都危險；硬把「沒出現」當最安全會教錯牌感
      (真牌常常就藏在完全沒表態的那一掛)。

    為什麼看首次出現：玩家一定先丟離手牌最遠、最沒用的牌區 → 那些掛「早出現」= 安全；
      能撐到最後才被迫丟、或剛拆搭才吐出來的掛 = 貼著他真正在用的牌區 = 真牌 = 最危險。
    river = 對手捨牌河(牌編號 list，★順序有意義★)。
    回傳 6 個 dict，依「危險 → 安全」排序：
        suit / gua('small'|'big')
        first_turn  首次出現的 index(0 起算)；None = 這一掛整局都沒丟過
        present     這一掛有沒有出現過
        danger      是不是「並列最危險」(最晚出現的 present 掛，或完全沒出現的掛)
    """
    first = {}                                   # (suit,gua) -> 首次出現的 index
    for i, t in enumerate(river):
        g = gua_of(t)
        if g is not None and g not in first:     # 只記第一次
            first[g] = i

    out = []
    for suit in range(3):
        for gua in ('small', 'big'):
            ft = first.get((suit, gua))
            out.append({'suit': suit, 'gua': gua,
                        'first_turn': ft, 'present': ft is not None})

    # 「最晚出現」= 有出現的掛裡 first_turn 最大者(可能多掛並列同為最晚)；沒任何掛出現時為 None
    present_fts = [o['first_turn'] for o in out if o['present']]
    latest = max(present_fts) if present_fts else None
    for o in out:
        # danger：完全沒出現(乙) 或 最晚出現的 present 掛(甲) → 並列最危險
        o['danger'] = (not o['present']) or (o['first_turn'] == latest)

    def sort_key(o):
        # 升序排出「危險 → 安全」：
        #   danger 排最前(0)；danger 內讓「有順序訊號的最晚 present 掛」排在「沒出現的掛」前面
        #   (present_rank 0 vs 1)、present 內 first_turn 越大越危險(取負號往前)；
        #   非 danger(都是較早出現的 present)再依 first_turn 大→小；
        #   完全同分用 suit、gua 穩定排序(和 JS 版一致，才能逐位對拍)
        danger_rank = 0 if o['danger'] else 1
        present_rank = 0 if o['present'] else 1
        ft = o['first_turn'] if o['present'] else -1
        gua_rank = 0 if o['gua'] == 'small' else 1
        return (danger_rank, present_rank, -ft, o['suit'], gua_rank)

    out.sort(key=sort_key)
    return out


# ===========================================================================
#  ③ 衍牌險張 nobe_analyze — 對手拆搭丟出 N，N 鄰近哪張最危險
# ===========================================================================
# 各「聽牌搭子」的相對權重(和 defense.py 同源：兩面最能聽牌 → 最危險，對子最弱)
NOBE_W = {'ryanmen': 4, 'kanchan': 2, 'penchan': 2, 'shanpon': 1}


def nobe_analyze(N, river=None):
    """
    衍牌險張：對手「拆掉一個搭子、丟出一張 N」→ 他真正要的牌就落在 N 附近。
    原理(千金斷訣的核心)：拆搭是為了讓「另一處」成型才拆的，而搭子由相鄰牌組成，
      所以真牌很可能就在被丟的 N 的鄰域。
    做法：對 N 鄰近的每個候選牌 T，列舉「聽 T、而且用到 N 鄰牌」的搭子(兩面/嵌張/邊張/對子)，
      把權重加起來 → 分數越高 = 越多種留牌方式會聽到它 = 越危險。

    參數：
        N      對手剛拆搭丟出的那張牌(數字牌編號)
        river  對手捨牌河(可選)；有給就把「現物」從候選中剔除(丟過的牌詐胡不能胡)
    回傳候選 T 的 list，依危險(score)由高到低：
        tile / n(門內位置) / score / shapes(貢獻分數的搭子型別，去重排序)
    """
    suit = suit_of(N)
    n = num_of(N)
    genbutsu = {num_of(t) for t in (river or []) if is_number(t) and suit_of(t) == suit}

    # 「貼近被丟的 N」= 搭子至少一張牌落在 [n-1, n+1]。
    #   因為拆搭丟 N，真牌的搭子就緊挨著 N；離太遠的搭子跟這次拆搭無關，不計。
    def near(*ns):
        return any(abs(x - n) <= 1 for x in ns)

    cand = {}
    # 候選 T：同門、門內位置在 n-3..n+3、不是 N 自己、不是現物
    for dt in range(-3, 4):
        m = n + dt
        if m < 0 or m > 8 or m == n:
            continue
        if m in genbutsu:                        # 現物：詐胡不能胡，不可能是真牌
            continue
        T = suit * 9 + m
        shapes = []
        score = 0

        # 兩面(下端聽)：搭 (m-2, m-1) 聽 m —— 例 T=牌4 → 搭牌2,3 聽 牌1、牌4
        # 兩面(上端聽)：搭 (m+1, m+2) 聽 m —— 例 T=牌4 → 搭牌5,6 聽 牌4、牌7
        for a, b in ((m - 2, m - 1), (m + 1, m + 2)):
            if 0 <= a <= 8 and 0 <= b <= 8 and near(a, b):
                # 12 聽 3、89 聽 7 是「邊張」(只有一個聽口)，其餘是真兩面
                is_pen = (a == 0 and b == 1) or (a == 7 and b == 8)
                typ = 'penchan' if is_pen else 'ryanmen'
                score += NOBE_W[typ]
                shapes.append(typ)

        # 嵌張：搭 (m-1, m+1) 聽 m —— 例 T=牌4 → 搭牌3,5 夾聽 牌4
        a, b = m - 1, m + 1
        if 0 <= a <= 8 and 0 <= b <= 8 and near(a, b):
            score += NOBE_W['kanchan']
            shapes.append('kanchan')

        # 雙碰/對子：搭 (m, m) 再碰一張成刻 —— 對子本身就貼著 N 才算
        if near(m):
            score += NOBE_W['shanpon']
            shapes.append('shanpon')

        if score > 0:
            # shapes 去重 + 固定順序(權重高→低)，讓 Python/JS 對拍逐位一致
            order = {'ryanmen': 0, 'kanchan': 1, 'penchan': 2, 'shanpon': 3}
            uniq = sorted(set(shapes), key=lambda s: order[s])
            cand[T] = {'tile': T, 'n': m, 'score': score, 'shapes': uniq}

    out = list(cand.values())
    out.sort(key=lambda c: (-c['score'], c['tile']))    # 分數高→低；同分用牌編號穩定排序
    return out


# ---------------------------------------------------------------------------
# 小工具：字串 → 牌 list，方便測試 (沿用 riichi 記法 258m = 2萬5萬8萬)
# ---------------------------------------------------------------------------
_SUIT_BASE = {'m': 0, 'p': 9, 's': 18}


def parse_tiles(s):
    """字串 → 牌 list(含重複、保留順序，給捨牌河用)。例 '258m1p' -> [1,4,7,9]"""
    out = []
    nums = []
    for ch in s:
        if ch.isdigit():
            nums.append(int(ch))
        elif ch in _SUIT_BASE:
            base = _SUIT_BASE[ch]
            for x in nums:
                out.append(base + (x - 1))
            nums = []
    return out


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')

    print('── 向下壓 press ──')
    # 萬子丟過 3萬(低)+8萬(高) → 萬子整條安全；筒子只丟 5筒(樞紐)不觸發
    for r in press_analyze(parse_tiles('38m5p')):
        flag = '整條安全 ✅' if r['pressed'] else '仍要防'
        print(f"  {SUIT[r['suit']]}子: {flag}  (捨過 n={r['discarded']})")

    print('── 六掛 gua ──')
    # 依序丟 8萬 3萬 9索 4筒 8筒 2索 → 看每掛首次出現
    for g in gua_analyze(parse_tiles('83m9s4p8p2s'))[:3]:
        print(f"  {SUIT[g['suit']]}{'小' if g['gua']=='small' else '大'}掛  首現巡 {g['first_turn']}")

    print('── 衍牌 nobe (拆搭丟 2萬) ──')
    for c in nobe_analyze(1):     # N = 2萬(編號1)
        print(f"  {tile_name(c['tile'])}  分 {c['score']}  {c['shapes']}")

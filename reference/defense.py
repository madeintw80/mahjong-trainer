# -*- coding: utf-8 -*-
"""
台灣麻將 16 張「防守 / 讀安全牌」規則引擎 — Python 參考版 (reference implementation)

這支和牌效率引擎 engine.py 完全獨立、互不相干：
  - engine.py  算「進張最多」        → 攻擊面(何切る)
  - defense.py 算「打哪張最不會放槍」 → 防守面(讀安全牌)

核心 = 規則式安全度 (rule-based)：
  假設對手已經聽牌，把「他可能用哪些牌型等我放槍」全列出來，
  再看每一張候選牌，還有多少種牌型「活著」能胡到它 → 活得越多 = 越危險。

一張牌可能被哪些聽牌型胡到：
  兩面 ryanmen  例 34 聽 2-5      ← 最常見、最危險(權重最高)
  嵌張 kanchan  例 35 聽 4        ← 中間洞
  邊張 penchan  例 12 聽 3 / 89 聽 7
  單騎 tanki    例 單張 5 聽 5
  雙碰 shanpon  例 55 聽 5(再碰一張成刻)

四大安全規則怎麼從這個模型「自然長出來」(不用另外寫死)：
  現物：對手自己丟過這張   → 詐胡(振聽)不能胡 → 100% 安全，所有牌型死光
  筋  ：對手丟過 T±3       → 對應的「兩面」會振聽 → 那個兩面死掉(★只擋兩面！嵌張單騎照中)
  中筋：中張 4/5/6 兩邊的筋都有 → 兩面全死
  半筋：只有一邊有筋       → 另一邊兩面還活著
  壁  ：某數字 4 張全看得到 → 對手不可能拿它組兩面/嵌張 → 相關牌型死掉
  字牌：不能組順子         → 只剩單騎/雙碰，看還剩幾張(看得越多越安全)

★ 危險分是「教學用的相對分」，不是真實放槍機率；排序照真實牌感由安全到危險。

牌編號 0~33：0-8 萬 / 9-17 筒 / 18-26 索 / 27-33 東南西北中發白
"""

# ---- 各聽牌型的「相對危險權重」(整數，方便 JS 版逐位對驗) ----
W = {
    'ryanmen': 32,   # 兩面最危險
    'kanchan': 16,   # 嵌張
    'penchan': 16,   # 邊張(和嵌張同級，都是單一洞)
    'shanpon': 12,   # 雙碰(要對手正好有一對)
    'tanki': 8,      # 單騎(要對手單吊，最少見)
}

# ---- 場況/大牌警示的加分 ----
DRAGON_BUMP_1 = 16   # 對手碰 1 種三元牌 → 其他三元牌加分
DRAGON_BUMP_2 = 40   # 碰 2 種三元牌(等於聽第三張大三元) → 大加分
WIND_BUMP = 16       # 多張風牌副露 → 慎防大四喜
FLUSH_BUMP = 8       # 副露集中單一花色 → 混/清一色，該花色加分

SUIT = ['萬', '筒', '索']
HONOR = ['東', '南', '西', '北', '中', '發', '白']
DRAGONS = [31, 32, 33]   # 中 發 白
WINDS = [27, 28, 29, 30] # 東 南 西 北


def is_honor(t):
    return t >= 27


def tile_name(t):
    if t < 27:
        return str(t % 9 + 1) + SUIT[t // 9]
    return HONOR[t - 27]


# ---------------------------------------------------------------------------
# 一張目標牌 T 可能被哪些聽牌型胡到
#   每個型別記 need(對手手上必須有的牌) 與 others(此型的「另一個聽牌」，拿來判振聽=筋)
# ---------------------------------------------------------------------------
def wait_shapes(T):
    shapes = []
    if is_honor(T):
        # 字牌只能單騎或雙碰(無順子)
        shapes.append({'type': 'tanki',   'need': [T],    'others': []})
        shapes.append({'type': 'shanpon', 'need': [T, T], 'others': []})
        return shapes

    suit = T // 9
    n = T % 9                    # 0~8 代表 1~9
    def idx(k): return suit * 9 + k

    # 兩面(下)：形狀 (n-2,n-1) 聽 {n-3, n}；n-3 要 >=1 才是真兩面(否則是邊張)
    if n >= 3:                   # 牌 4~9
        shapes.append({'type': 'ryanmen', 'need': [idx(n - 2), idx(n - 1)], 'others': [idx(n - 3)]})
    # 兩面(上)：形狀 (n+1,n+2) 聽 {n, n+3}；n+3 要 <=9
    if n <= 5:                   # 牌 1~6
        shapes.append({'type': 'ryanmen', 'need': [idx(n + 1), idx(n + 2)], 'others': [idx(n + 3)]})
    # 嵌張：形狀 (n-1,n+1) 聽 {n}；牌 2~8 才有
    if 1 <= n <= 7:
        shapes.append({'type': 'kanchan', 'need': [idx(n - 1), idx(n + 1)], 'others': []})
    # 邊張：只有 3(=12聽3) 與 7(=89聽7)
    if n == 2:
        shapes.append({'type': 'penchan', 'need': [idx(0), idx(1)], 'others': []})
    if n == 6:
        shapes.append({'type': 'penchan', 'need': [idx(7), idx(8)], 'others': []})
    # 單騎 / 雙碰(數字牌也可以)
    shapes.append({'type': 'tanki',   'need': [T],    'others': []})
    shapes.append({'type': 'shanpon', 'need': [T, T], 'others': []})
    return shapes


def _count_needed(need):
    """把 need 列表整理成 {牌: 需要幾張}"""
    c = {}
    for t in need:
        c[t] = c.get(t, 0) + 1
    return c


def eval_shape(shape, visible, genbutsu):
    """
    判斷一個聽牌型是不是「活的」(對手真的可能用它胡到 T)。
    回傳 (alive, why)。why 是死因：'suji'(筋/振聽) / 'wall'(壁) / 'few'(牌不夠) / ''(活著)
    """
    # 振聽：這個型的「另一個聽牌」若對手丟過 → 整組振聽，不能胡 → 死(這就是「筋」)
    for o in shape['others']:
        if o in genbutsu:
            return (False, 'suji')
    # 對手手上湊得出 need 嗎？看外面還剩幾張(4 - 已看見的)
    for tile, k in _count_needed(shape['need']).items():
        unseen = 4 - visible[tile]
        if unseen < k:
            # 順子相關的型缺鄰牌 = 壁；單騎/雙碰缺自己 = 牌不夠
            why = 'few' if shape['type'] in ('tanki', 'shanpon') else 'wall'
            return (False, why)
    return (True, '')


def _headline(T, shape_results):
    """給這張牌一個好懂的分類標籤(標題)。"""
    if is_honor(T):
        return '字牌'
    ryanmen = [r for r in shape_results if r['type'] == 'ryanmen']
    R = len(ryanmen)
    dead = [r for r in ryanmen if not r['alive']]
    alive = [r for r in ryanmen if r['alive']]
    if not alive:                      # 兩面全死
        whys = set(r['why'] for r in dead)
        if R == 2:
            if whys == {'suji'}:
                return '中筋'
            if whys == {'wall'}:
                return '壁'
            return '筋壁'              # 一邊筋、一邊壁，兩面都封死
        else:                          # 端牌只有一個兩面
            return '筋' if 'suji' in whys else '壁'
    if dead:                           # 只死一半
        return '半筋' if dead[0]['why'] == 'suji' else '半壁'
    return '無筋'                      # 兩面都活著 = 最危險


def analyze_tile(T, visible, genbutsu, danger_map):
    """
    分析「打出 T」的放槍風險。
    回傳 dict：tile / risk / genbutsu / headline / seen(看見幾張) / shapes / warnings
    """
    # 現物 → 對手詐胡不能胡 → 絕對安全，直接收工
    if T in genbutsu:
        return {'tile': T, 'risk': 0, 'genbutsu': True, 'headline': '現物',
                'seen': visible[T], 'shapes': [], 'warnings': []}

    shape_results = []
    risk = 0
    for sh in wait_shapes(T):
        alive, why = eval_shape(sh, visible, genbutsu)
        if alive:
            risk += W[sh['type']]
        shape_results.append({'type': sh['type'], 'alive': alive, 'why': why})

    # 生張加權：這張外面剩越多，被單騎/雙碰的機會越大(同分時當 tiebreak)
    risk += (4 - visible[T])

    headline = _headline(T, shape_results)

    # 場況/大牌警示(副露推出來的)
    warnings = []
    if T in danger_map:
        text, bump = danger_map[T]
        warnings.append(text)
        risk += bump

    return {'tile': T, 'risk': risk, 'genbutsu': False, 'headline': headline,
            'seen': visible[T], 'shapes': shape_results, 'warnings': warnings}


# ---------------------------------------------------------------------------
# 情境組裝：把 對手牌河 + 副露 + 我方手牌 整合成 analyze 需要的資訊
# ---------------------------------------------------------------------------
def _expand(counts):
    """counts34 → [牌, 牌, ...] 展開(含重複)"""
    out = []
    for t in range(34):
        out += [t] * counts[t]
    return out


def build_visible(hand, river, melds):
    """
    看得見的牌 = 我方手牌 + 對手牌河 + 對手副露(亮出來的)。
    genbutsu(現物) = 對手牌河(他丟過的)。
    """
    visible = list(hand)               # 先算我方手上的
    genbutsu = set()
    for t in river:
        visible[t] += 1
        genbutsu.add(t)
    if melds:
        for md in melds:
            for t in md['tiles']:
                visible[t] += 1
    return visible, genbutsu


def build_danger_map(melds):
    """從對手副露推大牌警示：大三元 / 大四喜 / 混清一色。回傳 {牌: (警語, 加分)}"""
    dm = {}
    if not melds:
        return dm
    melded = []
    for md in melds:
        melded += md['tiles']
    melded_set = set(melded)

    # 大三元：碰了任一三元牌 → 其他三元牌變危險
    md_drag = [d for d in DRAGONS if d in melded_set]
    if md_drag:
        bump = DRAGON_BUMP_2 if len(md_drag) >= 2 else DRAGON_BUMP_1
        note = '⚠️對手已碰 ' + '/'.join(tile_name(d) for d in md_drag) + '，慎防大三元'
        for d in DRAGONS:
            if d not in melded_set:
                dm[d] = (note, bump)

    # 大四喜：亮了 2 種以上風牌 → 其他風牌小心
    md_wind = [w for w in WINDS if w in melded_set]
    if len(md_wind) >= 2:
        note = '⚠️對手多門風牌副露，慎防大四喜'
        for w in WINDS:
            if w not in melded_set:
                dm[w] = (note, WIND_BUMP)

    # 混/清一色：數字副露集中單一花色
    num_melds = [md for md in melds if any(t < 27 for t in md['tiles'])]
    suits = set(t // 9 for md in num_melds for t in md['tiles'] if t < 27)
    if len(num_melds) >= 2 and len(suits) == 1:
        s = next(iter(suits))
        note = '⚠️對手副露集中在' + SUIT[s] + '，疑似混/清一色，該花色偏危險'
        for k in range(9):
            t = s * 9 + k
            if t not in dm:
                dm[t] = (note, FLUSH_BUMP)
    return dm


def rank_discards(hand, river, melds=None):
    """
    輸入我方 17 張手牌(counts34) + 對手牌河(list) + 對手副露(list)，
    回傳每一張可打的牌的風險分析，依「風險小→大」排序，第一個就是最安全。
    """
    visible, genbutsu = build_visible(hand, river, melds)
    danger_map = build_danger_map(melds)
    out = []
    for t in range(34):
        if hand[t] > 0:
            out.append(analyze_tile(t, visible, genbutsu, danger_map))
    # 風險小優先；同分再用牌編號穩定排序(和 JS 版一致)
    out.sort(key=lambda x: (x['risk'], x['tile']))
    return out


# ---------------------------------------------------------------------------
# 小工具：字串 → 手牌/牌河，方便測試 (沿用 riichi 記法 123m456p11z)
# ---------------------------------------------------------------------------
_SUIT_BASE = {'m': 0, 'p': 9, 's': 18, 'z': 27}


def parse_hand(s):
    counts = [0] * 34
    nums = []
    for ch in s:
        if ch.isdigit():
            nums.append(int(ch))
        elif ch in _SUIT_BASE:
            base = _SUIT_BASE[ch]
            for x in nums:
                counts[base + (x - 1)] += 1
            nums = []
    return counts


def parse_tiles(s):
    """字串 → 牌 list(含重複)，給牌河/副露用"""
    return _expand(parse_hand(s))


def pon(tile):
    """組一個碰(3 張一樣)給測試用"""
    return {'type': 'pon', 'tiles': [tile, tile, tile]}


def chi(a, b, c):
    """組一個吃(順子)給測試用"""
    return {'type': 'chi', 'tiles': [a, b, c]}


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    # 手動 sanity：對手丟過 2萬 5萬 8萬 + 一堆字，我手上這些牌哪張安全？
    hand = parse_hand('34556m45p678s12z')  # 隨便 17 張示範
    while sum(hand) < 17:
        for t in range(34):
            if hand[t] < 4:
                hand[t] += 1
                break
    river = parse_tiles('258m139p')
    for a in rank_discards(hand, river)[:6]:
        print(f"打 {tile_name(a['tile']):>3}  風險 {a['risk']:>3}  [{a['headline']}]")

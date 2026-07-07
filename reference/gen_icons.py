# -*- coding: utf-8 -*-
"""產生 PWA app 圖示 PNG (綠底 + 白牌 + 紅『萬』+ 白『效率』)。沒有 PIL 就印出提示。"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("NO_PIL")
    sys.exit(0)

# 找一個中文字型
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msjhbd.ttc", r"C:\Windows\Fonts\msjh.ttc",
    r"C:\Windows\Fonts\mingliu.ttc", r"C:\Windows\Fonts\msyhbd.ttc",
]
font_path = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
if not font_path:
    print("NO_FONT")
    sys.exit(0)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

def rounded(size, radius, fill):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=fill)
    return img

def draw_icon(size):
    s = size
    img = rounded(s, int(s * 0.20), (15, 81, 50, 255))       # 綠底
    d = ImageDraw.Draw(img)
    # 白牌
    tw, th = int(s * 0.43), int(s * 0.585)
    tx, ty = (s - tw) // 2, int(s * 0.17)
    d.rounded_rectangle([tx, ty, tx + tw, ty + th], radius=int(s * 0.05),
                        fill=(255, 253, 247, 255), outline=(217, 212, 200, 255), width=max(1, s // 128))
    # 紅『萬』
    try:
        f1 = ImageFont.truetype(font_path, int(s * 0.37))
        f2 = ImageFont.truetype(font_path, int(s * 0.14))
    except Exception as e:
        print("FONT_ERR", e); sys.exit(0)
    def center_text(cx, cy, text, font, fill):
        l, t, r, b = d.textbbox((0, 0), text, font=font)
        d.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), text, font=font, fill=fill)
    center_text(s / 2, ty + th * 0.44, "萬", f1, (192, 57, 43, 255))
    center_text(s / 2, int(s * 0.87), "效率", f2, (255, 255, 255, 255))
    return img

for sz, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "icon-180.png")]:
    draw_icon(sz).save(os.path.join(OUT, name))
    print("OK", name)
print("DONE", font_path)

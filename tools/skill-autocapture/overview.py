#!/usr/bin/env python3
"""自動撮影の結果を1枚の一覧画像（overview.png）にする。

  python overview.py <撮影フォルダ>

1技1行で「アイコン・名前・間合い・能力数｜図鑑トップ｜技詳細｜能力詳細…」を並べる。
撮り漏れ・取り違えを目で確かめるためのもので、読み取り（TSVへの転記）は元の画像で行う。
"""
import os, sys, csv
from PIL import Image, ImageDraw, ImageFont

FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
H = 300            # 1行の高さ
INFO_W = 260
GAP = 8
# 画面ごとに中身だけ切り出す範囲（ミラーリング画像 828x1836 のpx）
CROP = {
    'top': (40, 320, 790, 720),       # 技名・技登録条件・登録可能なモンスター
    'detail': (20, 640, 808, 1100),   # 技詳細の中身と能力ボタン
    'ab': (20, 600, 808, 1260),       # 能力詳細（解放条件があれば上に出る）
}


def thumb(path, kind):
    im = Image.open(path).convert('RGB').crop(CROP[kind])
    w = round(im.width * H / im.height)
    return im.resize((w, H), Image.LANCZOS)


def main(d):
    with open(os.path.join(d, 'manifest.tsv')) as f:
        head = f.readline().lstrip('# ').strip()
        rows = list(csv.DictReader(f, delimiter='\t'))
    lines = []
    for r in rows:
        ims = [thumb(os.path.join(d, r['top']), 'top'), thumb(os.path.join(d, r['detail']), 'detail')]
        ims += [thumb(os.path.join(d, a), 'ab') for a in r['ab_files'].split(',') if a]
        lines.append((r, ims))
    width = INFO_W + max(sum(i.width + GAP for i in ims) for _, ims in lines)
    title_h = 60
    out = Image.new('RGB', (width, title_h + len(lines) * (H + GAP)), (250, 247, 236))
    dr = ImageDraw.Draw(out)
    f_big, f_mid, f_small = (ImageFont.truetype(FONT, s) for s in (34, 26, 20))
    dr.text((12, 12), head.replace('\t', '   '), font=f_mid, fill=(60, 40, 20))
    y = title_h
    for r, ims in lines:
        icon = Image.open(os.path.join(d, r['icon'])).convert('RGB').resize((150, 150))
        out.paste(icon, (12, y + 10))
        dr.text((12, y + 170), f"{int(r['n']):02d}  {r['range']}", font=f_big, fill=(60, 40, 20))
        dr.text((12, y + 215), r['name'][:9], font=f_mid, fill=(60, 40, 20))
        dr.text((12, y + 255), f"能力 {r['abilities']}　{r['sec']}秒", font=f_small, fill=(120, 100, 80))
        x = INFO_W
        for im in ims:
            out.paste(im, (x, y))
            x += im.width + GAP
        dr.line((0, y + H + GAP // 2, width, y + H + GAP // 2), fill=(200, 190, 170), width=2)
        y += H + GAP
    p = os.path.join(d, 'overview.png')
    out.save(p)
    print(p, out.size)
    return p


if __name__ == '__main__':
    main(sys.argv[1])

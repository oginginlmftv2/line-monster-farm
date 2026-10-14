#!/usr/bin/env python3
"""血統技図鑑の共通技を、iPhoneミラーリング経由で自動撮影する（試作）。

使い方（ゲーム画面は「技図鑑」の血統一覧を開いておく）:
  ~/claude/lmf-aisho/analysis/.venv/bin/python tools/skill-autocapture/skillcap.py メタルナー

1技ごとに: マスをタップ（図鑑トップ＝技登録条件・登録可能モンスター）→ 長押し（技詳細）
→ 技効果の能力ボタンを左上→右下の順に全部押して撮る → 技詳細のアイコンを切り抜く。
出力は ~/Pictures/lmf-capture/skills/auto/<血統>-<日時>/ と manifest.tsv。

スマホの操作は lmf-aisho の LMFCtl（bin/ctl.sh）を使う。相性検証チームとスマホを共有しているので、
ops/phone.lock が「技登録」で取られているときだけ動く。座標はミラーリング画像のpx（828x1836）、
ctl.sh へ渡すときに半分（pt）にする。押してよい範囲は SAFE_Y の中だけ（下のメニュー・戻るボタンは押さない）。
"""
import os, sys, time, subprocess, datetime
import numpy as np

AISHO = os.path.expanduser('~/claude/lmf-aisho')
sys.path.insert(0, os.path.join(AISHO, 'bin'))
import safeimg  # noqa: F401  書き込み途中の画像を開かない
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
CTL = os.path.join(AISHO, 'bin/ctl.sh')
JOCR = os.path.join(HERE, 'jocr')
LOCK = os.path.join(AISHO, 'ops/phone.lock')
SAFE_Y = (300, 1440)          # px。これより上下は押さない（下はメニュー・戻るボタン）
COLS = [138, 313, 488, 662]    # 遠・中・近・零 の列の中心 px
RANGES = ['遠', '中', '近', '零']
GRID_Y = (775, 1428)           # マス目が見える範囲 px
CELL_H = (110, 140)

TMP = os.path.join(os.path.expanduser('~/Pictures/lmf-capture/skills/auto'), '_tmp')


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def ctl(*args):
    subprocess.run([CTL, *map(str, args)], check=True)


def tap(x, y):
    assert SAFE_Y[0] <= y <= SAFE_Y[1], f'押してはいけない位置 y={y}'
    ctl('tap', round(x / 2), round(y / 2))


def longpress(x, y):
    assert GRID_Y[0] <= y <= GRID_Y[1], f'マス目の外 y={y}'
    ctl('drag', round(x / 2), round(y / 2), round(y / 2), 50, 900, 0)


def scroll(dy_pt):
    """dy_pt>0 で下の行へ、<0 で上の行へ。ゆっくり動かして止めてから離す（慣性で流れないように）。
    掴む場所は遠と中の列のすき間（113pt）。右端はスクロールバーで、掴むと向きが逆になる（2026-10-13 実測）。
    始点・終点ともマス目の中（410〜700pt）に収める。窓の外へ出すと効かない"""
    dy = max(-290, min(290, dy_pt))
    y0 = 700 if dy > 0 else 410
    ctl('drag', 113, y0, y0 - dy, 700, 150, 600, 1)


_n = 0


def shot(path=None):
    global _n
    if path is None:
        _n += 1
        path = os.path.join(TMP, f'cur{_n % 4}.png')
    if os.path.exists(path):
        os.remove(path)
    ctl('shot', path)
    im = Image.open(path).convert('RGB')
    return path, im


_ocrp = None


def ocr(path):
    """常駐させた jocr に読ませる（1回ごとに起動すると2.6秒かかる）"""
    global _ocrp
    if _ocrp is None or _ocrp.poll() is not None:
        _ocrp = subprocess.Popen([JOCR], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
    _ocrp.stdin.write(path + '\n'); _ocrp.stdin.flush()
    lines = []
    while True:
        l = _ocrp.stdout.readline()
        if not l or l.strip() == 'END':
            break
        lines.append(l.rstrip('\n'))
    res = []
    for line in lines:
        p = line.split('\t')
        if len(p) == 3:
            res.append((p[0], int(p[1]), int(p[2])))
    return res


def screen(texts):
    s = ' '.join(t for t, _, _ in texts)
    if '能力詳細' in s:
        return 'ability'
    if '技詳細' in s:
        return 'detail'
    if '血統技図鑑' in s:
        return 'grid'
    if '技図鑑' in s:
        return 'index'
    return '?'


def look():
    p, im = shot()
    t = ocr(p)
    return p, im, t, screen(t)


def wait_screen(want, tries=8, delay=0.6):
    for _ in range(tries):
        time.sleep(delay)
        p, im, t, s = look()
        if s == want:
            return p, im, t
    raise RuntimeError(f'画面が {want} にならない（今は {s}）: {p}')


def top_close(texts):
    ys = [(y, x) for t, x, y in texts if t.strip() == 'とじる']
    if not ys:
        return None
    y, x = min(ys)
    return x, y


def clean_name(t):
    t = t.strip()
    while t and (t[0] in '▶◀•・>＞ ①②③④⑤⑥⑦⑧⑨⑩◎©●○◉®' or t[0].isdigit()):
        t = t[1:]
    return t.strip()


def pick_name(c):
    names = [clean_name(t) for x, t in sorted(c)]
    names = [n for n in names if n]
    return names[0] if names else ''


# ---------- 技図鑑（血統一覧） ----------

def open_blood(blood):
    p, im, t, s = look()
    if s == 'grid' and len(sys.argv) > 2:
        log(f'すでに血統技図鑑（技数は引数の {sys.argv[2]}）')
        return int(sys.argv[2])
    if s != 'index':
        raise RuntimeError(f'技図鑑の血統一覧から始めてください（今は {s}）')
    key = blood + '種'
    for attempt in range(12):
        hit = [(x, y) for tx, x, y in t if key in tx and SAFE_Y[0] < y < SAFE_Y[1] - 60]
        if hit:
            x, y = hit[0]
            total = None
            for tx, x2, y2 in t:
                if '/' in tx and abs(x2 - x) < 60 and 15 < y2 - y < 50:
                    try:
                        total = int(tx.split('/')[1])
                    except ValueError:
                        pass
            log(f'{key} を押す（技数 {total}）')
            tap(x, y)
            wait_screen('grid')
            return total
        # 前半は上へ戻し、後半は下へ送って探す
        scroll(-250 if attempt < 4 else 200)
        time.sleep(1.2)
        p, im, t, s = look()
    raise RuntimeError(f'{key} が見つからない')


# ---------- マス目 ----------

def cells(im):
    """完全に見えているマスの (列番号, 中心y, X マスか, 中身の画像) を返す"""
    a = np.asarray(im).astype(int)
    bg = np.array([230, 226, 192])  # マス目の背景色
    out = []
    for ci, x in enumerate(COLS):
        strip = a[GRID_Y[0]:GRID_Y[1], x - 40:x + 40]
        d = np.abs(strip - bg).sum(2).mean(1)
        on = d > 40
        runs, s = [], None
        for i, v in enumerate(on):
            if v and s is None:
                s = i
            if not v and s is not None:
                runs.append([s, i]); s = None
        if s is not None:
            runs.append([s, len(on)])
        merged = []
        for r in runs:  # 8px未満のすき間はつなぐ
            if merged and r[0] - merged[-1][1] < 8:
                merged[-1][1] = r[1]
            else:
                merged.append(r)
        for r0, r1 in merged:
            if r0 == 0 or r1 == len(on):
                continue  # 端で切れているマスは次のスクロールで
            # アイコンの上側が背景に近い淡い色だと上端が欠ける（アローヘッド種で実測）。下端から1マスぶん取り直す
            if 60 <= r1 - r0 < CELL_H[0] and r1 - 121 > 0:
                r0 = r1 - 121
            if not (CELL_H[0] <= r1 - r0 <= CELL_H[1]):
                continue
            y0, y1 = GRID_Y[0] + r0, GRID_Y[0] + r1
            cy = (y0 + y1) // 2
            inner = a[y0 + 18:y1 - 18, x - 45:x + 45]
            g = inner
            gray = (np.abs(g[..., 0] - g[..., 1]) < 14) & (np.abs(g[..., 1] - g[..., 2]) < 14) & (g.mean(2) < 140)
            out.append((ci, cy, gray.mean() > 0.6, inner.copy()))
    out.sort(key=lambda c: (c[1], c[0]))
    return out


def center(a, x, y, r=35):
    return a[y - r:y + r, x - r:x + r]


def seen_cell(a, ci, cy, seen):
    """撮影済みのマスか。選んだマスは黄色い枠で検出位置が数pxずれるので、中央だけを上下±8pxずらして比べる"""
    for sci, tmpl in seen:
        if sci != ci:
            continue
        for d in range(-8, 9, 2):
            c = center(a, COLS[ci], cy + d)
            if c.shape == tmpl.shape and np.abs(c - tmpl).mean() < 12:
                return True
    return False


def banner_icon(im):
    """上部の選択中の技のアイコン（選択枠や暗さの影響を受けない）"""
    return np.asarray(im.crop((82, 347, 138, 400))).astype(int)


def banner_name(texts):
    c = [(x, t) for t, x, y in texts if 345 < y < 410 and 190 < x < 640]
    return pick_name(c)


# ---------- 技詳細 ----------

def ability_slots(im, texts):
    ty = next((y for t, x, y in texts if t.strip() == '技効果'), None)
    if ty is None:
        return []
    a = np.asarray(im).astype(int)
    slots = []
    for k in range(3):
        y = ty + 52 + 75 * k
        for x in (238, 590):
            bg = a[y, 414]
            d = np.abs(a[y - 5:y + 5, x - 120:x + 120] - bg).sum(2).mean()
            if d > 40:
                slots.append((x, y))
    return slots


def detail_name(texts):
    ty = next((y for t, x, y in texts if t.strip() == '技詳細'), 603)
    c = [(x, t) for t, x, y in texts if ty + 55 < y < ty + 100 and x < 650]
    return pick_name(c)


def crop_icon(im, texts, path):
    ty = next((y for t, x, y in texts if t.strip() == '技詳細'), None)
    if ty is None:
        return False
    im.crop((49, ty + 107, 172, ty + 231)).save(path)
    return True


def select(ci, cy, prev_icon):
    """マスをタップして、上部が切り替わった画面を返す"""
    tap(COLS[ci], cy)
    for _ in range(5):
        time.sleep(0.5)
        p, im, t, s = look()
        ic = banner_icon(im)
        if s == 'grid' and banner_name(t) and (prev_icon is None or np.abs(ic - prev_icon).mean() > 6):
            break
    return im, t, ic


def capture_skill(n, ci, cy, out, im, t):
    tag = f'{n:02d}'
    name = banner_name(t)
    top = os.path.join(out, f'{tag}-top.png')
    im.save(top)
    longpress(COLS[ci], cy)
    p, im, t = wait_screen('detail')
    det = os.path.join(out, f'{tag}-detail.png')
    im.save(det)
    dname = detail_name(t)
    crop_icon(im, t, os.path.join(out, 'icons', f'{tag}.png'))
    # アイコンだけ撮るモード：能力詳細は開かない（技DB登録済みの血統にアイコンを足すとき）
    slots = [] if ICONS_ONLY else ability_slots(im, t)
    abfiles, abnames = [], []
    for k, (x, y) in enumerate(slots, 1):
        tap(x, y)
        p2, im2, t2 = wait_screen('ability')
        f = os.path.join(out, f'{tag}-ab{k}.png')
        im2.save(f)
        abfiles.append(os.path.basename(f))
        hd = next((y2 for tx, x2, y2 in t2 if '能力詳細' in tx), 0)
        nm = [tx for tx, x2, y2 in t2 if hd + 100 < y2 < hd + 420 and '解放条件' not in tx]
        abnames.append(nm[0] if nm else '?')
        c = top_close(t2)
        if not c:
            raise RuntimeError(f'能力詳細の「とじる」が見つからない: {f}')
        tap(*c)
        wait_screen('detail')
    c = top_close(t)
    tap(*(c or (413, 1314)))
    wait_screen('grid')
    return dict(n=n, grid_name=name, name=dname if len(dname) >= len(name) else name, range=RANGES[ci], top=os.path.basename(top),
                detail=os.path.basename(det), abilities=len(slots), ab_files=','.join(abfiles),
                ab_names=' / '.join(abnames), icon=f'icons/{tag}.png')


def ensure_jocr():
    """jocr（文字認識）はコミットしないので、無ければビルドする（別のworktree・別のセッションで使うとき）"""
    if not os.path.exists(JOCR):
        log('jocr をビルドします')
        subprocess.run(['swiftc', '-O', JOCR + '.swift', '-o', JOCR], check=True)


ICONS_ONLY = '--icons-only' in sys.argv
if ICONS_ONLY:
    sys.argv.remove('--icons-only')


def main():
    blood = sys.argv[1]
    ensure_jocr()
    lock = open(LOCK).read() if os.path.exists(LOCK) else ''
    if '技登録' not in lock:
        sys.exit('ops/phone.lock が技登録で取られていない。相性検証の撮影とぶつかるので止まる')
    os.makedirs(TMP, exist_ok=True)
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M')
    out = os.path.join(os.path.dirname(TMP), f'{blood}-{stamp}' + ('-icons' if ICONS_ONLY else ''))
    os.makedirs(os.path.join(out, 'icons'), exist_ok=True)
    t0 = time.time()
    total = open_blood(blood)
    # マス目を先頭へ戻す（動かなくなるまで）
    _, im = shot()
    for _ in range(6):
        scroll(-290)
        time.sleep(1.0)
        _, im2 = shot()
        if np.abs(np.asarray(im)[GRID_Y[0]:GRID_Y[1]].astype(int) - np.asarray(im2)[GRID_Y[0]:GRID_Y[1]].astype(int)).mean() < 3:
            break
        im = im2
    seen, icons, rows, prev_icon = [], [], [], None
    still = 0
    while True:
        p, im, t, s = look()
        if s != 'grid':
            raise RuntimeError(f'血統技図鑑ではない（{s}）: {p}')
        a = np.asarray(im).astype(int)
        new = 0
        for ci, cy, is_x, inner in cells(im):
            if is_x or seen_cell(a, ci, cy, seen):
                continue
            seen.append((ci, center(a, COLS[ci], cy)))
            t1 = time.time()
            im2, t2, ic = select(ci, cy, prev_icon)
            prev_icon = ic
            if any(c == ci and np.abs(ic - x).mean() < 8 for c, x in icons):
                log(f'撮影済みの技なので飛ばす（{RANGES[ci]} {banner_name(t2)}）')
                new += 1
                break
            icons.append((ci, ic))
            r = capture_skill(len(rows) + 1, ci, cy, out, im2, t2)
            r['sec'] = round(time.time() - t1, 1)
            rows.append(r)
            new += 1
            log(f"{r['n']:2d} {r['range']} {r['name']}  能力{r['abilities']}  {r['sec']}s")
            # 押した後はマスの見た目（選択枠）が変わるので、撮り直してから次へ
            break
        if new:
            still = 0
            continue
        if total and len(rows) >= total:
            break
        before = np.asarray(im)[GRID_Y[0]:GRID_Y[1]].astype(int)
        scroll(150)
        time.sleep(1.0)
        _, im2 = shot()
        after = np.asarray(im2)[GRID_Y[0]:GRID_Y[1]].astype(int)
        if np.abs(before - after).mean() < 3:
            still += 1
            if still >= 2:
                break
    cols = ['n', 'name', 'grid_name', 'range', 'top', 'detail', 'abilities', 'ab_files', 'ab_names', 'icon', 'sec']
    with open(os.path.join(out, 'manifest.tsv'), 'w') as f:
        f.write(f'# blood={blood}\ttotal={total}\tcaptured={len(rows)}\tsec={round(time.time() - t0)}' + ('\tmode=icons-only' if ICONS_ONLY else '') + '\n')
        f.write('\t'.join(cols) + '\n')
        for r in rows:
            f.write('\t'.join(str(r[c]) for c in cols) + '\n')
    log(f'完了 {len(rows)}/{total} 技  {round(time.time() - t0)}秒  → {out}')
    import overview
    log('一覧', overview.main(out))
    if total and len(rows) != total:
        log('⚠️ 図鑑の技数と撮れた数が合わない')
        sys.exit(2)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""モンスター詳細の「技」タブのスクショから、技アイコンを切り抜いて保管する（専用技向け）。

専用技は血統技図鑑に載らないので、技タブのマスから切り抜く。マスは82pxで、
- 右下に消費ガッツの数字が重なる（許容）
- 選んでいるマスは一回り大きく描かれ黄色い枠が付く → 枠の内側を切り抜いて82pxに縮める
- 覚えていない技は色フィルタで暗くなっている → フィルタを逆算して色を戻す（推測。元画像も残す）

色フィルタは「暗いマス」と「図鑑で撮った正しいアイコン（skill-icons/<技ID>.png）」の組から推定する。
見本（calib）が増えたら fit → rebuild で全部作り直せる。

  PY=~/claude/lmf-aisho/analysis/.venv/bin/python
  $PY skill_icon.py add <技タブ.png> sk-0183          # 枠の付いたマス（＝説明欄の技）を sk-0183 として取り込む
  $PY skill_icon.py add <技タブ.png> sk-0183 --cell 4,2   # 行,列（1始まり）で指定する
  $PY skill_icon.py calib <技タブ.png> メタルナー      # 暗い共通技のマスを見本に足す（図鑑のアイコンと自動で照合）
  $PY skill_icon.py fit                                # 見本から色フィルタを推定し直す
  $PY skill_icon.py rebuild                            # 取り込み済みの専用技アイコンを作り直す
  $PY skill_icon.py sheet [出力.png]                   # 目で確かめる一覧（元｜色を戻した版）

置き場所（リポジトリ）:
  skill-icons/<技ID>.png          サイトで使う版（暗い技は色を戻した推測版）
  src/data/_source/skill-icons/raw/<技ID>.png     切り抜いたままの元画像（枠は除いて82pxにそろえる。暗さはそのまま）
  src/data/_source/skill-icons/raw/index.json     元画像の出どころ・暗いか・枠があったか
  src/data/_source/skill-icons/calib/*.png        色フィルタ推定用の見本（暗い共通技のマス）と index.json
  src/data/_source/skill-icons/calib/filter.json  推定した色フィルタ
"""
import os, sys, json, datetime
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ICONS = os.path.join(REPO, 'skill-icons')
RAW = os.path.join(REPO, 'src/data/_source/skill-icons/raw')
CALIB = os.path.join(REPO, 'src/data/_source/skill-icons/calib')
FILTER = os.path.join(CALIB, 'filter.json')
SKILLS = os.path.join(REPO, 'src/data/monster-skills.json')
FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'

CELL = 82
GRID = (30, 920, 430, 1520)      # 技タブのマス目がある範囲（ミラーリング 828x1836 のpx）
PANEL_BG = np.array([183, 171, 139])
FRAME_INSET = 4                  # 黄色い枠の太さ
DIM_MAX = 170                    # 明るさ98%点がこれ未満なら「覚えていない（暗い）」
# 色フィルタの推定から外す範囲（右下のガッツ数字・外周）
FIT_MASK = np.ones((CELL, CELL), bool)
FIT_MASK[50:, 38:] = False
FIT_MASK[:6] = FIT_MASK[-6:] = False
FIT_MASK[:, :6] = FIT_MASK[:, -6:] = False


def load_json(p, default):
    return json.load(open(p)) if os.path.exists(p) else default


def save_json(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write('\n')


def skills():
    s = json.load(open(SKILLS))
    return s if isinstance(s, list) else (s.get('skills') or list(s.values()))


# ---------- マスの検出 ----------

def runs(flags, offset, lo, hi):
    out, s = [], None
    for i, v in enumerate(list(flags) + [False]):
        if v and s is None:
            s = i
        if not v and s is not None:
            if lo <= i - s <= hi:
                out.append((offset + s, offset + i))
            s = None
    return out


def find_cells(im):
    """技タブのマスを (行, 列, x0, y0) で返す。行・列は1始まり"""
    a = np.asarray(im.convert('RGB')).astype(int)
    x0, y0, x1, y1 = GRID
    # 列：マスが4つ並ぶ高さを上から探す
    col_runs = None
    for yy in range(y0 + 15, y1 - 15, 6):
        r = runs(np.abs(a[yy, x0:x1] - PANEL_BG).sum(1) > 40, x0, CELL - 8, CELL + 8)
        if len(r) == 4:
            col_runs = r
            break
    if not col_runs:
        raise SystemExit('技タブのマス目が見つからない（モンスター詳細の「技」タブの画像か確認）')
    found = []
    for ci, (cx0, cx1) in enumerate(col_runs, 1):
        cx = (cx0 + cx1) // 2
        for ry0, ry1 in runs(np.abs(a[y0:y1, cx] - PANEL_BG).sum(1) > 40, y0, CELL - 8, CELL + 8):
            found.append((ci, cx0, ry0))
    # 行は上からの位置で数える（明るいマスは縦の検出が短く切れることがあり、列ごとの順番は当てにならない）
    tops = sorted({y for _, _, y in found})
    top = tops[0]
    pitch = np.median([b - a for a, b in zip(tops, tops[1:]) if b - a > CELL]) if len(tops) > 1 else CELL + 11
    rows = {}
    for ci, x, y in found:
        rows.setdefault(int(round((y - top) / pitch)) + 1, []).append((ci, x, y))
    # 選んだマスは黄色い枠の分だけ検出位置がずれるので、行の位置は同じ行のマスの中央値にそろえる
    # 明るいマスは縦の検出が短く切れて漏れることがあるので、行の位置×列の位置で全マスを組み立てる
    row_y = {r: int(np.median([y for _, _, y in items])) for r, items in rows.items()}
    return sorted((r, ci, cx0, ry) for r, ry in row_y.items() for ci, (cx0, _) in enumerate(col_runs, 1))


def cell_info(im, x, y):
    a = np.asarray(im.convert('RGB')).astype(int)
    body = a[y + 6:y + 50, x + 6:x + CELL - 6]
    gray = ((np.abs(body[..., 0] - body[..., 1]) < 14) & (np.abs(body[..., 1] - body[..., 2]) < 14) & (body.mean(2) < 140)).mean()
    b = a[y - 6:y + CELL + 6, x - 6:x + CELL + 6]   # 枠はマスの外周より少し外まで出る
    edge = np.concatenate([b[:9].reshape(-1, 3), b[-9:].reshape(-1, 3), b[:, :9].reshape(-1, 3), b[:, -9:].reshape(-1, 3)])
    framed = ((edge[:, 0] > 200) & (edge[:, 1] > 190) & (edge[:, 2] < 140)).mean() > 0.15
    bright = np.percentile(body.mean(2), 98)
    return dict(empty=bool(gray > 0.9), framed=bool(framed), dim=bool(bright < DIM_MAX), bright=float(bright))


def crop(im, x, y):
    return im.convert('RGB').crop((x, y, x + CELL, y + CELL))


def framed_crop(im, x, y):
    """選んでいるマスは一回り大きく（約90px）描かれ、黄色い枠が付く。
    枠の内側をまるごと切り抜いて82pxに縮め、ほかのマスと同じ見た目にそろえる"""
    a = np.asarray(im.convert('RGB')).astype(int)
    sub = a[y - 12:y + CELL + 12, x - 12:x + CELL + 12]
    ys, xs = np.where((sub[..., 0] > 200) & (sub[..., 1] > 190) & (sub[..., 2] < 150))
    x0, x1, y0, y1 = x - 12 + xs.min(), x - 12 + xs.max(), y - 12 + ys.min(), y - 12 + ys.max()
    k = FRAME_INSET
    return im.convert('RGB').crop((x0 + k, y0 + k, x1 - k + 1, y1 - k + 1)).resize((CELL, CELL), Image.LANCZOS)


# ---------- 色フィルタ ----------

def blur(c):
    return np.asarray(c.filter(ImageFilter.GaussianBlur(3))).astype(float) / 255


def fit():
    idx = load_json(os.path.join(CALIB, 'index.json'), {})
    if not idx:
        raise SystemExit('見本が無い。先に calib で足す')
    S, D = [], []
    for f, sk in idx.items():
        ref = Image.open(os.path.join(ICONS, sk + '.png')).convert('RGB').resize((CELL, CELL), Image.LANCZOS)
        dim = Image.open(os.path.join(CALIB, f)).convert('RGB')
        S.append(blur(ref)[FIT_MASK]); D.append(blur(dim)[FIT_MASK])
    S, D = np.concatenate(S), np.concatenate(D)
    # 暗いマス→元の向きで直接当てはめる（元の色でのずれを最小にする。逆算より黄色に寄りにくい）
    A = np.hstack([D, np.ones((len(D), 1))])
    W = np.linalg.lstsq(A, S, rcond=None)[0]           # 元 = [暗いマスのRGB(0-1), 1] @ W
    err = np.abs(np.clip(A @ W, 0, 1) - S).mean() * 255
    save_json(FILTER, dict(W=W.round(6).tolist(), samples=len(idx), skills=sorted(set(idx.values())),
                           fit_error=round(float(err), 1), fitted_at=datetime.date.today().isoformat(),
                           note='元のRGB(0-1) = [暗いマスのRGB(0-1), 1] @ W'))
    print(f'色フィルタを推定しました：見本{len(idx)}件 / 誤差{err:.1f}（0-255）→ {os.path.relpath(FILTER, REPO)}')


def restore(c):
    if not os.path.exists(FILTER):
        raise SystemExit('色フィルタが無い。calib → fit を先に')
    W = np.array(json.load(open(FILTER))['W'])
    a = np.asarray(c).astype(float) / 255
    out = np.clip(a @ W[:3] + W[3], 0, 1)
    return Image.fromarray((out * 255).round().astype('uint8'))


# ---------- コマンド ----------

def make_icon(raw, meta):
    """raw は枠を除いて82pxにそろえたマス"""
    return restore(raw) if meta['dim'] else raw


def cmd_add(shot, skill_id, cell=None):
    known = {s['skillId']: s for s in skills()}
    if skill_id not in known:
        raise SystemExit(f'{skill_id} が技DBに無い。先に取り込む')
    im = Image.open(shot)
    cells = [c for c in find_cells(im) if not cell_info(im, c[2], c[3])['empty']]
    if cell:
        r, c = map(int, cell.split(','))
        hit = [x for x in cells if x[0] == r and x[1] == c]
    else:
        hit = [x for x in cells if cell_info(im, x[2], x[3])['framed']]
    if len(hit) != 1:
        raise SystemExit(f'取り込むマスを1つに決められない（候補{len(hit)}件）。--cell 行,列 で指定する')
    r, c, x, y = hit[0]
    meta = cell_info(im, x, y)
    raw = framed_crop(im, x, y) if meta['framed'] else crop(im, x, y)
    os.makedirs(RAW, exist_ok=True)
    raw.save(os.path.join(RAW, skill_id + '.png'))
    icon = make_icon(raw, meta)
    icon.save(os.path.join(ICONS, skill_id + '.png'))
    idx = load_json(os.path.join(RAW, 'index.json'), {})
    idx[skill_id] = dict(name=known[skill_id]['name'], blood=known[skill_id]['blood'], source=os.path.basename(shot),
                         cell=[r, c], dim=meta['dim'], framed=meta['framed'], added_at=datetime.date.today().isoformat())
    save_json(os.path.join(RAW, 'index.json'), idx)
    print(f"{skill_id} {known[skill_id]['name']}：{r}行{c}列 / {'暗い→色を戻した' if meta['dim'] else '明るい'}"
          f"{' / 枠を消した' if meta['framed'] else ''} → skill-icons/{skill_id}.png")


def ncc(a, b):
    a = a - a.mean(); b = b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))


def cmd_calib(shot, blood):
    im = Image.open(shot)
    cands = [s for s in skills() if s['blood'] == blood and not s.get('unique')
             and os.path.exists(os.path.join(ICONS, s['skillId'] + '.png'))
             and Image.open(os.path.join(ICONS, s['skillId'] + '.png')).size[0] > 100]  # 図鑑で撮ったものだけ
    if not cands:
        raise SystemExit(f'{blood}種の図鑑アイコンが skill-icons/ に無い')
    gray = lambda c: blur(c).mean(2)[FIT_MASK]
    refs = {s['skillId']: gray(Image.open(os.path.join(ICONS, s['skillId'] + '.png')).convert('RGB').resize((CELL, CELL), Image.LANCZOS)) for s in cands}
    names = {s['skillId']: s['name'] for s in cands}
    idx = load_json(os.path.join(CALIB, 'index.json'), {})
    os.makedirs(CALIB, exist_ok=True)
    added = 0
    for r, c, x, y in find_cells(im):
        info = cell_info(im, x, y)
        if info['empty'] or not info['dim'] or info['framed']:
            continue
        cc = crop(im, x, y)
        g = gray(cc)
        score = sorted(((ncc(g, v), k) for k, v in refs.items()), reverse=True)
        (s1, k1), (s2, _) = score[0], score[1] if len(score) > 1 else (0, None)
        if s1 < 0.8 or s1 - s2 < 0.05:
            print(f'  {r}行{c}列：照合できず（最良 {names[k1]} {s1:.2f}）→ 見本にしない')
            continue
        f = f'{k1}-{os.path.splitext(os.path.basename(shot))[0]}.png'
        cc.save(os.path.join(CALIB, f))
        idx[f] = k1
        added += 1
        print(f'  {r}行{c}列：{names[k1]}（{k1}、一致度{s1:.2f}）')
    save_json(os.path.join(CALIB, 'index.json'), idx)
    print(f'見本を{added}件足しました（合計{len(idx)}件）。fit で推定し直す')


def cmd_rebuild():
    idx = load_json(os.path.join(RAW, 'index.json'), {})
    for sk, meta in idx.items():
        raw = Image.open(os.path.join(RAW, sk + '.png')).convert('RGB')
        make_icon(raw, meta).save(os.path.join(ICONS, sk + '.png'))
        print(f"作り直し {sk} {meta['name']}")


def cmd_sheet(out=None):
    idx = load_json(os.path.join(RAW, 'index.json'), {})
    if not idx:
        raise SystemExit('取り込み済みの専用技アイコンが無い')
    out = out or os.path.join(RAW, 'review.png')
    S = 200
    sheet = Image.new('RGB', (S * 2 + 260, 50 + len(idx) * (S + 10)), 'white')
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT, 22)
    d.text((10, 12), '元（切り抜いたまま）', font=f, fill='black')
    d.text((S + 20, 12), 'サイトで使う版', font=f, fill='black')
    for i, (sk, m) in enumerate(idx.items()):
        y = 50 + i * (S + 10)
        sheet.paste(Image.open(os.path.join(RAW, sk + '.png')).convert('RGB').resize((S, S)), (10, y))
        sheet.paste(Image.open(os.path.join(ICONS, sk + '.png')).convert('RGB').resize((S, S)), (S + 20, y))
        d.text((2 * S + 40, y + 20), f"{sk}\n{m['blood']}・{m['name']}\n{'色を戻した（推測）' if m['dim'] else '明るいまま'}",
               font=f, fill='black')
    sheet.save(out)
    print(out)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    cmd = a[0]
    if cmd == 'add':
        cell = a[a.index('--cell') + 1] if '--cell' in a else None
        cmd_add(a[1], a[2], cell)
    elif cmd == 'calib':
        cmd_calib(a[1], a[2])
    elif cmd == 'fit':
        fit()
    elif cmd == 'rebuild':
        cmd_rebuild()
    elif cmd == 'sheet':
        cmd_sheet(a[1] if len(a) > 1 else None)
    else:
        sys.exit(__doc__)

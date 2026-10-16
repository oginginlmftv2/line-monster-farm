#!/usr/bin/env python3
"""専用技のスクショ（モンスター詳細の技タブ）を、読み取り用の小さな束にまとめる。

モデルに画面全体を見せないための前処理。重複を捨て、文字のある部分だけを切り抜き、
画面の種類・選択中のマス（＝間合い）・オーラ丸の拡大を manifest.json に添える。
設計は docs/unique-skill-cloud-design.md の3章。

  PY=~/claude/lmf-aisho/analysis/.venv/bin/python
  $PY unique_pack.py <モンスター名>                 # unique-skills/ の未処理画像を束ねる
  $PY unique_pack.py <モンスター名> --src <フォルダ>  # 別の場所の画像を束ねる（試行用）
  $PY unique_pack.py <モンスター名> --push          # 束を受け箱ブランチ inbox/unique-skills へ送り、元画像を done/ へ移す

出力：~/Pictures/lmf-capture/unique-packs/<日時>-<モンスターID>/
  manifest.json      モンスター・技ごとの画像の並び・間合い・暗いマスか
  name.png           画面上部のモンスター名（取り違えの確認用）
  sNN-panel-K.png    技欄（技名〜技能力）。スクロールした画面があれば K が増える
  sNN-aura.png       オーラ丸を4倍にしたもの（白／黒の見分け用）
  sNN-icon.png       選択中のマス（枠を消した82px。サイトのアイコン用）
  sNN-dlg-K.png      その技を選んだ後に開いた能力詳細／技能力詳細の枠
"""
import os, sys, json, glob, shutil, datetime, subprocess, tempfile
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import skill_icon as si  # noqa: E402  マス目の検出・枠消しを共用する

REPO = si.REPO
CAP = os.path.expanduser(os.environ.get('LMF_CAPTURE_HOME', '~/Pictures/lmf-capture'))
SRC = os.path.join(CAP, 'unique-skills')
OUT = os.path.join(CAP, 'unique-packs')
INBOX_BRANCH = 'inbox/unique-skills'
RANGE_BY_COL = {1: '遠', 2: '中', 3: '近', 4: '零'}

# 切り抜き範囲（ミラーリング 828x1836 のpx。2026-10-15 ミリム・リゾートで実測）
W, H = 828, 1836
NAME = (20, 380, 340, 455)
PANEL = (440, 895, 792, 1512)
AURA = (490, 905, 526, 941)
DLG_ABILITY = (50, 860, 780, 1070)      # 能力詳細（技能力の本文）
DLG_SKILLABILITY = (30, 690, 800, 1210)  # 技能力詳細（解放条件つき）
SAME = 3.0                               # 画素差の平均がこれ未満なら同じ画面とみなす
SAME_PIXELS = 0.0005                     # かつ、画素差が60を超える点の割合がこれ未満（文字だけ違う画面を同じとみなさない）


def kind(a):
    """tab（技タブ）／ability（能力詳細）／skillability（技能力詳細）"""
    if a[300:380, 100:700].mean() > 90:
        return 'tab'
    return 'skillability' if a[700:735, 300:500].mean() > 175 else 'ability'


def cut(im, box):
    return im.crop(box)


def same(a, b):
    if a.size != b.size:
        return False
    d = np.abs(np.asarray(a, float) - np.asarray(b, float))
    return d.mean() < SAME and (d.max(axis=2) > 60).mean() < SAME_PIXELS


def monster(name):
    ids = json.load(open(os.path.join(REPO, 'src/data/monster-ids.json')))
    rows = [m for v in (ids if isinstance(ids, list) else ids.values()) for m in (v if isinstance(v, list) else [v])]
    hit = [m for m in rows if isinstance(m, dict) and m.get('name') == name]
    if not hit:
        raise SystemExit(f'「{name}」は monster-ids.json に無い。名前を確かめる（近い名前：' +
                         '、'.join(m['name'] for m in rows if isinstance(m, dict) and name[:2] in m.get('name', ''))[:200] + '）')
    m = hit[0]
    return dict(id=m['id'], name=m['name'], blood=m['blood'], bloodSlug=m['bloodSlug'], aura=m['aura'])


def frame_score(a, x, y):
    """マスの外周で、選択枠の黄色が占める割合"""
    b = a[y - 6:y + si.CELL + 6, x - 6:x + si.CELL + 6]
    edge = np.concatenate([b[:9].reshape(-1, 3), b[-9:].reshape(-1, 3), b[:, :9].reshape(-1, 3), b[:, -9:].reshape(-1, 3)])
    return ((edge[:, 0] > 200) & (edge[:, 1] > 190) & (edge[:, 2] < 140)).mean()


def shifted_score(a, x, y):
    """選んだマスは枠の分だけ検出位置がずれることがある。窓を少しずらした中で、いちばん黄色い割合"""
    return max(frame_score(a, x + dx, y + dy) for dx in range(-12, 13, 3) for dy in range(-12, 13, 3))


def selected(im):
    """選択中のマス。絶対のしきい値だと、別の端末のスクショで枠が薄く写ると見失うので、
    いちばん黄色い枠のマスを、十分に黄色く（0.06超）、2番目の1.5倍以上のときに選ぶ。
    見つからなければ、窓をずらして（枠で検出位置がずれたマスを拾う）もう一度だけ探す"""
    a = np.asarray(im.convert('RGB')).astype(int)
    cells = si.find_cells(im)
    for score in (frame_score, shifted_score):
        scored = sorted(((score(a, x, y), r, c, x, y) for r, c, x, y in cells), reverse=True)
        if not scored or scored[0][0] < 0.06:
            continue
        if len(scored) > 1 and scored[0][0] < scored[1][0] * 1.5:
            continue
        _, r, c, x, y = scored[0]
        return r, c, x, y, si.cell_info(im, x, y)
    return None


def pack(name, src, files=None):
    mon = monster(name)
    files = files or sorted(glob.glob(os.path.join(src, '*.png')))
    if not files:
        raise SystemExit(f'画像が無い：{src}')
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    out = os.path.join(OUT, f"{stamp}-{mon['id']}")
    os.makedirs(out)

    skills, order, cur, dropped, name_saved, notes = {}, [], None, [], False, []
    for f in files:
        im = Image.open(f).convert('RGB')
        if im.size != (W, H):
            notes.append(f'{os.path.basename(f)}：大きさが {im.size}（想定 {W}x{H}）。切り抜き位置がずれるので外した')
            continue
        a = np.asarray(im).astype(int)
        k = kind(a)
        base = os.path.basename(f)
        if k == 'tab':
            if not name_saved:
                cut(im, NAME).save(os.path.join(out, 'name.png'))
                name_saved = True
            sel = selected(im)
            if not sel:
                notes.append(f'{base}：選択中のマス（黄色い枠）が見つからない。外した')
                continue
            r, c, x, y, info = sel
            key = (r, c)
            if key not in skills:
                n = len(order) + 1
                skills[key] = dict(no=n, cell=[r, c], range=RANGE_BY_COL[c], dim=info['dim'],
                                   panels=[], dialogs=[], sources=[])
                order.append(key)
                cut(im, AURA).resize(((AURA[2] - AURA[0]) * 4, (AURA[3] - AURA[1]) * 4), Image.LANCZOS) \
                    .save(os.path.join(out, f'{prefix(n)}-aura.png'))
                si.framed_crop(im, x, y).save(os.path.join(out, f'{prefix(n)}-icon.png'))
            cur = skills[key]
            panel = cut(im, PANEL)
            if any(same(panel, Image.open(os.path.join(out, p))) for p in cur['panels']):
                dropped.append(base)
                continue
            p = f"{prefix(cur['no'])}-panel-{len(cur['panels']) + 1}.png"
            panel.save(os.path.join(out, p))
            cur['panels'].append(p)
            cur['sources'].append(base)
        else:
            if cur is None:
                notes.append(f'{base}：技タブより先に詳細画面がある。どの技のものか分からないので外した')
                continue
            dlg = cut(im, DLG_ABILITY if k == 'ability' else DLG_SKILLABILITY)
            if any(same(dlg, Image.open(os.path.join(out, d['file']))) for d in cur['dialogs']):
                dropped.append(base)
                continue
            d = f"{prefix(cur['no'])}-dlg-{len(cur['dialogs']) + 1}.png"
            dlg.save(os.path.join(out, d))
            cur['dialogs'].append(dict(file=d, kind=k))
            cur['sources'].append(base)

    manifest = dict(monster=mon, packedAt=stamp, sourceDir=src,
                    skills=[skills[k] for k in order], dropped=dropped, notes=notes,
                    rangeRule='間合いは選択中のマスの列（左から遠・中・近・零）で決めた。モデルに読ませない')
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), ensure_ascii=False, indent=2)
    return out, manifest, files


def prefix(n):
    return f's{n:02d}'


def size_of(path):
    return sum(os.path.getsize(p) for p in glob.glob(os.path.join(path, '*')))


def push(out):
    """束を孤立ブランチ inbox/unique-skills の inbox/unique/<束名>/ へ commit・push する。作業中のブランチには触らない"""
    name = os.path.basename(out)
    tmp = tempfile.mkdtemp(prefix='unique-inbox-')
    git = lambda *a, **k: subprocess.run(['git', *a], check=True, **k)
    try:
        remote = subprocess.run(['git', '-C', REPO, 'ls-remote', '--heads', 'origin', INBOX_BRANCH],
                                capture_output=True, text=True, check=True).stdout.strip()
        if remote:
            git('-C', REPO, 'fetch', '-q', 'origin', f'{INBOX_BRANCH}:refs/remotes/origin/{INBOX_BRANCH}')
            git('-C', REPO, 'worktree', 'add', '-q', '--detach', tmp, f'origin/{INBOX_BRANCH}')
        else:
            git('-C', REPO, 'worktree', 'add', '-q', '--detach', tmp)
            git('-C', tmp, 'checkout', '-q', '--orphan', 'unique-inbox-tmp')
            git('-C', tmp, 'rm', '-rfq', '.')
            with open(os.path.join(tmp, 'README.md'), 'w') as fp:
                fp.write('# 専用技の受け箱\n\n`tools/skill-autocapture/unique_pack.py --push` が置く。'
                         'クラウドセッションが取り込んだら消す。main とは履歴を共有しない。\n'
                         '設計は main の `docs/unique-skill-cloud-design.md`。\n')
        dest = os.path.join(tmp, 'inbox', 'unique', name)
        shutil.copytree(out, dest)
        git('-C', tmp, 'add', '-A')
        git('-C', tmp, 'commit', '-qm', f'受け箱：{name}')
        git('-C', tmp, 'push', '-q', 'origin', f'HEAD:refs/heads/{INBOX_BRANCH}')
    finally:
        subprocess.run(['git', '-C', REPO, 'worktree', 'remove', '--force', tmp])
        subprocess.run(['git', '-C', REPO, 'branch', '-D', 'unique-inbox-tmp'], capture_output=True)


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('-'):
        print(__doc__)
        sys.exit(1)
    name = args[0]
    src = args[args.index('--src') + 1] if '--src' in args else SRC
    out, m, files = pack(name, src)

    print(f"束：{out}")
    print(f"モンスター：{m['monster']['name']}（{m['monster']['id']}・{m['monster']['blood']}）")
    print(f"元画像 {len(files)}枚 → 重複で外した {len(m['dropped'])}枚 / 束の大きさ {size_of(out) // 1024}KB "
          f"（元 {sum(os.path.getsize(f) for f in files) // 1024}KB）")
    for s in m['skills']:
        print(f"  {prefix(s['no'])} マス{s['cell'][0]}行{s['cell'][1]}列＝{s['range']}"
              f"{'（暗い）' if s['dim'] else ''}：技欄{len(s['panels'])}枚・詳細{len(s['dialogs'])}枚")
    for n in m['notes']:
        print('  ⚠️ ' + n)

    if '--push' in args:
        if m['notes']:
            raise SystemExit('外した画像があるので送らない。内容を確かめてから撮り直すか、画像を除いてやり直す')
        push(out)
        done = os.path.join(src, 'done', datetime.date.today().isoformat())
        os.makedirs(done, exist_ok=True)
        for f in files:
            shutil.move(f, done)
        print(f'受け箱ブランチ {INBOX_BRANCH} へ送り、元画像を {done} へ移した')


if __name__ == '__main__':
    main()

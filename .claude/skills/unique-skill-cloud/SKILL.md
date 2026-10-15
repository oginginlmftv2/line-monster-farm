---
name: unique-skill-cloud
description: 受け箱ブランチ inbox/unique-skills に届いた専用技の束（unique_pack.py が作る切り抜き）を読み取り、検査・TSV追記・取り込み・技アイコン・検証まで進めてPRを作る。クラウドセッション（claude.ai/code）で「受け箱の専用技を取り込んで」と言われたときに使う。手元のミラーリング画像を直接読むときは monster-skill-capture を使う。
---

# 専用技の受け箱を取り込む（クラウドセッション用）

設計は `docs/unique-skill-cloud-design.md`。技DBの列とルールの正は `docs/skill-input-guide.md`、
読み方の細部（オーラ色・★の数え方・解放条件）の正はスキル `monster-skill-capture`。**食い違ったらそちらが正。**

**1セッション＝1束（1体）。**束が複数あっても、古いものから1つだけ処理してPRを作り、そこで終える。

## 0. 準備

```bash
git fetch origin main inbox/unique-skills
git switch -c claude/unique-<束名> origin/main
git worktree add /tmp/inbox origin/inbox/unique-skills   # 受け箱は別の作業ツリーで読む。main へ混ぜない
ls /tmp/inbox/inbox/unique/                              # 束名＝<日時>-<モンスターID>。古い順に並ぶ
pip install -q numpy Pillow                              # 技アイコン用（入っていれば不要）
```

束が無ければ「受け箱は空です」と報告して終える。

## 1. 読む（モデルが働くのはここだけ）

束の `manifest.json` を先に読み、モンスター・血統・技の数（`skills`）を確かめる。
そのあと**束の画像だけ**を読む。元のスクショは無いし、要らない。

| ファイル | 読むもの |
|---|---|
| `name.png` | モンスター名。manifest と違えば止まって報告 |
| `sNN-panel-K.png` | 技名・ランク（丸数字）・技種・消費ガッツ・移動間合い・4評価・技能力の名前（上から順に）。K が2以上はスクロールした続き |
| `sNN-aura.png` | オーラ色。赤・青・緑・黄はそのまま。**暗いガンメタル＝黒、明るい白銀＝白、丸が無い＝無** |
| `sNN-dlg-K.png` | 能力詳細＝技能力の本文。技能力詳細＝上に「解放条件」と★があり、下に本文 |

- **間合いは読まない。**manifest の `range`（選択中のマスの列）を検査スクリプトが使う
- ★は白星＝数そのまま、**ピンク星＝数＋5**（ピンク1＋白4＝★6、ピンク5＝★10）
- 解放条件の詳細が無い技能力は `unlock: null`。詳細があるのに★が読めなければ `"?"`
- 本文の改行はJSONでは `\\n`（TSVには `\n` の2文字で入る）。本物の改行で書いても検査がそろえる。全角・半角は画面のまま写す（登録済みとの表記ゆれは検査が吸収する）
- **読めない値は null。推測で埋めない。**オーラの白／黒に迷ったら `auraSure: false`

読み取りを JSON にして `/tmp/payload.json` へ書く。形は `scripts/check-unique-skill-payload.js` の冒頭、
見本は `tools/skill-autocapture/examples/unique-payload-0150.json`。
`abilityTexts` には、この束で本文を読めた技能力を全部入れる（登録済みの名前も。照合に使う）。

## 2. 検査して追記

```bash
P=/tmp/inbox/inbox/unique/<束名>
node scripts/check-unique-skill-payload.js /tmp/payload.json --pack $P --report /tmp/report.md --apply
```

| 終了コード | やること |
|---|---|
| 0 | 追記済み。3へ |
| 1（FAIL） | 画像を読み直して JSON を直し、出し直す。**値をでっち上げて通さない** |
| 2（STOP） | TSV には書かれていない。4の「止まったとき」へ |

## 3. 取り込み・アイコン・検証

```bash
node scripts/import-skills-tsv.js
python3 tools/skill-autocapture/skill_icon.py add-pack $P /tmp/payload.json
node build.js && node scripts/test-skill-build.js && node scripts/verify.js
```

- `import-skills-tsv.js` が「バフDB未登録の候補」を出したら、勝手に足さずPR本文に書いて聞く
- `skill_icon.py refresh` はクラウドでは回さない（一覧画像に macOS のフォントを使う）。PR本文に「手元で refresh」と書く
- `verify.js` が FAIL 0 でなければ、原因をPR本文に書いて draft にする
- CLAUDE.md「現在の実数」の技件数と「最終更新」を `build.js` のログの値へ直す（同じPRで）

## 4. PR を作る

```bash
git add -A && git commit -m "<モンスター名>の専用技<N>件と技アイコンを登録"
git push -u origin HEAD
gh pr create --base main --title "<モンスター名>の専用技<N>件を登録（受け箱 <束名>）" --body-file <本文>
```

本文は `/tmp/report.md` をそのまま使い、末尾に次を足す。

- 束名と、重複として外した枚数（report に出る）
- 「暗いマスのアイコンは色を戻した推測版。手元で `skill_icon.py refresh` と見た目の確認を」

### 止まったとき（STOP）

- TSV・DBは変えずに、**PRを draft で作る。**変更は無くてもよい（空コミット可）。本文に `/tmp/report.md` の
  「確認してほしいこと」を、登録済みの文面と今回の読取を並べたまま書く
- 自分で決めない：同名の技能力で文面が違う（版の更新か同名別物か）／オーラの白黒／共通技かもしれない／解放条件
- 入力者がPRに答えたら、同じセッションで続きを頼まれる。答えに従って JSON を直し、2から

## 5. 受け箱を片付ける

**PRを作ったあとに、**処理した束を受け箱から消す（draft で止まったときは消さない）。

```bash
cd /tmp/inbox && git rm -rq inbox/unique/<束名> && git commit -qm "受け箱：<束名> を取り込んだ（PR #<番号>）" \
  && git push -q origin HEAD:inbox/unique-skills
cd - && git worktree remove /tmp/inbox
```

## 絶対に守ること

- 1セッション1束。PRのマージ＝入力者の確認なので、**自分でマージしない**
- 束に無い情報（ゲーム画面の記憶・他サイト）で値を埋めない
- `main` へ直接 push しない。受け箱ブランチへ main のファイルを混ぜない
- CSS・レイアウト・`build.js` のテンプレートは触らない（気づいたらPR本文に書くだけ）

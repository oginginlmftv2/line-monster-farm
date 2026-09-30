---
name: ability-score-review
description: CMSでアシスト能力が追加されたあと、未点検の能力の読み方と点・Tierを点検し、読み違いを直してPRにする。「新能力追加したので能力評価を」「未点検の能力を点検して」「能力の点を見直して」と言われたとき、またはアシスト公開の job summary に未点検の能力が出ていると伝えられたときに使う。
---

# 能力評価の点検（未点検の能力）

CMSのアシスト公開は `build.js` を回すので、`src/data/ability-scores.json` の点とTierは自動で作り直される。
ただし**新しい能力の説明文を正しく読めているかは誰も確かめていない。**このスキルは
`docs/ability-scoring-design.md` 5-1 の手順を1回ぶん回し、直すPRを作る。

仕様の正は `docs/ability-scoring-design.md`（語彙は2章、係数の根拠は3-1、読み違いの型は5-2）。
**このファイルと食い違ったらそちらが正。**

| 物 | 場所 |
|---|---|
| 語彙（説明文の読み方） | `src/lib/ability-parser.js` |
| 評価式 | `src/lib/ability-score.js` |
| 基準値・補正・点検済みID | `src/data/ability-rubric.json`（`review.reviewedThroughAbilityId`） |
| 詳細ページの掲載の選び方 | `src/lib/ability-recommend.js` |
| 読み方の点検 | `scripts/audit-ability-reading.js --new` |
| 点・Tierの差分と採点の内訳 | `scripts/ability-review-report.js` |

`src/data/assist-abilities.json` はCMSの生成物なので**直接編集しない。**点が気に入らないときは
説明文ではなく語彙・式・基準値のどれかを直す。

## 手順

### 1. 最新mainから作業ブランチを切り、未点検を出す

```bash
git fetch origin && git switch -c claude/ability-review-<日付> origin/main
node build.js 2>&1 | grep -E 'ability-scores|未点検'
node scripts/audit-ability-reading.js --new
```

`--new` は `reviewedThroughAbilityId` より後の能力を、読み違いの型（読み残し・効果の取れない行・
数値の既定値など）ごとに出す。**機械で拾えるのは読み残しだけ。**読めているのに意味が違うもの
（相手の技の色を自分の技と読む等）は、次の内訳を見て自分で探す。

### 2. 能力ごとに解析結果と点の内訳を見る

```bash
node scripts/ability-review-report.js ab-XXXX ab-YYYY
```

未点検のうち、とくに**イベント能力**（詳細ページの「相性のいいアシスト能力」に載るのはイベントだけ）と、
点が0や極端に低い・高いものを見る。確かめる点：

- 説明文の各行から効果がすべて取れているか（`効果が1つも取れていない`・読み残しが無いか）
- 条件が正しい側にかかっているか（自分／相手、技の色／状況条件）
- 数値を正しい意味で使っているか（上限・累積・ヒット数・回数制限・秒数）
- 同じ系統の既存能力と点が揃っているか（例：新しい `[自身青]不屈` は既存の不屈6色と同点になるはず）

### 3. 読み違いを直す

直す場所は1つに決まる。**迷ったら管理者に聞く。**係数の値を自分で決めない。

| 直すもの | 場所 |
|---|---|
| 書き方が読めない（新しい表記） | `ability-parser.js` の `ATOMS`・`TRIGGERS`・`normalize`・散文の条件 |
| 読めているが価値の付け方が違う | `ability-score.js` の `effectValue`・補正 |
| 数値の前提（割合・上限など） | `ability-rubric.json`。新しい係数は `note` に根拠と日付を書き、**仮置きなら仮置きと書いて管理者に確認を求める** |

直したら**既存の能力の点も動く。**動いた能力は全部、次の報告に入れる（隠さない）。
テストに今回の読みを1行ずつ足す：`scripts/test-ability-parser.js`（読み）・`scripts/test-ability-score.js`（点の関係）。

### 4. 管理者に見せる（必ずこの形）

```bash
node build.js > /dev/null && node scripts/ability-review-report.js
```

出力の「差分表」と「採点の内訳」をもとに、**能力ごとに説明文の全文と採点の内訳を並べて**見せる
（管理者の指定。点とTierだけでは妥当か判断できない）。

1. 新しい能力：説明文 → 効果ごとの計算（基礎値の換算 → 条件・技条件・トリガーの補正 → 回数・稼働率 → 効果量・累積）→ 合計
2. 点が変わった既存能力：前→後と、変わった理由を1行
3. Tier境界の移動だけで動いたもの：件数と名前をまとめて1行
4. 下限（0.05）で止まった補正、読んでいても計算に使っていない値、仮置きの係数は**明記する**

表は数式をそのまま貼らず、「命中率+15% → 期待ダメ+25% → 13.9Lv × 命中の価値1.5 ＝ 20.8」のように
言葉と数字で書く。

### 5. 違和感が無ければ点検済みにしてPR

- `ability-rubric.json` の `review.reviewedThroughAbilityId` を最後の abilityId に進める
- 読み違いの型が新しければ `docs/ability-scoring-design.md` 5-2 の表に1行足し、係数の根拠は3-1へ。冒頭の「最終更新」も直す
- 検証：

```bash
node scripts/build-ability-parse.js
node build.js
node scripts/audit-ability-reading.js
node scripts/test-ability-parser.js && node scripts/test-ability-score.js && node scripts/test-ability-recommend.js
node scripts/verify.js
```

`verify.js` が FAIL 0 でなければ止まって原因を報告する。

- コミット → push → `gh pr create`。PR本文に差分表と、確認してほしい点（仮置きの係数など）を書く
- 能力の点検は公開コンテンツの更新履歴（`index.html`）に載せない（過去のPRの慣例）
- **マージは管理者が明示したときだけ。**GitHub Pagesは `main` を直接配信するので、マージ＝本番公開

## やらないこと

- 点を合わせるために `ability-overrides.json` で手上書きしない（固有ギミック専用。管理者の指示があるときだけ）
- 見送った案を再提案しない：技の色の条件を「R4以上の該当オーラ技の数」で補正する案は2026-09-30に見送り（PR #237）
- Tierをページに出さない（方針。順位の番号も振らない）

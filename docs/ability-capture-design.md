# アシスト能力のスクショ取り込み 設計

最終更新: 2026-09-30

本番影響: スキル・検査スクリプト・文書は⚪。GAS（`26_ability_capture.gs`・`ui_ability_capture.html`・`20_assist.gs`・
`ui_assist.html`・`index.html`）の反映は管理者作業で🟡。取り込みで能力シートが変わり、アシスト公開で🔴。

## 1. 目的

アシストカードの能力（`ab-####`。イベント能力・閃き能力）を、**ゲームのスクショをClaudeが読んで**登録する。
これまでの登録経路は外部DB lMfDB の候補監査（`docs/lmfdb-integration.md`）だけだった。lMfDBは更新が遅れ、
カード名の表記揺れ（`ジュリア(ライバル)`など）で未紐付けが残り、ゲーム側の文面改訂にも追従しない。

方針（2026-09-30 管理者確認）:

- **正はスクショ。**lMfDB由来の既存能力と文面が違えば差分を示し、直すかは入力者が決める
- **重複行を作らない。**同じ能力の未紐付け行があれば、新規作成ではなくその行をカードへ紐付ける
- 取り込みで作った能力を、lMfDB監査が新規候補として二重に出さない
- lMfDBは参考フィードとして残す（監査・候補登録の経路は変えない）

## 2. 流れ

```text
スクショ（1カードぶん）＋カード名
  → スキル assist-ability-capture が読取JSONを書く
  → scripts/check-assist-ability-payload.js … 表記規約と判定（リポジトリの写しで計算）
  → --emit の貼り付け用JSON（判定 action 付き）
  → CMS カード詳細「能力取り込み」タブに貼る
  → api_asstPreviewAbilityCapture … シートで判定し直して表示（読取専用）
  → 入力者が原画像と照合してチェック → 保存
  → api_asstApplyAbilityCapture … ロック下で判定し直し、一致したら追加・紐付け
  → 能力タブで draft → verified
  → 既存のアシスト公開
```

判定は3か所（検査スクリプト・プレビュー・保存）で同じ規則で計算する。
リポジトリの写しは古いことがあるので、**保存時の再計算が最終判定**で、貼り付け時と食い違えば何も書かない。

## 3. 照合と判定

### 3-1. 照合キー（比較専用）

`src/lib/ability-name-key.js`。GASは `26_ability_capture.gs` に同じ式を写し、
`scripts/test-assist-ability-payload.js` が既存DB全件で一致を検査する。

| キー | 式 | そろうもの |
|---|---|---|
| 能力名 | NFKC → 空白除去 | `光香む常闇の衣 I` = `光香む常闇の衣Ⅰ`、`[自身青]ちから＋３%` = `［自身青］ちから+3％` |
| 本文 | `<br>` 除去 → 能力名と同じ | 改行位置の違い |
| 元のカード名 | 能力名と同じ → 末尾の括弧補足を除く | `アインズ(SSR)` = `アインズ`、`ジュリア(ライバル)` = `ジュリア` |

保存値には適用しない（lMfDB設計16-1と同じ）。

### 3-2. 判定

読み取った1件ごとに、上から順に当てはめる。

| 判定 | 条件 | 保存時の処理 |
|---|---|---|
| `known` | このカードのresolved能力に同名があり、本文キーも一致 | なし |
| `known_diff` | このカードのresolved能力に同名があり、本文が違う | なし（差分をWARN） |
| `link` | 未紐付け（unlinked/ambiguous）能力に同名があり、元のカード名キーがカード名キーと一致し、rarityが空かカードと同じ。候補がちょうど1件。または `linkTo` で同名の未紐付け能力を指定 | 既存行を `resolved` にしてカード末尾へ |
| `link_ambiguous` | 上の候補が2件以上で `linkTo` なし | 保存不可（検査FAIL） |
| `create` | どれにも当たらない | 新規行を追加 |

閃きの汎用名（`[自身青]不屈` など）は全カード共通の名前なので、元のカード名が違う同名は候補にしない。
イベント能力でだけ、元のカード名が違う同名の未紐付け能力をINFOで案内し、同じ能力なら入力者が `linkTo` で選ぶ。

2026-09-30時点で、未紐付け522件のうち149件は元のカード名がカードと一致する（例 `白凰(ライバル)` 24件 → `e9-SSR-hakuou`）。
該当カードを撮れば、新規行を作らずに紐付けで解消できる。

### 3-3. 既存能力の本文

取り込みは既存行の本文・名前・状態・`legacyId`を変えない。`known_diff` と、本文が違う `link` は差分を示すだけ。

- 移行データ（`legacyId`あり、1,079件）は `verify-assist-cms.js` の内容ロックで本文を変えられない。報告だけ
- それ以外（`ab-1085`以降）は、入力者がCMSの能力編集で直す

## 4. 表記規約

既存1,248件の実測（2026-09-30）に合わせ、`check-assist-ability-payload.js` が検査する。

| 対象 | 規約 | 検査 |
|---|---|---|
| 本文の改行 | `<br>`。`\n`は不可。先頭・末尾・連続は不可 | FAIL |
| 本文の山括弧 | 全角 `＜＞`（HTMLは `<br>` だけ） | FAIL |
| 角括弧 | 半角 `[ ]`（本文・名前とも） | FAIL |
| 本文の ％ ＋ － | 全角 | FAIL |
| 本文の数字 | 全角。`Lv1`・`R4`・`[最大2回まで]` は半角のまま | 半角はWARN（既存に22件の例外） |
| 名前の数字・＋ | 全角 | FAIL |
| 名前のローマ数字 | 半角英字＋前に半角空白（` I` ` II`）。記号の直後（`！IV`）は空白なし | FAIL |
| 名前の既存表記 | 比較用キーが同じ既存能力があれば、その表記のどれかに合わせる | FAIL（最多の表記を示す） |
| タグ | CMSのタグ候補（`ASST_ABILITY_TAGS`）か既存DBにある語 | FAIL |

効果（`assist-effect-capture`）はローマ数字を全角 `Ⅱ` で名前に直付けする。能力は逆なので混同しない。

## 5. サーバーAPI（`_cms/gas/26_ability_capture.gs`）

`20_assist.gs` は100KB上限に近いため、新しいファイルに置く。

### 5-1. 入力（貼り付けJSON）

```json
{
  "schemaVersion": 1, "source": "claude-vision", "cardId": "c0003-MR", "sourceScreenshots": ["a.png"],
  "abilities": [
    { "action": "create", "name": "…", "description": "…", "source": "閃き", "tags": [] },
    { "action": "link", "abilityId": "ab-0522", "name": "…", "description": "…", "source": "閃き", "tags": [] }
  ]
}
```

- `action` は `known / known_diff / link / create`。`link` だけ `abilityId` 必須、`create` は `abilityId` 不可
- 名前200字・本文5000字、制御文字・script・`<br>`以外のHTMLは不可（lMfDB作成APIと同じ検査関数）
- 同じ名前キーが2回、30件超、未知キーは拒否

### 5-2. `api_asstPreviewAbilityCapture(payload)`

読取専用。ロックを取らず、シートを書かない。現在のシートで判定し、各件の `action`・`abilityId`・候補・既存行
（本文・元のカード名・状態・`legacyId`）と、貼り付け時の判定と一致するか（`ok`）を返す。

### 5-3. `api_asstApplyAbilityCapture(payload)`

1. 入力検査（書込み前に全件）
2. ScriptLockを即時取得（取れなければ拒否）。カード・能力・外部参照を読み直す
3. 全件を判定し直し、貼り付け時の判定と1件でも違えば**何も書かない**
4. `link` と `create` を貼り付け順に処理し、sortOrderはカード末尾から連番
   - `link`: `cardId`・`sortOrder`・`linkStatus: resolved`・`version+1`・更新者だけを変える
   - `create`: `abilityId` は `asstNextAbilityId_`（能力シートと外部参照の最大+1）、`sourceOrder` は最大+1、
     `legacyId: null`・`status: draft`・`flags: []`・`rarity` と `sourceName` はカードから
5. 書込み後に行数・ID一意・3DB全体を検証し、`assist_log` へ `apply-ability-capture` を固定キーのJSONで記録
6. 途中で失敗したら、lMfDB作成APIと同じジャーナル補償で書いた行をすべて戻す

公開は呼ばない。新規はdraftなので、verifiedにするまでカードページに出ない（`build-assist-pages.js` の既存条件）。

## 6. lMfDB監査との関係

外部候補が、既存の分類（完全一致・表記違い・既存内容差分・ID再利用疑い・重複内容一致）のどれにも当たらず、
次を満たすローカル能力があれば、新分類 `local_card_name_match` にする。新規候補には入れず、登録ボタンを持たない。

- 能力名キーが外部の `name` と同じ
- かつ、対応表で引いた `cardIdCandidate` にresolvedで付いている、または元のカード名キーが外部の `card` と同じ

Node版は `scripts/sync-lmfdb-abilities.js` の `localCardNameMatches`、GAS版は
`26_ability_capture.gs` の `asstCaptureAuditNameMatches_`（`20_assist.gs` の `asstAuditAnalyze_` から呼ぶ）。
CMS画面は「その他」タブに「同じカードに同名あり」として出す。
固定コミット `dad5d301` では1件（`ロボトルファイト！IV / イッキ`。ローカル `ab-1235` とタグだけ違う）が該当し、
それまで新規候補に出ていた二重登録のもとが消える。

取り込みで紐付けた既存行は `abilityId`・`legacyId` を変えないので、`ability_external_refs` の履歴とそのままつながる。
取り込みは `ability_external_refs` に行を足さない（外部由来ではないため）。由来は `assist_log` に残る。

## 7. 検査

| 検査 | 内容 |
|---|---|
| `scripts/test-assist-ability-payload.js` | 判定5種・表記規約・emit、GASとの判定一致（既存DB全件）、lMfDB同名判定のNode/GAS一致、取り込みAPIの採番・紐付け・食い違い拒否・入力検査・補償（模擬シート） |
| `scripts/verify-assist-cms.js` | 取り込みAPIの判定再計算・draft・本文不変・補償・ScriptLock、プレビューの読取専用、監査の同名判定呼び出し、画面の照合チェック |
| `scripts/test-verify-assist-cms.js` | 上の検査を壊したコピー7件が拒否されること |
| `scripts/verify.js` 16章 | `test-assist-ability-payload.js` を実行 |

## 8. 対象外

- 能力画像（`assist-abilities/`）とFirestore `cardAbilities/assignments`。書込み停止中のまま
- 既存能力の本文修正（CMSの能力編集で行う）、紐付けの解除（既存の `api_asstUnlinkAbility`）
- EXトレ・伝授の能力画面（スクショ未入手。`source` の値としては受け付ける）

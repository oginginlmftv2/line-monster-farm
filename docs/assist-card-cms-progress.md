# アシストカードDB・静的ページ・CMS 設計進捗

最終更新: 2026-08-31

状態: **P12-20レビュー待ち。本番GASで`aab-MR-julia`の保存成功を確認し、PRマージ後の公開確認待ち**

手順と確認項目は`docs/assist-card-create-runbook.md`を正とする。

この文書は、アシストカード情報基盤の詳細な現在地、設計、依存関係、保留事項、
実施順を管理する正である。全体の現在地は`docs/PROGRESS.md`、全体計画は
`docs/ライ徹_開発計画.md`、実装時のビルド仕様は`docs/build-spec.md`を正とする。

## 1. 目的

現在のアシストカード詳細は、共通の`cards/card.html`がURL fragmentからカードを選び、
複数の管理元をブラウザで読み合わせて表示している。これを次の構成へ移行する。

1. カード基本情報、アシスト効果、能力テキストの3つを、`cardId`基準の正規DBへ整理する
2. 全カードに固有URL、固有title、description、canonicalを持つ静的HTMLを生成する
3. 能力画像は公開表示の正にせず、画像キャプチャから確認済みテキストを作る証跡として扱う
4. カード、効果、能力、画像キャプチャ、OCR候補、確認状態を管理できる専用CMSを作る
5. 公開クライアントからの書込を復活させず、検証後のPRだけで公開する

## 2. 今回の設計で変更しないもの

P12-2は文書設計だけであり、次を変更しない。

- `assist.html`、`cards/card.html`、その他の公開HTML
- `cards/cards-data.js`、`assist-effect-data.js`、能力DB、Firestoreデータ
- `assist-cards/`、`assist-abilities/`の画像
- `build.js`、sitemap、自動生成物
- GAS、Google Sheets、Drive、GitHub Secrets・Rules、Firestore rules

休止中ファイルは復活、削除、直接読込をしない。100KB超のデータはNodeスクリプトで
件数・項目名・参照関係だけを抽出した。

## 3. リポジトリで確認できた現状

### 3-1. 現在の表示経路

```text
assist.html
  └ cards/card.html#<cardId>
       ├ cards/cards-data.js               基本属性・画像拡張子
       ├ Firestore cards/<cardId>           評価・解説・編成
       ├ assist-effect-data.js              アシスト効果
       ├ Firestore cardAbilities/assignments 能力画像ファイル割当
       └ assist-abilities/<画像>             能力の公開表示
```

`cards/card.html`のcanonicalは全カード共通の`/cards/card.html`である。JavaScriptが
`location.hash`を読んでtitleと本文を差し替えるため、カードごとの静的URL、固有description、
固有canonicalは存在しない。能力は画像のままで、検索可能な本文テキストになっていない。

### 3-2. 現在のデータ件数

| 管理元 | 確認値 | 現状 |
|---|---:|---|
| `cards/cards-data.js` | 91カード / 89固有名 | 現在の一覧と詳細表示の基本情報 |
| `assist-cards/` | 現行91カードの画像欠落0 | カード画像 |
| `src/data/cards-editorial.json` | 90カード | 2026-08-18のFirestore export。ジンゴロウ未収録 |
| `assist-effect-data.js` | 83カード / 888効果 | 現行91カードのうち新しい8カードが未登録 |
| `assist-abilities/` | JPG 200件 | 公開中の能力画像。カードとの割当はrepo外 |
| Firestore `cardAbilities/assignments` | 未確認 | `cardId -> 画像ファイル配列`。現在値は外部確認待ち |
| 旧`assist-card-data.js` | 213行 | main 175 / sub 38。現在91カードの正にはできない |
| 新形式`lMfDB_abilities.json` | 1,079能力 | `id/name/desc/card/tags/source/rarity`。ID重複0 |
| 旧形式`lmfdb_abilities_data.json` | 593能力 | 新形式に完全一致575件、変更・削除相当18件 |

新形式能力DBの`source`は、イベント644件、閃き403件、EXトレ32件である。
現在のカード名・レアリティだけで一意に結べた能力は552件、結べなかった能力は527件だった。
能力側が表示名を参照しており、安定した`cardId`を持たないことが主な移行課題である。

### 3-3. 旧機能から再利用できる考え方

休止前の`ability-search.html`は、能力名・効果・カード名、イベント/閃き、MR/SSR、
距離、地形、タグのAND/OR検索を持っていた。データの`name`、`desc`、`card`、`tags`、
`source`は新しい能力DBの候補として再利用できる。

P11-6で停止した旧管理画面には次の処理があった。

- `ability-match.html`: `cardAbilities/assignments`へカードと能力画像の対応を保存
- `assist-effect-input.html`: 貼り付けテキストを`name/desc/totsujou`へ分解
- `assist-effect-import.html`: 静的効果データをFirestore `cards/<cardId>`へ一括保存

これらの公開HTMLにあった共有パスワードとFirestore writeは復活させない。
テキスト解析、プレビュー、カード選択、割当確認という操作の考え方だけを、認証済みCMSへ移す。

## 4. 正とする3つのDB

すべての参照は表示名ではなく、既存`cards/cards-data.js`のキーを引き継ぐ不変の`cardId`で結ぶ。
カード名やレアリティが表示上変わっても`cardId`は変更しない。

### 4-1. カードDB

推奨パス: `src/data/assist-cards.json`

```json
{
  "schemaVersion": 3,
  "cards": [
    {
      "cardId": "g3-MR-jingorou",
      "name": "ジンゴロウ",
      "rarity": "MR",
      "aura": "緑",
      "cardType": "ジャッジ",
      "monType": "幻霊",
      "event2": "調査中",
      "image": "assist-cards/g3-MR-jingorou.jpg",
      "accessoryStatus": "unknown",
      "stats": [
        { "label": "応援効果", "value": "+32%" },
        { "label": "得意率", "value": "+30%" },
        { "label": "初期ジャッジ", "value": "+32" }
      ],
      "ratings": { "ikusei": null, "karyo": null, "battle": null, "ta": null },
      "explanation": "",
      "formations": []
    }
  ]
}
```

要件:

- `cardId`重複0、空欄0、既存IDの変更0
- 画像は`cardId + 拡張子`と一致し、実在すること
- `rarity/aura/cardType/monType`は許可値で検査する
- `accessoryStatus`は`unknown/yes/no`。既存nullはCMS入力完了まで`unknown`とする
- `stats`は入力済みカードが重複なしの`label/value`3項目、値は`+実数`または`+数値%`、未入力カードは空配列とする
- 得意トレ、初期親密度、`cardType`/属性との重複は`stats`へ含めない。ルリの`cardType`は「アキュメン」
- 旧`distance/terrain`は`event2`へ統合し、カードDBから削除する。カード`status`も文章量ゲートと重複するため持たない
- 評価・解説・編成は現在のFirestore exportを取り込み、カードDBの論理的な子データとする
- 日付はCMSが保存した値を入力に含める。build時刻は出力しない
- カードのindex可否は可視本文800字以上かつ管理者解説50字以上の文章量ゲートで決める

### 4-2. アシスト効果DB

推奨パス: `src/data/assist-effects.json`

```json
{
  "schemaVersion": 1,
  "cards": {
    "g3-MR-jingorou": [
      {
        "effectId": "g3-MR-jingorou-e01",
        "name": "効果名",
        "description": "効果説明",
        "unlockRank": "無凸",
        "sortOrder": 1,
        "status": "verified"
      }
    ]
  }
}
```

要件:

- 全キーがカードDBに存在すること
- `effectId`と`sortOrder`がカード内で重複しないこと
- `unlockRank`は許可値へ正規化し、元表記を勝手に補正しないこと
- 現在の83カード888効果は機械変換し、未登録8カードは空配列ではなく`draft`として可視化する
- 旧Firestore `assistEffects`と`cards.assistEffects`は移行確認用で、公開の正にしない

### 4-3. 能力DB

推奨パス: `src/data/assist-abilities.json`

```json
{
  "schemaVersion": 1,
  "abilities": [
    {
      "abilityId": "ability-0001",
      "cardId": "f3k-SSR-baromu",
      "name": "能力名",
      "description": "能力説明",
      "source": "イベント",
      "tags": ["オーラ黒", "デバフ"],
      "sortOrder": 1,
      "status": "verified"
    }
  ]
}
```

要件:

- 既存数値IDは移行時の`legacyAbilityId`として保持し、新IDとの対応表を残す
- 表示名ではなく`cardId`を必須にする。候補が曖昧な527件を自動確定しない
- `source`は当面`イベント/閃き/EXトレ`を許可値とする
- `tags`は検索用。OCRが推測しても管理者確認前は`verified`にしない
- 能力画像は公開本文の代替にせず、CMS内の確認証跡としてDriveで管理する
- 公開JSONに個人メール、Driveの非公開URL、OCRサービスの秘密値を含めない

## 5. 静的カード詳細ページ

推奨URL:

```text
/cards/<cardId>.html
例: /cards/g3-MR-jingorou.html
```

生成元は3DBとし、必要に応じて既存の評価・解説・編成をカードDBから出力する。

ページ構成:

1. パンくず、カード名、画像、基本属性
2. 評価
3. アシスト効果（テキスト）
4. 能力（能力名、説明、入手元、タグ）
5. 管理者による評価解説
6. おすすめ編成
7. 関連カードと一覧への導線

必須条件:

- カードごとに固有title、description、canonical、h1を出力する
- すべてのDB値をHTMLエスケープし、同じ入力なら同じバイト列を出力する
- 入力91カードなら静的詳細も91件生成する
- 全カードを静的生成することと、検索index対象にすることを分離する
- 確認済み本文が不足するページは`noindex,follow`、sitemap除外、広告なしにする
- index可否の品質条件はP12-3の文字数・効果数・能力数の分布を根拠にP12-7着手前に確定する。
  モンスター詳細の800字基準はアシストカードへ自動流用しない
- `assist.html`のリンクは静的URLへ切り替える
- 旧`cards/card.html#<cardId>`は削除せず、静的URLへ転送する互換入口として残す
- コメントを残す場合も読取専用の追加表示とし、静的本文の生成をFirestore障害に依存させない

`docs/build-spec.md`はP12-7でカード生成仕様を正式追記してから実装する。

## 6. 新しいアシストカードCMS

モンスターCMSへ直接混在させず、責任範囲と公開許可ファイルを分けた
「ライ徹アシストCMS」を推奨する。認証はApps Scriptの実行ユーザーに任せ、
公開ページへ管理機能や秘密値を置かない。

### 6-1. 管理画面

- カード一覧: 状態、基本情報、効果件数、能力件数、画像、公開可否
- カード編集: 基本属性、評価、解説、編成、カード画像
- アシスト効果編集: 貼り付け解析、行プレビュー、凸表記、並び順、重複警告
- 能力キャプチャ: 画像アップロード、OCR候補、カード候補、能力分割
- 能力レビュー: 原画像と候補テキストを並べ、管理者が修正・承認
- 公開前検査: 未確認、未知ID、画像欠落、重複、許可外値を一覧化
- 公開履歴: source commit、PR、成功・失敗step、復旧対象を記録

### 6-2. 画像から能力テキストを登録する流れ

```text
画像キャプチャをアップロード
  → Driveの専用フォルダへ保存
  → OCRがrawTextと能力候補を作る
  → parserがname/description/source/tags候補へ分割
  → 管理者が原画像と比較して修正
  → verifiedへ変更
  → DB検査
  → PRで公開
```

OCR結果は必ず候補扱いにする。OCR成功だけで`verified`または公開にしない。
1画像に複数能力がある場合は分割し、同じ画像から作られた関係をCMS内だけで保持する。

OCR方式はP12-9で比較して決める。必要条件は、日本語認識、費用、利用規約、GASからの利用方法、
秘密値の保管、失敗時の手入力である。方式未決定の間も、画像アップロードと手入力だけで
登録できる構成にする。

### 6-3. CMS内の状態

```text
draft → ocr_done → needs_review → verified → published
                         └ rejected
```

- `draft`: 画像または手入力を受け付けた段階
- `ocr_done`: OCR候補があるが未確認
- `needs_review`: parserまたは重複検査に要確認がある
- `verified`: 管理者が原画像と照合済み
- `published`: 対応PRがmainへ反映済み
- `rejected`: 誤画像・重複・対象外

## 能力検索ツールの再構築に向けた前提

### 公開用JSONを別に生成する

`src/data/assist-abilities.json` はCMSの入力データであり、`legacyId`、
`linkStatus`、未確認レコードを含む。これをブラウザに直接読ませると内部状態が公開される。

`build.js` が、**`status: verified` かつ検索に必要な項目だけ**を抜いた
公開用JSONを別途生成し、検索ページはそれを読む。
GitHub Pages 配信のため同一オリジンで取得でき、外部ドメインを叩く必要はない。

### unlinked 512件の扱い

能力1,079件のうち、現行91カードに結べたのは560件（resolved）で、
512件は現行カードに存在しない名前（unlinked）である。

- **resolved**: カード詳細ページへリンクする
- **ambiguous / unlinked**: `sourceName` をテキスト表示するだけでリンクしない

`sourceName` を必ず保持する設計になっているため、この出し分けに追加設計は要らない。
検索の網羅性を保ったまま、リンク切れを作らない。

### 検索ページ自体は noindex とする

検索結果はJS描画でクローラーに見えない。インデックスを狙うと、
中身の無いページとして薄いコンテンツ判定の材料になる。
ツールページとして `noindex` で運用する。

## 7. 保存先と公開経路

推奨する管理境界:

```text
GAS / test Sheet / Drive
  ├ cards
  ├ assist_effects
  ├ abilities
  └ publish_log

検証済みデータだけをJSON export
  → cms/assist-publish（専用branch）
  → schema・ID・差分検査
  → build.js
  → verify.js
  → main向けPR
```

新CMSはmainへ直接pushしない。最初からPR経由とし、変更範囲を3DB、許可された画像、
生成カードHTML、一覧リンク、sitemapに限定する。

ただし、GitHub ActionsのPR作成権限と専用token/Appを設定できる管理権限が現在ない。
P11-7〜9と同じ外部依存が解消するまで、自動PR公開は完了扱いにしない。
それまでは、CMSのJSON exportをClaudeの通常作業ブランチへ取り込み、レビューして公開する。

専用tokenを使う場合も本番`CMS_PUBLISH_TOKEN`と共有しない。値はGAS Script Propertiesと
GitHub Secretにだけ置き、文書・Sheet・ログへ記録しない。

### 7-1. スプレッドシートはモンスターと同居させる

カード・効果・能力の各DBは、モンスターCMSと**同じスプレッドシート**に
シートを追加する形で持つ（`cards` / `assist_effects` / `abilities`）。
メンバー管理、認証、Driveはそのまま流用する。データ量は
能力1,079＋効果888＋カード91 ≒ 2,000行で、Sheetsにも実行時間にも収まる。

### 7-2. 🔴 公開経路は分ける（許可リストを広げない）

P11-4 で入れた `scripts/verify-cms-source.js` の許可リストは、
モンスター用の入力ファイルだけを通す。

```
TEXT_SOURCE_FILES = monsters-data.js / cms-id-predictions.json / monsters-editorial.json
IMAGE_PATH        = monster/<4桁>.(jpg|png|webp)
```

同じ「公開」操作でカードのJSONを流そうとすると、このゲートは正しく拒否する。
**許可リストにカード用ファイルを足してはならない。** ゲートの価値は狭さにあり、
広げるとモンスター側の守備範囲まで緩む。

分けるのは**公開ブランチとWorkflowだけ**とする。

```
モンスター: cms/publish        → 既存Workflow・既存許可リスト
アシスト  : cms/assist-publish → 新Workflow・カード用の別許可リスト
```

### 7-3. 🔴 `sitemap.xml` の競合を防ぐ

`sitemap.xml` は両方の公開経路が書き換える生成物である。
モンスター公開とカード公開が同時に走ると競合し、片方のURLが消える。

- GitHub Actions に **concurrency group** を設定し、2つの公開Workflowを直列化する
- どちらの経路も、差分を当てるのではなく**必ず全データからsitemapを作り直す**

## 8. 移行方針

### 8-1. 移行前に取得するもの

- Firestore `cards`全documentの最新読取export
- Firestore `cardAbilities/assignments`の最新読取export
- 旧`assistEffects`が残る場合は読取export
- 3つの大容量旧DBのhash、件数、項目、重複、参照不能一覧
- `assist-abilities/`のファイル一覧と、Firestore割当から参照されない画像一覧

Firestore rulesは変更せず、読取だけで取得する。値を推測して埋めない。

### 8-2. 移行の順序

1. 現行91カードの`cardId`を固定する
2. カードDBへ基本情報と最新Firestore exportを統合する
3. 83カード888効果を効果DBへ機械変換し、8カードを未登録として残す
4. 1,079能力を`cardId`へ対応付ける。自動確定、候補、未解決を分離する
5. Firestore画像割当と能力テキストを照合する
6. 静的ページを並行生成し、現行ページと比較する
7. 内部リンク、canonical、sitemapをPR単位で切り替える
8. 安定後も旧共通ページと旧DBをすぐ削除せず、復旧期間を置く

### 8-3. 復旧

- 公開HTMLの問題: P12-7以降のPRをrevertし、`assist.html`を旧fragment URLへ戻す
- DB変換の問題: 移行前JSONとhashへ戻し、未解決レコードを再確認する
- CMSの問題: deploymentを直前版へ戻し、公開branchを更新しない
- OCRの問題: 候補を破棄し、原画像から手入力する。誤認識を公開DBへ入れない
- GitHub公開の問題: PRを閉じ、mainを変更しない。merge後は該当PRをrevertする

Firestore write禁止と旧読取表示は、静的移行の確認が終わるまで維持する。

## 9. 実施タスク

| 順 | ID | 作業 / ブランチ | 主な変更 | 外部設定 | 影響 | 完了条件 |
|---:|---|---|---|---|---|---|
| 1 | P12-2 | 現状整理と設計 / `chore/p12-2-assist-cms-design` | 本文書、全体計画・進捗・引き継ぎ | 無 | ⚪ | 事実・未確認・DB・静的生成・CMS・復旧・依存関係を分離し、FAIL 0 |
| 2 | P12-3 | データ監査と読取export / `chore/p12-3-assist-data-audit` | 監査スクリプト、件数・hash・対応表、監査報告 | Firestore読取のみ | ⚪ | 現行・旧DB・Firestore・画像割当の件数と不一致を値を変えず確定 |
| 3 | P12-4 | カードDB正規化 / `chore/p12-4-assist-card-db` | `src/data/assist-cards.json`、変換・検証スクリプト | 無 | ⚪ | 91 ID、画像、属性、editorial参照が一致。公開表示は未切替 |
| 4 | P12-5 | 効果DB正規化 / `chore/p12-5-assist-effects-db` | `src/data/assist-effects.json`、変換・検証スクリプト | 無 | ⚪ | 83カード888効果を損失なく変換し、未登録8カードを明示 |
| 5 | P12-6 | 能力DB正規化 / `chore/p12-6-assist-abilities-db` | `src/data/assist-abilities.json`、ID対応表、検証スクリプト | 必要ならFirestore読取 | ⚪ | 1,079件を確定・候補・未解決に分離し、誤対応0、重複ID 0 |
| 6 | P12-7 | 静的カード詳細生成 / `feat/p12-7-assist-pages` | `docs/build-spec.md`、`build.js`、`verify.js`、生成HTML、一覧、互換入口、sitemap | 無 | 🔴 | 入力全件を決定的生成し、固有canonical、index制御、リンク、FAIL 0 |
| 7 | P12-8 | アシストCMS基盤 / `feat/p12-8-assist-cms` | `_cms/assist-gas`、test Sheet仕様、管理画面、検証 | 新規test GAS/Sheet/Drive | ⚪（test） | 3DBをtest環境で編集・exportでき、本番deploymentは未変更 |
| 8 | P12-8b | CMS構造化フォーム / `feat/p12-8b-assist-forms` | JSON入力UI、繰り返し行、選択式入力、カードDB schema v3、内部項目の参照専用化 | test GAS更新 | 🟡🔴 | 運用者がJSONを直接編集せず3DBを安全に更新でき、無損失exportを維持 |
| 9 | P12-9 | OCR・レビュー工程 / `feat/p12-9-assist-ocr` | OCR adapter、parser、レビュー画面、重複検査 | OCR方式により外部サービス | ⚪（test） | OCR候補が自動公開されず、手入力fallbackと原画像照合が通る |
| 10 | P12-10 | CMS公開PR経路test / `feat/p12-10-assist-publish` | 専用Workflow、source/generated gate、test手順 | GitHub test branch・専用token/App | ⚪（test） | 許可差分PR成功、許可外・古いmain・未確認データはmain不変でFAIL |
| 11 | P12-11 | 本番移行 / `feat/p12-11-assist-cutover` | 本番データ取込、CMS deployment、全静的ページ切替 | GAS/Sheet/Drive/GitHub | 🟡🔴 | 管理者承認後、公開成功、全カード表示、旧URL互換、復旧確認 |
| 12 | P12-12 | 能力検索の再構築 / `feat/p12-12-ability-search` | 静的能力DBを使う検索UI | 無 | 🔴 | 旧データを直接使わず、確認済み能力だけを検索できる |

公開物または外部設定を変更するP12-7以降は、管理者の明示承認なしに開始しない。

### 9-1. P12-8 test実機結果

- P12-8専用のApps Scriptとスプレッドシートを作成し、本番CMS・本番Sheetとは分離した
- Script Propertiesは`ENVIRONMENT=test`とtest用`SPREADSHEET_ID`だけを設定した。値はリポジトリへ記録しない
- mainの公開JSONからカード91件、効果888件、能力1,079件を取り込み、`setup4_check`はissues 0
- カード1件の保存と復元、古いversionからの保存拒否、効果11件の無変更保存、resolved能力1件の無変更保存を確認した
- 初回exportでSheetsの日付型変換と`withStats`集計条件の不備を検出した。日付を`yyyy/MM/dd`へ戻し、全値nullのstatsを集計対象外にする修正をdeployment v2へ反映した
- ウェブアプリは実行者本人だけに限定した。GitHub token、Driveフォルダ、公開branch、本番deploymentは使っていない
- 修正版3DBを再exportし、元JSONとの意味差分0、`releasedAt`形式不正0件、`withStats: 56`を確認した
- exportの秘密情報検査はメールアドレス、GitHub token、Spreadsheet ID名、Drive ID名が全て0件だった

### 9-2. P12-8b test実機結果

- カードDBをschema version 3へ更新し、`accessoryStatus`と3組の`label/value`型`stats`を導入した
- 旧距離適性22件・地形適性19件を`event2`へ統合し、カードDB・CMSシートから独立項目を削除した
- ルリ`b17h-MR-ruri`の`cardType`を「ガード」から「アキュメン」へ訂正した
- testへ再取込後の`setup4_check`はカード91件、効果888件、能力1,079件、issues 0
- `stats.value`の単位を復旧し、応援効果・得意率・チャレンジ効果アップは`+数値%`、その他は`+数値`へ全56カードを再生成した
- カード`status`は文章量ゲートと重複するためカードDB・CMSシート・画面から削除した
- `cardType`、画像、実装日、評価範囲の保存・export検査を追加した
- ウェブアプリdeployment v6へ更新し、実行者本人限定のまま91カードの読込を確認した
- カード画像アップロードはP12-9、`assist.html`のデータ源切替はP12-11で扱う。既存の`cards/<cardId>.html` URLは維持する
- カード詳細フォーム内の各入力と無変更保存は管理者の画面確認待ち

### 9-3. P12-9 アシスト効果OCR着手

- 能力1,079件は既存OCR由来DBと外部連携を正とするため、P12-9ではアシスト効果画像を優先する
- 縦スクロール画像は効果カードが前後画像へ重複するため、正規化した効果名でまとめ、説明が長い候補を保持する
- 黄・金色背景は血統・モン類・種族などの条件付き効果、白背景は全モンスターで使える汎用効果として画素判定する
- 条件付き効果は、効果全体の発動条件に限って主血統一致・副血統一致・オーラ一致・モン類一致・種族一致の5種を抽出する
- 複数条件は論理式で保持する。ヴィトニルの「主血統、副血統またはオーラ」は3条件の`or`とし、OCR原文も併記する
- 条件原文は論理式の抽出根拠・OCR照合用の内部情報とし、説明から自動入力する。公開表示項目にはしない
- 特定モンスター、ブリーダー出現中、一緒にトレーニングなど説明中の効果要件は、全体発動条件へ分類しない
- 背景色が境界値の場合は推測せず`unknown`、青丸が取得できない場合は解放段階を未設定としてレビューへ回す
- ヴィトニル4枚では12効果を確認。既存DBに説明欠落4件以上、名称末尾差2件、誤字1件、解放段階差1件を確認した
- OCR候補は既存DBとの差分を表示するだけで、自動で`verified`または公開DB更新を行わない
- test CMSへ「効果OCR」タブを追加し、複数画像選択、Vision OCR、画素背景判定、青丸判定、条件補正、効果編集への未保存反映を行う
- Vision APIキーはScript Propertiesだけに置く。画像とOCR候補はブラウザ内だけに保持し、Driveやスプレッドシートへ保存しない
- test用Google CloudプロジェクトでVision API有効化、Vision限定APIキー、毎分30リクエスト、月額500円の予算アラートを設定した
- Script Propertiesの`OCR_DAILY_LIMIT=100`をGASが日本時間の日付単位で強制し、同時実行はScript Lockで直列化する。APIキーはURLでなく`x-goog-api-key`ヘッダーへ送る
- test Apps Scriptへ同期してウェブアプリdeployment v7へ更新した。実行者・アクセス範囲は「自分のみ」を維持した
- ヴィトニル画像1枚をVisionへ実送信し、日本語OCR 385文字、日次使用数1/100、残り99件を確認した
- deployment v7で4枚を実OCRした初回は、効果説明中の`ブリーダートレ出現率+15%`など2行を効果名として誤分割し14候補になった。既存効果名との曖昧一致と説明行除外を追加し、deployment v8で正しい12候補へ修正した
- 12候補は条件付き6件・汎用6件、解放段階は無凸5件・1凸2件・2凸2件・3凸2件・4凸1件。主血統/副血統/オーラの`or`1件とモン類一致3件を自動抽出した
- `モン類ブリーダー・鍛錬`と`モン類ブリーダー・継承`は、モン類一致で出現するブリーダーへの依存から便宜上`monTypeMatch`として扱う。オーラブリーダー派生効果も同様に`auraMatch`とする。条件原文は効果欄の実文を保持し、判定根拠を`breeder-dependency`として分離する
- 上記対応をdeployment v9へ反映し、実OCR候補12件をtest `capture_queue`へ`needs_review`で保存した（captureId: `effect-ocr-47a82bb3-c79e-419f-abf3-1c81d937ea5b`）
- OCR誤読の`メンタルボーナス | +1`、背景境界2件、未分類条件2件は原画像レビュー対象として保持する。Vision日次使用数は9/100で、保存確認用の一時関数は削除し通常ソースへ復元済み
- カード単位の保存済み確認キューを追加し、`capture_queue`から候補を再読込して修正内容を上書きできるようにした。処理状態は`needs_review`、`verified`、`rejected`の3種
- 画像本体は保存しないため、`verified`への変更時は保存時の元画像をすべて再選択し、OCR文字列・背景・解放段階・全体発動条件を照合する。アップロード時の先頭連番やコピー番号は正規化し、保存時・今回・一致状態を画面表示する。要確認項目が残る候補は確認完了できない
- test Apps Scriptをdeployment v12へ更新した。ヴィトニルの保存済み12候補をv12で再読込し、読み込み中モーダル、黄色候補の背景、`モン類ブリーダー・鍛錬` / `モン類ブリーダー・継承`の`monTypeMatch`補完と`breeder-dependency`保持を確認した
- test Apps Scriptの既存ウェブアプリをdeployment v14へ更新した。通知は追従操作欄の上（実画面113px）へ表示し、原画像未選択時は保存時・今回のファイル名を示す詳細エラー、付加連番を除くファイル名正規化を確認した
- 黄色条件付き候補は発動条件を1件以上選ばない限り、効果編集への反映を拒否する。候補カードは背景色で区別し、画像読込・OCR・GAS通信中は画面下部モーダル、通知は画面下部固定で表示する
- 画面下部通知は追従操作欄の高さを加算して操作ボタンより上へ表示し、通知とボタンの重なりを防ぐ
- `capture_queue`、関連API、確認キューUI、ファイル名一致・再選択を完全撤去した。候補はページ内だけに保持し、原画像照合チェック後に効果編集へ未保存反映する。再読み込み・カード切替・候補破棄で消える
- test Apps Scriptの既存ウェブアプリをdeployment v15へ更新。旧testスプレッドシートの`capture_queue`タブ（データ1行）も削除し、一時削除関数をApps Scriptから除去して監査用ソースとのSHA-256一致を確認した
- カードフォームへ画像選択・プレビュー・Driveアップロードを追加した。管理者指定の「共有アイテム / ライ徹_画像 / assist-card」をtest・本番で共有し、そのIDを`ASSIST_IMAGE_FOLDER_ID`へ設定する。GASはフォルダやサブフォルダを作成・移動せず、指定先直下へCMSで新規選択・差し替えた画像だけを保存する。モンスターCMSと同じ2MB上限・画像実体検査・同一ID旧版のゴミ箱移動を適用し、既存91画像はDriveへ複製しない。公開サイトはGitHubの`assist-cards/`を読み、Driveからの送信はP12-10以降へ分離した
- test Apps Scriptの既存ウェブアプリをdeployment v20へ更新。指定DriveフォルダIDのScript Properties設定、初回Drive権限承認、`setup5_createAssistImageFolder`の実行完了、カード画像アップロードUIの有効化を確認した
- deployment v20からヴィトニル画像1枚を実アップロードし、指定Driveフォルダ直下の`a24j-MR-vitoniru.jpg`保存を確認した。既存91画像の複製、サブフォルダ作成、GitHub・公開DB更新は行っていない

## 外部能力DB連携（P12-17a / P12-17b）

外部`lMfDB`は能力DBの正本ではなく、新規候補を発見する参考フィードとして扱う。
P12-17aで読取専用監査を実装し、P12-17bで将来の手動登録設計を確定した。
詳細の正は`docs/lmfdb-integration.md`とする。

確定事項:

- ローカル`abilityId`は外部IDと無関係な`ab-`単調増加番号をScriptLock下で採番する
- 既存1,079件の`legacyId`は維持し、新規能力は`legacyId: null`とする。能力JSONは将来schemaVersion 2へ上げる
- 外部参照履歴は公開3DBへ混ぜず、内部専用`ability_external_refs`シートへ保存する
- 同一候補は`provider + externalNumericId + externalFingerprint`から作るcandidateKeyで識別する。
  外部数値IDが再利用されても別fingerprintの履歴を別に保持する
- 新規登録は`api_asstCreateAbilityFromExternalCandidate()`だけが行い、既存能力を更新する分岐を持たない
- クライアントはID、sortOrder、status、監査情報を指定できない。サーバーが固定SHAの外部原文を再取得して検証する
- 初期statusは常にdraft。resolvedは管理者がカードを確認した場合だけ、unlinkedはcardId/sortOrderをnullで登録できる。
  ambiguousは外部候補の新規登録には使わない
- 能力側の新規許可値はsource=`イベント / 閃き / EXトレ / 伝授`、
  rarity=`MR / SSR / SR / その他`。カードDBのrarity許可値とは分離する
- 比較用NFKCは重複検査だけに使い、保存値へ反映しない。効果OCR用の正規化も流用しない
- 外部候補取得は読取専用。保存時だけScriptLockを取り、能力1行と参照履歴1行を追加する。
  自動公開・時間トリガー・外部更新トリガーは作らない
- 公開生成はresolvedに加えてverifiedを要求し、draft能力をページ本文とindexゲートへ含めない
- 汎用削除UIは作らない。誤登録はabilityIdとfingerprintで追加行だけを特定し、
  管理者手順でrevertedとして履歴を残す

### カード内の能力並び替え（2026-09-02）

`api_asstSaveAbility`は1行だけ保存する一方、保存前に全体検査（カード内のresolved能力の
`sortOrder`が1..Nの連番）を通すため、単発の書き換えでは重複か欠番が必ず出て
「能力sortOrder不連続」で落ちる。順序の入れ替えは専用APIで行う。

- `api_asstReorderCardAbilities({cardId, abilityIds, expected})`。payloadはこの3キーだけを受け付ける
- `abilityIds`は並べ替え後の順で、そのカードのresolved能力**全件**。過不足・重複・他カードのIDは拒否する
- `expected`は画面が見ていた`{abilityId, sortOrder}`の一覧。現在のシートと1件でも違えば
  「他の編集で並び順が変わっています」で拒否する（同時編集検知）
- `sortOrder`はサーバーが1から振り直す。クライアントは番号を指定しない
- 書込み前に`asstValidateDocuments_`で全体検査を通す。途中状態を永続化しない
- 複数行を書くため、失敗時は書いた行を逆順で元へ戻す。復旧にも失敗した場合は
  重大エラーとして止め、`assist_log`へFAILを残す
- 画面はカード編集の「能力」タブに↑↓と「並び順を保存」を置く。保存前の並びはメモリだけに持つ

検査は`scripts/test-asst-ability-reorder-api.js`（9ケース）と、
`scripts/verify-assist-cms.js`のソース境界検査で担保する。

段階4は、スキーマ検査、読取API、一覧、詳細プレビュー、test追加API、破壊テスト、
本番移行の7タスクに分割する。一度にGAS画面・保存・本番反映を実装しない。

段階4で既存CMSへ必要になる主な変更:

- `abilities`のlegacyId行変換・検証・exportをnullableへ対応させる
- abilitiesのsource / rarity許可値を能力専用定数として拡張する
- `ability_external_refs`のシート定義、検査、バックアップ手順を追加する
- 現行`api_asstPublish()`もカード・効果・能力保存と同じScriptLockを使うようにする
- `build-assist-pages.js`と検査を`linkStatus: resolved && status: verified`へ合わせる
- P12-17aの監査処理はnull legacyIdを外部ID照合・外部欠落観測から除外する

P12-17bでは上記を実装していない。3DB、GAS、シート、Workflow、生成ページ、公開経路、
本番データは変更していない。

## P12-19 新規カード登録UI・追加専用API

統合CMSのカード一覧へ「＋ 新規カード」を追加し、`api_asstCreateCard(payload)`が`cards`末尾へ
draft相当の行を1件だけ追加する。cardIdは自動採番せず、管理者入力をtrimしたうえで
`^[a-z][a-z0-9]*-(MR|SSR)-[a-z0-9]+$`と64文字上限を検査する。既存91件の実測最大は24文字。
cardId内のrarity一致、既存cardId重複、同一name+rarity、許可外属性、nickname空欄、
sourceOrder不正・重複をサーバー側で拒否する。

保存は共通ScriptLock取得後に`cards`を再読込し、`sourceOrder = 最大値 + 1`を決める。
`ASST_HEADERS[ASST_SHEET_CARDS]`の列順で1行だけappendし、cardId一意、sourceOrder、全保存値を
再読込検算してから`create-card`ログを残す。行追加開始後の検算・ログ失敗は再実行禁止の専用エラーにし、
曖昧な自動削除・並べ替え・`asstRewriteSheet_()`による全体書換えは行わない。

初期値は画像・イベント2・実装日・解説を空欄、accessoryStatusをunknown、stats/formationsを空配列、
limitBreak/ratings/sapoRefをnull、versionを1、updatedAtを`nowIso_()`、updatedByをnicknameとする。
UIはbootstrap成功まで登録ボタンを無効化し、ローカルプレビューでは登録不可を明示する。
成功後は一覧と件数へ反映し、既存カード編集画面を開いて画像・必要項目の追加を案内する。

repo内のNode mockテストは成功・全拒否・lock競合・lock後競合・追加後検算失敗・ログ失敗を検査する。
本番GAS、Sheet、Drive、deploymentは変更していない。管理者が`_cms/gas/README.md`の手順で
`20_assist.gs`と`ui_assist.html`を反映し、実運用の新規1件で再読込まで確認した。画像を含む
初回保存・公開経路はP12-20へ分離した。

## P12-20 新規カード画像の初回保存・公開経路

`aab-MR-julia`の新規登録後、`aab-MR-julia.jpg`は指定Driveへ正常に保存されたが、mainには
未公開だった。`api_asstSaveCard()`は画像がmainに存在することを必須としていたためHTTP 404で停止し、
`api_asstPublish()`もDrive画像をGitHub treeへ追加する前に同じmain存在検査を行う循環が判明した。

修正後は、カード保存・export・公開で次の境界を共有する。

- 画像パスは従来どおり`assist-cards/<cardId>.<jpg|jpeg|png|webp>`だけを許可する
- 指定Driveに同名の検査済み画像があれば、main未公開の新規画像として受理する
- Driveにない既存画像はmainのHTTP 200 / 206を確認する
- mainとDriveの両方にない画像、2MB超過、画像実体不一致、同名重複、規則外ファイルは停止する
- 公開時は検査に使ったDrive画像のbytesを同じ処理内でGitHub treeへ追加する
- Drive画像があるカードだけmainの事前HTTP検査から外し、既存main画像は従来の検査を維持する
- 旧`cards/cards-data.js`の91 IDは互換subsetとして保持し、3DBのCMS追加IDを許可する
- `assist.html`は既存順を維持して3DBから再生成し、新規カードを末尾へ追加する

repo内では新規Drive画像、main fallback、Drive未設定、両方欠落、実体不一致、同名重複、
一括検査、規則外ファイルの8ケース、一覧生成5ケースと、検査を壊したコピーを追加した。
本番GAS、Sheet、Drive、deployment、GitHub公開は変更していない。管理者手順は
`docs/assist-card-create-runbook.md`第6章を正とする。

2026-08-31、管理者が本番GASで`aab-MR-julia`を再登録・画像再アップロードせず保存し、
main未公開画像を指定Driveから受理できることを実機確認した。GitHub公開と生成ページ確認は
P12-20のPRマージ後に残す。

## 10. 現在の保留・外部確認待ち

| 項目 | 状態 | 再開条件 |
|---|---|---|
| P10-2 人工的な通し稽古 | 保留 | 実更新で運用確認できているため、問題発生時だけ再開 |
| P11-7 CMS保護PR経路test | 保留 | GitHub外部設定を変更できる管理主体が用意される |
| P11-8 token/App最小権限化 | 保留 | P11-7の実機証跡が揃う |
| P11-9 main Ruleset | 保留 | P11-7〜8完了後。先に有効化しない |
| AdSense再申請 | 保留 | 管理者が更新利用規約を確認・同意し、再申請時期を承認する |
| GASエディタ版とdeployment版の一致 | P12-9 test確認済み | deployment v12へブリーダー依存判定とOCR UI改善を反映。保存用一時関数は残していない |
| Firestore能力画像割当の現在値 | 未確認 | P12-3で`cardAbilities/assignments`を読取exportする |
| OCR方式 | Google Cloud Visionでtest中 | Vision限定APIキー、GAS日次上限、予算アラートを設定し、実画像精度とレビュー工程を継続確認する |
| SAPO_DATA から凸データを移送する対応 | P12-4で人手確認 | 56/91件が対応可能。残り35件は元データが無い。同名別レアリティの候補3件は未確定 |
| 2つの公開Workflowの直列化 | P12-10で設定 | concurrency group とsitemap全再生成 |
| 検索用公開JSONの項目確定 | P12-12着手前 | verified のみ・内部項目を含めない |

## 11. P12-3でClaudeへ引き継ぐ内容

次はP12-3だけを行う。

- 最新mainから`chore/p12-3-assist-data-audit`を作る
- 休止中ファイルと100KB超を直接読まず、Nodeスクリプトで監査する
- Firestoreは読取exportだけを行い、rules、document、公開HTMLを変更しない
- `cardId`を正として、現行91カード、効果83カード、能力1,079件、画像割当を照合する
- 自動確定、候補、未解決を分離し、未解決を推測で埋めない
- P12-4〜6が独立して変換できる監査結果と入力hashを残す

P12-3の詳細な開始文は`docs/claude-next-session.md`を使う。

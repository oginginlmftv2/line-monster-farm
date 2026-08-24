# アシストカードDB・静的ページ・CMS 設計進捗

最終更新: 2026-08-24

状態: **P12-8完了。P12-8bの構造化フォーム化を実装中**

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
  ├ capture_queue
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
シートを追加する形で持つ（`cards` / `assist_effects` / `abilities` / `capture_queue`）。
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

## 10. 現在の保留・外部確認待ち

| 項目 | 状態 | 再開条件 |
|---|---|---|
| P10-2 人工的な通し稽古 | 保留 | 実更新で運用確認できているため、問題発生時だけ再開 |
| P11-7 CMS保護PR経路test | 保留 | GitHub外部設定を変更できる管理主体が用意される |
| P11-8 token/App最小権限化 | 保留 | P11-7の実機証跡が揃う |
| P11-9 main Ruleset | 保留 | P11-7〜8完了後。先に有効化しない |
| AdSense再申請 | 保留 | 管理者が更新利用規約を確認・同意し、再申請時期を承認する |
| GASエディタ版とdeployment版の一致 | 未確認 | Apps Script画面で履歴とdeployment版を読み取り確認する |
| Firestore能力画像割当の現在値 | 未確認 | P12-3で`cardAbilities/assignments`を読取exportする |
| OCR方式 | 未決定 | P12-9着手前に費用、規約、精度、秘密管理を比較し承認する |
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

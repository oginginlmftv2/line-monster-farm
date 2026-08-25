# 進捗

最終更新: 2026-08-26

状態: `未着手` / `進行中` / `レビュー待ち` / `完了` / `保留`

> 完了にするのは進捗管理チャットの判断。開発ツールの自己申告では完了にしない。
> 全体計画と完了条件は`docs/ライ徹_開発計画.md`を参照。

## 現在地

| ID | 作業 | ブランチ | 状態 | 本番影響 | 備考 |
|---|---|---|---|---|---|
| P10-1 | 管理者の開発準備、文書同期、次回Claudeへの引き継ぎ | `chore/p10-1-admin-readiness` / `chore/p10-1-claude-handoff` | **保留** | ⚪ | 主要整備とPR経路確認済み。問題発生時だけ再開 |
| P10-2 | 非公開影響の人工的な通し稽古 | – | **保留** | ⚪ | 実更新が無いため省略。後続の実作業で確認する |
| P11-1 | CMS・セキュリティの現状監査と実施計画 | `chore/p11-1-cms-security-audit` | **完了** | ⚪ | PR #24をmainへマージ（`449a7b2`）。外部確認待ちは未完了のまま分離 |
| P11-2 | GASソースの正とC10検査対象の復旧 | `chore/p11-2-gas-source-control` | **完了** | ⚪ | PR #25をmainへマージ（`bfeb42d`）。GAS同期・deployは未実施 |
| P11-3 | 配列lockのappend検証と再生成 | `chore/p11-3-repo-guard-lock` | **完了** | ⚪ | PR #26をmainへマージ（`f864d76`）。351体lockへ更新 |
| P11-4 | CMS元コミット・生成差分ゲート | `fix/p11-4-cms-publish-gates` | **完了** | 🟡🔴 | PR #27をmainへマージ（`4fd3282`）。次回の実CMS公開確認は運用時に行う |
| P11-5 | Firestore実rules確認 | – | **完了** | ⚪ | 公開版rulesと公開日時を実画面で確認。保存・公開なし |
| P11-6 | 公開クライアントの共有パスワード撤去 | `fix/p11-6-remove-client-password` | **完了** | 🔴 | PR #28をmainへマージ（`6dfb403`）。共有文字列・write UI 0件 |
| P11-7 | 保護対応CMS PR経路のtest | `feat/p11-7-cms-protected-pr` | **保留** | ⚪ | 外部設定を実施できるGitHub管理権限がないため保留。test Workflow実装済み |
| P11-8以降 | token最小権限化とmain Ruleset | P11-1で提示 | **保留** | 🟡🔴 | P11-7の実機証跡が揃うまで開始しない |
| P12-1 | リセマラ記事刷新 | `content/p12-1-reroll-refresh` | **完了** | 🔴 | PR #30をmainへマージ（`958ffd2`）。Pages公開成功 |
| P12-2 | アシストカードDB・静的ページ・CMS設計 | `chore/p12-2-assist-cms-design` | **完了** | ⚪ | mainへマージ（`37be17e`）。PRを介さないローカルマージ。設計のみで公開物は無変更 |
| P12-3 | アシストカードデータ監査 | `chore/p12-3-assist-data-audit` | **完了** | ⚪ | PR #32をmainへマージ（`c760910`）。監査値は独立検算で全項目一致 |
| P12-3b | 能力画像割当のリポジトリ化 | `chore/p12-3b-ability-assignments` | **完了** | ⚪ | PR #33をmainへマージ（`a40f13e`）。Firestoreの一次資料を正データ化 |
| P12-4 | カードDB正規化 | `chore/p12-4-assist-card-db` | **完了** | ⚪ | PR #34をmainへマージ（`f4bfc24`）。現行91カードをcardId基準で統合 |
| P12-5 | 効果DB正規化 | `chore/p12-5-assist-effects-db` | **完了** | ⚪ | PR #35をmainへマージ（`aa83102`）。83カード888効果を損失なく変換 |
| P12-6 | 能力DB正規化 | `chore/p12-6-assist-abilities-db` | **完了** | ⚪ | PR #36をmainへマージ（`181f245`）。1,079能力をcardId基準へ正規化 |
| P12-7 | 静的カード詳細生成 | `feat/p12-7-assist-pages` | **完了** | 🔴 | PR #37をmainへマージ（`9afc20d`）。91件を全件noindexで生成し実物確認済み |
| P12-7b | カード詳細の公開導線切替 | `feat/p12-7b-assist-links` | **完了** | 🔴 | PR #38をmainへマージ（`1883098`）。54件をindex、37件をnoindexとし公開導線を切替 |
| P12-7c | 旧カード共通ページのnoindex化 | `fix/p12-7c-card-html-noindex` | **完了** | 🔴 | PR #43をmainへマージ（`79aa481`） |
| P12-8 | アシストCMS基盤 | `feat/p12-8-assist-cms` | **完了** | ⚪ | PR #39をmainへマージ（`91f7ab7`）。独立test GAS/Sheetで編集・競合拒否・export一致を実機確認 |
| P12-8b | CMS構造化フォーム | `feat/p12-8b-assist-forms` | **完了** | 🟡🔴 | PR #41をmainへマージ（`e4b6408`）。schema v3、生成ページ、test deployment v6を反映 |
| P12-9 | アシスト効果OCR・レビュー | `feat/p12-9-assist-ocr` | **完了** | ⚪ | PR #42をmainへマージ（`02a4b5e`）。Vision OCR・原画像レビュー・カード画像Drive uploadをtest deployment v20で実機確認 |
| P11-10 | GitHub権限の前提を確定 | `docs/p11-10-permission-baseline` | **完了** | ⚪ | PR #44をmainへマージ（`bfab2f8`）。個人リポジトリでadmin付与不可を確定し、計画からadmin依存を外した |
| P12-10 | CMS統合の設計 | `chore/p12-10-cms-integration-design` | **完了** | ⚪ | PR #45をmainへマージ（`ab765ea`）。`docs/cms-integration-design.md` にA〜Jの結論を記載 |
| P12-11 | CMS統合の実装（段階1〜3・段階2b） | `chore/p12-11-s1-cms-token-scan` / `chore/p12-11-s2-cms-unified-source` / `fix/p12-11-s2b-assist-publish-scope` / `chore/p12-11-s3-assist-db-from-cms` | **進行中** | ⚪🔴 | 段階1はPR #46（`07fa6c3`）、段階2はPR #47（`139b75b`）、段階3はPR #48（`4330026`）で完了。段階2b（公開範囲と件名の是正）を進行中 |

## 最新mainの監査値

調査基準: `origin/main`の`e4b6408`（P12-8bマージ済み。モンスター側の監査値は不変）

| 項目 | 値 | 根拠 |
|---|---:|---|
| モンスター | 351体 | `src/data/monster-ids.json`をNodeで集計 |
| CMS予測ID | 351体 | `src/data/cms-id-predictions.json` |
| ID検算 | PASS 351体 | `node scripts/verify-cms-ids.js` |
| 生成詳細ページ | 351件 | ID一覧のURL実在をNodeで照合 |
| index / noindex | 52 / 299 | 生成HTMLのrobots metaをNodeで集計 |
| モン類ページ | 6件 | `monsters/<monSlug>/index.html` |
| カード詳細ページ | 91件 | `src/data/assist-cards.json`のcardIdと生成HTMLを照合 |
| カード index / noindex | 54 / 37 | 可視本文800字以上かつ解説50字以上を3DBから再計算 |
| sitemap | 135URL | `<loc>`を集計。手書き23 + モンスター生成58 + カード生成54 |
| 公開方式 | main直接配信 | `AGENTS.md`、`CLAUDE.md`、CMS Workflow |

件数はCMS公開で変わるため、次回も固定値を信じずスクリプトで集計する。

## 完了実績

### 保全・基盤・生成

- Firestoreのバックアップ取得と書き込み全面禁止
- `AGENTS.md`、関連docs、`scripts/verify.js`、Actions検証の整備
- 4桁モンスターID、モン類・血統slug、ID衝突検査
- Firestoreの解説・編成・画像割当のID基準データ化
- robots / sitemap / noindex / canonicalの整理
- `build.js`、全モンスター詳細、6モン類、静的一覧、旧URL誘導、sitemap自動生成
- スマートフォン表示を含むモンスター詳細・モン類・管理画面の最適化実績

旧件数と当初P0〜P9の対応は`docs/ライ徹_開発計画.md`第6章へ移した。

### アシストカードCMS P12-8〜P12-9

- 独立test環境でカード・効果・能力の編集、競合拒否、export一致、構造化フォームを確認した
- Vision OCRと原画像レビューを実装し、候補をブラウザ内だけに保持して手動確認後に編集へ反映する
- カード画像のDriveアップロードを追加し、test deployment v20で実機確認した
- P12-9はPR #42をmainへマージ（`02a4b5e`）して完了した

### GAS版ライ徹CMS C1〜C10

| 実績 | 状態 | 根拠・備考 |
|---|---|---|
| C1〜C6 GAS管理画面、編集・画像・公開操作、スマホ最適化 | **完了・運用中** | `_cms/gas`にエディタ版の読取export基準を配置。deployment一致は未確認 |
| C7 CMS公開Workflow | **完了** | `cms/publish`からbuild・verify後にmainへpush |
| C8 ID検算 | **完了** | 名前・4桁ID・arrayIndexを全件照合 |
| C9 運用ルール | **完了** | `AGENTS.md`と`CLAUDE.md`へ反映 |
| C10 GitHubトークン検出 | **完了** | `scripts/verify.js`が`_cms/gas`の必須2ファイルを検査。欠落はFAIL |
| CMS公開の実運用 | **稼働中** | 2026-08-20〜21に複数回成功。最新はsource `2a9a9a4` → main `a45ce13` |

現在の公開フロー:

```text
GAS → cms/publish → generate-ids.js → verify-cms-ids.js
    → build.js → verify.js → 生成差分範囲確認 → main → 即公開
```

途中で失敗した場合はmainを更新しない。通常ページのPRとCMS公開はどちらも、開始前に
最新mainを取り込むことが前提。

## 当初計画からの変更

| 旧案・旧状態 | 現在 |
|---|---|
| 348体、index 49〜50件などの固定件数 | CMSで増減するため動的集計。現在351体、index 52件 |
| 詳細ページをゲート通過分だけ生成 | 全件生成し、800字未満を`noindex,follow` |
| 332画像を`img/monster/`へ一括リネーム | GAS→Drive→`monster/<4桁ID>.<拡張子>`で管理 |
| Actionsから`gh-pages`へ配信 | 未実施。GitHub Pagesはmain直接配信 |
| Cloudflare Access＋Worker CMS | 廃止。GAS版ライ徹CMS C1〜C10へ置換 |
| mainのブランチ保護をすぐ有効化 | CMSがmainへ直接pushするため、迂回確認まで実施しない |

## P11-1監査結果

確認できた事実:

- GitHub Pagesは`main`の`/`を直接配信するlegacy buildで、状態は`built`
- `main`のBranch protectionは0件、Repository Rulesetも0件
- `CMS_PUBLISH_TOKEN`というRepository secretが1件ある。値は取得・表示していない
- 最新のCMS run `32488717539`は`oginginlmftv2`による`cms/publish` pushで起動し、全step成功
- Workflowは親main一致、ID生成・検算、build、verify、生成後差分を通してからmainへpushする
- Workflowの生成後差分検査は、GAS元コミット`HEAD^..HEAD`の変更範囲を検査していない
- 配列lockの先頭348体hashは現在も一致し、現在351体との差は末尾3体
- 平文クライアントパスワードは既知7ファイル。静的HTMLのため認証として機能しない
- Apps Scriptに管理者本人所有の「ライ徹CMS」があり、`コード.gs`と`index.html`を管理する
- GAS側はrepoの`cms/gas/コード.gs`を正と宣言するが、最新repoに`cms/gas`は無い
- GAS 2ファイルの手動画面検索では既知GitHub token接頭辞と`EDIT_PASSWORD`は0件
- `node scripts/verify.js`はPASS 19 / FAIL 0 / WARN 2 / SKIP 1。既知WARN 2件以外の増加なし

## P11-2実施結果

確認できた事実:

- Apps Script「ライ徹CMS」のエディタ上の`コード.gs`と`index.html`を、保存・実行・deployせず
  読み取りexportし、`_cms/gas`へ完全一致で配置した
- `コード.gs`: 60,120 bytes / 1,624行 /
  SHA-256 `989cef32df21c49065d6c177bc360b80bf6f8b2a40642785df71c2095ccf2996`
- `index.html`: 40,836 bytes / 963行 /
  SHA-256 `43619119a9eb20f39b95c698a6bfc950502241b93c114659e50f89eeec5b24c2`
- `_cms`は標準Jekyllの公開対象外となる先頭`_`のディレクトリとし、`.nojekyll`もJekyllの
  `include`設定も無い。公開HTMLとPages設定は変更していない
- `scripts/verify.js`は`_cms/gas`と必須2ファイルを検査する。欠落はFAIL、既知GitHub token形式0件はPASS
- exportした2ファイルの`EDIT_PASSWORD`代入は0件。秘密値は取得・表示・記録していない
- `node scripts/verify.js`はPASS 21 / FAIL 0 / WARN 2 / SKIP 0。WARNは既知2件だけ

未確認・未変更:

- 稼働中deployment版とエディタ版が同一かは未確認。`_cms/gas`はエディタ版の開発・監査用の正であり、
  deploymentを更新したとは扱わない
- GASの保存・同期・deploy、Script Properties、GitHub・Firestore設定は変更していない
- `コード.gs`先頭の旧予定パス`cms/gas/コード.gs`は完全一致のため残した。
  repoとGASを同時に直せる別承認の同期タスクまで変更しない

## P11-3実施結果

- 旧lockの348体hash `4036c84b2ffff6a7`と、現在351体の先頭348体hashが完全一致した
- 差分は末尾の「モチビー」「ヤオビクニ」「エコスライム」3体だけで、既存順の変更は無かった
- `scripts/verify.js`は、件数増加だけではWARNにせず、旧lock件数分のprefix hash一致を確認する。
  prefix不一致、削除、並べ替えはFAILする
- `node scripts/verify.js --lock`で手編集せず351体lockを生成した。
  新hashは`5887530fe7c0d79f`、lock日は2026-08-22
- `node scripts/verify.js`はPASS 22 / FAIL 0 / WARN 1 / SKIP 0。
  残るWARNは既知の平文パスワード7件だけ
- 公開HTML、CMS管理データ、GAS・GitHub・Firestore設定は変更していない

## P11-4実施結果

- 過去10回の実GAS元コミットと現在のGASソースから、正規入力allowlistを確定した
- build前に単一親、最新main親、GAS件名、入力範囲、画像形式をtrusted main版スクリプトで検査する
- build後の生成差分は別modeで検査し、mainへのpush成功後だけ完了summaryを記録する
- 合成10ケースと過去10回の実GAS元コミットはすべて期待どおりPASSまたは拒否、YAML構文もPASSした
- PR #27のGitHub Actions成功後にmainへマージし、作業ブランチを削除した
- マージ後最初の実CMS公開は未確認。次回の通常運用時にゲート通過を確認する
- GAS、token、main、`cms/publish`、公開物、外部設定は変更していない

## P11-5実施結果

- Firebase Consoleの`line-monster-farm` → `Firestore` → `ルール`を読み取り確認した
- 現在選択中の公開版（★）は画面表示で2026年8月18日 19:05
- `match /{document=**}`に対し、`allow read: if true;`、`allow write: if false;`
  であり、全pathのcreate・update・deleteは拒否される
- rulesの編集・保存・公開、Firestoreデータ、リポジトリは変更していない

## P11-6実施結果

- 既知7 HTMLから`EDIT_PASSWORD`、パスワード入力・prompt、Firestoreのwrite・delete処理、
  編集・削除UIを撤去した
- 管理専用5ページはURLを維持した停止案内とし、カード詳細と旧モンスター詳細は
  Firestoreの評価・解説・編成・既存コメントのread表示を維持した
- `scripts/verify.js`は平文パスワードを既知WARNではなくFAILにし、既知7ファイルの
  クライアント認証・write API・書込削除UIが0件であることを継続検査する
- Firestore rules・データ、GAS、CMS管理データ、自動生成物、GitHub設定は変更していない
- `node scripts/verify.js`はPASS 24 / FAIL 0 / WARN 0 / SKIP 0

確認できなかった外部状態:

- GitHub Actionsの既定Workflow permissionsとPR作成許可check。監査アカウントは`WRITE`で設定を閲覧できない
- PATの値、種類、所有者、期限、実権限、GASとActionsで同一tokenを使っているか
- GASのエディタ版と現在のdeployment版の一致、export・復旧手段

詳細な根拠、危険性、本番影響、依存関係、復旧方法、完了条件とP11-2〜9は
`docs/ライ徹_開発計画.md`のP11-1監査結果を正とする。

## 現在の作業

P12-11 段階2b「アシスト公開範囲と件名の是正」を行う。

- ブランチ: `fix/p12-11-s2b-assist-publish-scope`
- 本番影響: ⚪。リポジトリ内のテキストだけを変更し、GASへの同期・保存・deployは行わない
- `api_asstPublish()` が、3DBに加えてDriveに存在しカードDBから参照される画像だけを送るよう是正する
- コミット件名を設計F-3の `CMS assist publish <JST日時>` に合わせる
- 段階4には着手しない

事前調査の前提を実物で検証し、次の食い違いを設計書 第0章へ記録した。

- 関数名11個の衝突に加え、**グローバル`var`も4個衝突する。**
  `HEADERS`は同名キー`members`/`publish_log`で列定義が違い、単純結合で列ずれを起こす
- アシスト側のタブは**トップレベルではなくカード編集画面の中のサブタブ**である。
  トップレベルは両者とも同じ2ペイン構造
- Script Propertiesは7キーではなく8キー。`OCR_DAILY_USAGE`はGAS自身が書く日次カウンタ
- CMS検査は`verify.js`の2か所にある。token走査は`_cms/gas`にしか掛かっておらず、
  `_cms/assist-gas`は走査されていない。また`verify-assist-cms.js`の`forbiddenSource`は
  統合すると必ずFAILする
- **`cms/assist-publish`は存在しない。** Workflow・許可リスト・GAS送信処理のいずれも無く、
  アシストの`api_export`はJSONをブラウザへ返すだけ。「出し分け」ではなく新規作成である

### 管理者の決定による改訂（初版から変更した点）

1. **testシートの実データを本番bookへ持ち込む。**
   初版のB-5「mainの3DBから入れ直す」は誤りだった。mainの3DBには
   `accessoryStatus` unknown 49件、`stats`未入力35件、`releasedAt` null 35件、
   `event2` null 23件の空欄が残っており、`cms/assist-publish`が無いため
   **CMSで入力した内容は一度もmainへ届いていない。**
   取り込みは**export → mainへPR → 本番bookへ取込**とし、シートの直接コピーは採らない
2. **常設のtest環境を作らない。**
   `ENVIRONMENT`を`production`/`rehearsal`の2値へ再定義し、移行時と大改修時だけ
   **本番bookのコピー**でリハーサルする方式に変えた。旧設計の合成test bookと違い、
   本番の`monsters` 351行が入った状態で確認できるため忠実度は上がる
3. **列の棚卸しを行った。**
   アシスト3シートの全46列を分類し、**削除1列 / 保留6列 / 必須39列**とした

### 設計の欠陥1件を自己修正

初版C-2は環境マーカーを`book.getSheets()[0]`から読む設計だった。
**シート順に依存するため、アシスト5シートを足す運用と両立しない。**
マーカーの置き場所を`members`シートのA1へ移した。

### 実物確認で判明した落とし穴（設計書へ記録済み）

- `validateImagePath_`は**main上の画像実在**を見る。同じ拡張子で再アップロードした画像は
  検査を素通りして**バイト列がtest Driveに取り残され**、拡張子が変わると`api_export()`が
  停止する。移行前にtest Driveと`assist-cards/`91件を突き合わせる手順を入れた
- `buildDocuments_`は`generatedFrom`を`['P12-8 test assist CMS']`へ固定し、
  **`verify.js`も`verify-assist-cms.js`もこの項目を検査していない。**
  exportで現在の4項目の由来リストが消える。想定内として扱い、検査項目を追加する
- `assist_effects`の`cardStatus`は`api_saveEffects`が
  `effects.length ? 'verified' : 'draft'`をliteralで書いているだけの導出値で、
  カード1枚の値を効果行すべてに重複して持つ。編集UIも無い。
  **`ASST_HEADERS`から外して導出すればexportされるJSONは1バイトも変わらない**

## 次の作業

P12-11 を `docs/cms-integration-design.md` I-1 の段階ごとに進める。
**1段階ごとに push → PR → マージまで行い、そこで止まる。複数段階を1つのPRにまとめない。**

- 段階1: **完了** — 検査の先行強化（⚪）`chore/p12-11-s1-cms-token-scan`、PR #46 / `07fa6c3`
- 段階2: **完了** — 統合ソースの作成（⚪）`chore/p12-11-s2-cms-unified-source`、PR #47 / `139b75b`
- 段階2b: **進行中** — 公開範囲と件名の是正（⚪）`fix/p12-11-s2b-assist-publish-scope`
- 段階3: **完了** — testCMSの3DBをmainへ反映（🔴）`chore/p12-11-s3-assist-db-from-cms`、PR #48 / `4330026`
- 段階4: 段階2bのマージ後に着手する。**管理者の次の明示指示なしに着手しない**

## 明示的な保留

- P11-7: **実施不可。** test Ruleset・Workflow permissions の変更に admin 権限が必要だが、
  個人アカウントのリポジトリでは admin をコラボレーターへ付与できない。
  test Workflow（`.github/workflows/cms-protected-test.yml`）は実装済みのまま残す
- P11-8: **後回し。** token最小権限化は Secrets を編集できるため実施可能だが、
  CMS統合でtokenが1本になるため、統合後に1回で行う（P12-12へ吸収）
- P11-9: **不要。** main の Ruleset を有効化すると、mainへ直接pushするCMSの公開経路が止まる。
  公開ゲートは `scripts/verify-cms-source.js` としてWorkflow内に実装済みで、
  ブランチ保護が無くても機能する（破壊37ケースの拒否を確認済み）
- **アシスト3DBの保留6列の削除: P12-13以降。**
  `limitBreakJson`・`sapoRefJson`・`legacyId`・`rarity`(能力)・`flagsJson`・`status`(能力)は
  公開ページに描画されないが、うち3列は`verify.js`のPASSを支えている。
  移行のついでに消さない。解除条件は`docs/cms-integration-design.md` B-6を正とする
- **常設のtest環境: 作らない（決定）。**
  移行時と大改修時に本番bookのコピーでリハーサルする（設計書 B-1・I-4）。
  旧assist test スプレッドシートとGASプロジェクトは、段階3のPRがmainへ入った後に捨てる
- P10-2: 人工的な文書1行テスト。実作業で運用確認できているため保留
- AdSense再申請: Search Consoleのインデックス反映待ち。
  更新利用規約への管理者同意も必要。Claudeは同意操作をしない
- GASエディタ版とdeployment版の一致: 外部画面未確認

## 現在の引き継ぎ

アシストカードの3DB（カード91件 / 効果888件 / 能力1,079件）と静的詳細91件は公開済みで、
うち54件がインデックス対象。CMSはP12-8〜P12-9でtest環境に構築し、
編集・OCR・レビュー・カード画像のDriveアップロードまで実機確認を終えている。

次はCMS統合である。モンスターCMSとアシストCMSを1つのApps Scriptプロジェクト・
1つのWebアプリへ統合し、タブ切り替えで両方を扱えるようにする。
**ただし公開ブランチと許可リストは分けたまま維持する。**
方針は `docs/cms-integration-plan.md`、具体設計は `docs/cms-integration-design.md` を正とする。

P11-7〜9 は決着済み（実施不可 / P12-12へ吸収 / 不要）。
統合後はtokenが1本になるため、先にアシスト用tokenを発行しない。

**testCMSで入力した内容はまだ公開へ届いていない。**
`cms/assist-publish` が存在しないため、P12-8以降に入力したカード・効果・能力は
test スプレッドシートにしか無い。設計書 第I章の段階3（export → PR）で運ぶ。
この作業は統合の完成を待たずに単独で実施でき、
実施すればカードのindex件数が増える見込みである（AdSense再申請に効く）。

## 管理者確認待ち

> GitHub の admin 権限を要する確認項目は、権限が得られないことが確定したため削除した。
> 経緯は `docs/cms-integration-plan.md` の「GitHub権限の前提」を正とする。

- Apps Script「ライ徹CMS」の`プロジェクト履歴`と`デプロイを管理`で、現在のdeployment版と
  エディタ版、復旧可能な直前版を確認する。保存・再デプロイしない
- GAS Script Propertiesの`GITHUB_TOKEN`とGitHub secret `CMS_PUBLISH_TOKEN`が同じtokenか、
  値を比較・共有せず、token名・作成者の台帳で確認する
- AdSense管理画面で更新利用規約の同意待ち状態を確認する。Claudeは同意・再申請しない
- P12-3でFirebase Consoleの`Firestore Database` → `データ`を読み取り、`cards`、
  `cardAbilities/assignments`、存在する場合だけ`assistEffects`をexportする。document、rulesは保存しない

## 既知の検証WARN

- `repo-guard.lock.json`は351体へ正規再生成済み。今後の追加は旧prefix一致時だけWARN、
  並べ替え・削除・途中挿入はFAILする
- P11-6ブランチでは平文パスワード0件、既知7ファイルのクライアント認証・write API・
  書込削除UI0件を検査し、既知WARNを解消した
- GASトークン検査は`_cms/gas`の必須2ファイルへ復旧済み。欠落はFAIL、既知token形式0件はPASSする

## 差し戻し履歴

| 日付 | タスクID | 内容 | 対応 |
|---|---|---|---|
| 2026-08-26 | P12-11 段階2b | 段階2の成果物が設計F-1/F-3と食い違い、段階4の検査6を書く段階で判明。段階2では検査6を段階4へ繰り延べたため、不一致が未検査のまま通過した | 段階4より先に、`api_asstPublish()` の画像送信範囲と件名を設計へ合わせる |

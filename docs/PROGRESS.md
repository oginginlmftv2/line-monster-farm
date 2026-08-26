# 進捗

最終更新: 2026-08-27

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
| P12-11 | CMS統合の実装（段階1〜6） | `chore/p12-11-s1-cms-token-scan` / `chore/p12-11-s2-cms-unified-source` / `fix/p12-11-s2b-assist-publish-scope` / `chore/p12-11-s3-assist-db-from-cms` / `feat/p12-11-s4-assist-publish-path` / `docs/p12-11-s4b-route-verified` / `fix/p12-11-s5b-shell-defects` / `fix/p12-11-s5c-shell-layout` / `fix/p12-11-s5d-user-feedback` / `docs/p12-11-s5-rehearsal-verified` / `docs/p12-11-s6-production-cohabitation` | **完了** | ⚪🔴🟡 | 段階1〜6を完了。次は段階7（本番deployment切替 + token1本化）待ち |

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

P12-11 段階5（本番bookのコピーでのリハーサル）は、管理者が12項目をすべて実施して完了した。
現在は**段階6待ち（管理者のGAS操作）**である。

- 段階5では統合によって生まれた不具合6件を検出し、段階5b・5c・5dで是正した
- 是正後のリハーサルでは12項目すべてが期待どおりとなり、`api_asstExport()`の3DBも由来表記以外はmainとバイト単位で完全一致した
- 段階6以降は管理者の明示承認なしに着手しない

## 次の作業

P12-11 を `docs/cms-integration-design.md` I-1 の段階ごとに進める。
**1段階ごとに push → PR → マージまで行い、そこで止まる。複数段階を1つのPRにまとめない。**

- 段階1: **完了** — 検査の先行強化（⚪）`chore/p12-11-s1-cms-token-scan`、PR #46 / `07fa6c3`
- 段階2: **完了** — 統合ソースの作成（⚪）`chore/p12-11-s2-cms-unified-source`、PR #47 / `139b75b`
- 段階2b: **完了** — 公開範囲と件名の是正（⚪）`fix/p12-11-s2b-assist-publish-scope`、PR #49 / `c25e9bd`
- 段階3: **完了** — testCMSの3DBをmainへ反映（🔴）`chore/p12-11-s3-assist-db-from-cms`、PR #48 / `4330026`
- 段階4: **完了** — アシスト公開経路の実証（🟡）。AはPR #50 / `5c6f4a5`で実装済み、Bは管理者が経路確認5項目を実証済み
- 段階5: **完了** — 本番bookのコピーでのリハーサル12項目をすべて確認。項目1・4は目視確認、項目5は由来表記以外の3DB完全一致を確認（⚪）`docs/p12-11-s5-rehearsal-verified`
- 段階5b: **完了** — タブとパネルのid不一致、setup結果のログ欠落、header配色競合を是正し、再発検査を追加（⚪）PR #52 / `8471e4c`
- 段階5c: **完了** — アシスト用の裸のタグセレクタがシェルへ波及するレイアウト不具合を是正し、再発検査を追加（⚪）PR #53 / `c37c698`
- 段階5d: **完了** — シェル共通通知とOCRのファイル単位の成否処理を追加し、利用者へ失敗理由と部分成功を必ず届ける（⚪）PR #54 / `fd591dd`
- 段階6: **完了** — 本番bookへアシストシートを同居し、旧CMSの保存動作を確認（🟡、管理者のGAS操作）`docs/p12-11-s6-production-cohabitation`。PR番号とマージSHAは管理者が記入する
- 段階7: **次** — 本番deployment切替 + token1本化（🟡🔴）
- 段階7以降: **管理者の明示承認なしに着手しない**

## 明示的な保留

- **アシスト公開前に generatedFrom の期待値を移行対応にする（段階7の前提）:**
  段階7でアシスト公開を実行すると、3DBの generatedFrom が
  `['P12-8 test assist CMS']`から`['ライ徹CMS']`へ変わる。
  `cms-assist-publish.yml`は公開の途中で`scripts/verify.js`を実行するため、
  期待値が古いままだと公開そのものが失敗する。
  期待値の更新は段階7の「後」ではなく「前」に行う。
- **scopes未割り当て時の案内:** scopes が空のメンバーには、タブも説明も無い真っ白な画面が表示される。
  `api_bootstrapShell` の `tabs` が空のとき、権限が未割り当てである旨を示していない。
  運用でメンバーを追加し scopes を入れ忘れると、その人には故障として見える
- **OCR実行前の本日残回数表示:** 現在は利用者へ残回数を示していない。
  `api_asstBootstrap` は `ocr.configured` しか返さないため、何枚まで処理できるかを投入前に知る手段が無い。
  残回数の表示は別タスクで検討する
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
- **GitHub ActionsのNode.js 24移行警告:** `actions/checkout@v4`と`actions/setup-node@v4`が
  Node.js 20を対象としており、runner側でNode.js 24に強制されている旨の警告が出る。
  `cms-publish.yml` / `cms-assist-publish.yml` / `verify.yml`の3つが対象。現時点で動作に影響は
  無いが、v4が停止する前に`@v5`へ更新する必要がある。更新は3ファイル同時に行い、
  モンスター側とアシスト側で版を揃える
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

testCMSの3DBは段階3（PR #48 / `4330026`）でmainへ反映済みである。
段階4AはPR #50 / `5c6f4a5`で実装済み、段階4Bも管理者が経路確認5項目を実証済みである。
段階5は本番bookのコピーで12項目すべてを実証し、統合による不具合6件も
段階5b・5c・5dで是正済みである。次は段階6（本番bookへのアシストシート同居）だが、
管理者のGAS操作待ちである。段階6以降は管理者の明示承認なしに着手しない。

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
| 2026-08-27 | P12-11 段階5d | リハーサル項目7・8で、サーバ側の競合拒否とOCR上限拒否は正しく動いていたが、`show()`の書き込み先が画面外にあり理由が利用者へ届かなかった。段階2の統合時、アシスト側にはシェル共通の通知先が用意されず、OCRも後続1枚の失敗で成功済み結果を破棄していた | シェルに固定通知を追加してドメイン内表示と併用し、OCRは直列のまま1枚ごとに成否を受けて成功分を残す。通知経路は検査15で継続検査する |
| 2026-08-27 | P12-11 段階5c | 段階2のCSS統合で、アシスト側だけを想定した裸のタグセレクタがシェルの同名タグにも効き、モンスタータブのレイアウトが崩れていた。段階5bのタブ不具合と同じ性質の取りこぼしだった | 裸のセレクタをアシストパネル内へ限定し、シェルと重なる裸タグを検査14で継続検査する |
| 2026-08-26 | P12-11 段階5b | 本番bookコピーでの段階5リハーサルにより、タブとパネルのid不一致、setup結果の実行ログ欠落、headerのCSS競合の3件を検出した。特にタブ不一致は、段階2ではidが一致する`publish`タブだけが実装上到達可能で、かつ`rehearsal`では公開タブ自体が表示されないため、画面上で不一致が現れず検証を素通りした | 段階5bで3件を是正し、タブ対応を双方向検査する。是正後のソースをリハーサル環境へ貼り直し、段階5を項目1からやり直す |
| 2026-08-26 | P12-11 段階2b | 段階2の成果物が設計F-1/F-3と食い違い、段階4の検査6を書く段階で判明。段階2では検査6を段階4へ繰り延べたため、不一致が未検査のまま通過した | 段階4より先に、`api_asstPublish()` の画像送信範囲と件名を設計へ合わせる |

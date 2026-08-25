# 進捗

最終更新: 2026-08-25

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
| P12-8 | アシストCMS基盤 | `feat/p12-8-assist-cms` | **完了** | ⚪ | PR #39をmainへマージ（`91f7ab7`）。独立test GAS/Sheetで編集・競合拒否・export一致を実機確認 |
| P12-8b | CMS構造化フォーム | `feat/p12-8b-assist-forms` | **完了** | 🟡🔴 | PR #41をmainへマージ（`e4b6408`）。schema v3、生成ページ、test deployment v6を反映 |
| P12-9 | アシスト効果OCR・レビュー | `feat/p12-9-assist-ocr` | **レビュー待ち** | ⚪ | Vision OCR・原画像レビュー・手入力fallback・カード画像Drive uploadのtest実機確認完了 |

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

P12-9「アシスト効果OCR・レビュー」は実装・test実機確認を完了し、レビュー待ち。

- ブランチ: `feat/p12-9-assist-ocr`
- 本番影響: ⚪（ローカルと独立test CMSだけ。公開HTML・3DBは未変更）
- 能力1,079件は既にOCR由来の外部DBとして構築済みのため、能力OCRを優先対象から外した
- 複数の縦スクロール画像を効果カード単位に分割し、重複部分は説明が完全な候補へ統合する
- 黄・金色背景を条件付き`conditional`、白背景を汎用`universal`として画素から判定し、境界値は`unknown`にする
- 黄色背景の効果全体について、主血統・副血統・オーラ・モン類・種族の一致条件を原文付き論理式で保持する。ヴィトニルの3条件はいずれか一致の`or`
- 効果名右側の青丸0〜4個から`無凸`〜`4凸`の候補を作り、OCR文字列とは別に検査する
- ヴィトニル添付4枚は12効果で既存DBと件数・順番が一致したが、説明欠落、誤字、名称末尾、解放段階の差異を確認した
- OCR候補はブラウザ内だけに一時保持し、既存効果DBを自動更新しない
- test CMSの「効果OCR」タブから複数画像をVisionへ送り、候補を補正して効果編集へ未保存反映できるソースを実装した
- test用Google Cloud Vision、Vision限定APIキー、毎分30リクエスト、月額500円の予算アラート、Script Propertiesの`OCR_DAILY_LIMIT=100`を設定済み
- GASはAPIキーを`x-goog-api-key`ヘッダーで送り、OCR日次上限を日本時間・Script Lock付きで送信前に強制する
- test Apps Scriptへ同期し、ウェブアプリdeployment v7でヴィトニル画像1枚のVision実呼び出しが成功した
- deployment v7の4枚実OCRでは説明行2件を誤って効果名に分割して14候補になったため、既存効果名との曖昧一致と説明行除外を追加。deployment v8で12候補へ修正した
- 12候補は条件付き6件・汎用6件、解放段階は無凸5件・1凸2件・2凸2件・3凸2件・4凸1件。主血統/副血統/オーラの`or`1件、モン類一致3件を抽出した
- deployment v9時点では黄色背景2件を未分類nullとして保持したが、その後のドメイン確認でブリーダー派生効果の一致条件を確定し、未分類運用を廃止した
- 実OCR候補12件をtest `capture_queue`へ`needs_review`で保存した（captureId: `effect-ocr-47a82bb3-c79e-419f-abf3-1c81d937ea5b`）。OCR表記の`メンタルボーナス | +1`などは原画像レビュー対象のまま保持する
- Vision日次使用数は4枚の通し確認までで9/100。保存確認用の一時関数は削除し、Apps Scriptエディタをdeployment v9と同じ通常ソースへ復元した
- 保存済み`capture_queue`をカード単位で一覧・再読込し、候補修正を`needs_review`のまま上書き、原画像照合後に`verified`、対象外を`rejected`へ更新できる確認キュー画面を追加した
- 原画像本体を保存しない境界を維持し、`verified`更新時は保存時の元画像再選択と要確認項目0件を必須にした。ファイル名はアップロード時の先頭連番・コピー番号を正規化し、保存時・今回・一致状態を画面表示する。確認状態を変えても公開3DBは自動更新しない
- test Apps Scriptをdeployment v12へ更新。保存済みヴィトニル12候補をv12で再読込し、読み込み中モーダル、黄色候補の背景、`モン類ブリーダー・鍛錬` / `モン類ブリーダー・継承`の`monTypeMatch`補完と`breeder-dependency`保持を確認した
- test Apps Scriptの既存ウェブアプリをdeployment v14へ更新。通知は追従操作欄の上（実画面113px）へ表示し、原画像未選択時は保存時・今回のファイル名を示す詳細エラー、付加連番を除くファイル名正規化を確認した
- ドメイン確認により、`モン類ブリーダー`・`オーラブリーダー`の派生効果はブリーダー出現の前提から、それぞれモン類一致・オーラ一致として扱う。条件原文は効果欄の実文、判定根拠は`breeder-dependency`として分離する
- 条件付き候補は発動条件未選択のままキュー保存・効果反映・確認完了できないように変更した。候補背景の色分け、OCR/通信中モーダル、画面下部通知も追加した
- 画面下部通知は追従操作欄の高さを加算してその上へ表示する。通知が操作ボタンを覆わないようにした
- `capture_queue`、関連API、確認キューUI、ファイル名一致・再選択を完全撤去した。候補はブラウザ内だけに保持し、「原画像と全候補を照合済み」の確認チェック後に効果編集へ反映する
- test Apps Scriptの既存ウェブアプリをdeployment v15へ更新。旧testスプレッドシートの`capture_queue`タブ（データ1行）も削除し、一時削除関数をApps Scriptから除去して監査用ソースとのSHA-256一致を確認した
- カードフォームへ画像選択・プレビュー・Driveアップロードを追加した。管理者指定の「共有アイテム / ライ徹_画像 / assist-card」をtest・本番で共有し、`ASSIST_IMAGE_FOLDER_ID`で指定する。GASはフォルダやサブフォルダを作成・移動せず、指定先直下へCMSで新規選択・差し替えた画像だけを保存する。モンスターCMSと同じ2MB上限・画像実体検査・同一ID旧版のゴミ箱移動を適用し、既存91画像はDriveへ複製しない
- test Apps Scriptの既存ウェブアプリをdeployment v20へ更新。指定DriveフォルダIDのScript Properties設定、初回Drive権限承認、`setup5_createAssistImageFolder`の実行完了、カード画像アップロードUIの有効化を確認した
- deployment v20からヴィトニル画像1枚を実アップロードし、指定Driveフォルダ直下の`a24j-MR-vitoniru.jpg`保存を確認した。既存91画像の複製、サブフォルダ作成、GitHub・公開DB更新は行っていない

## 明示的な保留

- P10-2: 人工的な文書1行テスト。実作業で運用確認できているため保留
- P11-7: GitHub管理権限がなくtest Ruleset・Secretを作れないため保留
- P11-8〜9: P11-7の実機証跡に依存するため保留。main Rulesetを先に有効化しない
- AdSense再申請: 更新利用規約への管理者同意が必要なため保留。Claudeは同意操作をしない
- GASエディタ版とdeployment版の一致: 外部画面未確認
- P12能力画像割当: Firestore `cardAbilities/assignments`の現在値をP12-3で読取確認する

## 現在の引き継ぎ

P11-1〜6でCMSとセキュリティのリポジトリ内作業は完了した。P11-7〜9はGitHub管理権限待ちのため
保留し、mainの保護を先に有効化しない。P12-1の公開後、優先対象をアシストカード個別ページへ
変更した。P12-2の設計を基準に、P12-3でデータを変更しない読取監査を行い、P12-4〜6の3DBを
独立して作れる根拠を確定する。開始文は`docs/claude-next-session.md`を使う。

## 管理者確認待ち

- GitHub `Settings` → `Actions` → `General` → `Workflow permissions`で現在の選択値と、
  `Allow GitHub Actions to create and approve pull requests`のcheck状態を確認する。保存しない
- GitHub個人設定の`Developer settings` → `Personal access tokens`で、値を開示せず、
  該当tokenの種類、所有者、対象repo、権限、期限を確認する
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
| | | | |

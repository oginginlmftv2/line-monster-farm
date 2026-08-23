# 進捗

最終更新: 2026-08-24

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
| P12-8 | アシストCMS基盤 | `feat/p12-8-assist-cms` | **レビュー待ち** | ⚪ | 独立test GAS/Sheetで91カード・888効果・1,079能力を取込。編集・競合拒否・export一致を実機確認 |

## 最新mainの監査値

調査基準: `origin/main`の`1883098`（P12-7bマージ済み。モンスター側の監査値は不変）

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

## 次の作業

P12-8「アシストCMS基盤（test環境）」のレビューと受入確認を行う。

- ブランチ: `feat/p12-8-assist-cms`
- 本番影響: ⚪（test環境のみ。本番deploymentは変更しない）
- 本番と分離したtest GAS/Sheetへ3DBを取り込み、編集・同時編集拒否・検査を実機確認済み
- 日付セルの文字列正規化と`withStats`集計を修正したdeployment v2から3DBを再exportし、元JSONとの意味差分0を確認済み
- 本番スプレッドシートとの同居はP12-11、`cms/assist-publish`と専用WorkflowはP12-10で扱う
- あわせて、執筆で昇格を狙えるカードが12件ある（あと100字以内で800字に届く）
  キャトル(あと4字)、ピーシィ(黄)(あと20字)、ディアナ(あと30字)、キング(あと37字) ほか

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

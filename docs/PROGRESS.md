# 進捗

最終更新: 2026-08-22

状態: `未着手` / `進行中` / `レビュー待ち` / `完了` / `保留`

> 完了にするのは進捗管理チャットの判断。開発ツールの自己申告では完了にしない。
> 全体計画と完了条件は`docs/ライ徹_開発計画.md`を参照。

## 現在地

| ID | 作業 | ブランチ | 状態 | 本番影響 | 備考 |
|---|---|---|---|---|---|
| P10-1 | 管理者の開発準備、文書同期、次回Claudeへの引き継ぎ | `chore/p10-1-admin-readiness` / `chore/p10-1-claude-handoff` | **保留** | ⚪ | 主要整備とPR経路確認済み。問題発生時だけ再開 |
| P10-2 | 非公開影響の人工的な通し稽古 | – | **保留** | ⚪ | 実更新が無いため省略。後続の実作業で確認する |
| P11-1 | CMS・セキュリティの現状監査と実施計画 | `chore/p11-1-cms-security-audit` | **完了** | ⚪ | PR #24をmainへマージ（`449a7b2`）。外部確認待ちは未完了のまま分離 |
| P11-2 | GASソースの正とC10検査対象の復旧 | `chore/p11-2-gas-source-control` | **レビュー待ち** | ⚪ | エディタ版を読取export。GAS同期・deployは別承認まで行わない |
| P11-3 | 配列lockのappend検証と再生成 | `chore/p11-3-repo-guard-lock` | **次の作業** | ⚪ | 348体prefix一致を機械検査し、正規手順で351体lockを生成する |
| P11-4以降 | 監査で分割したCMS・セキュリティ改善 | P11-1で提示 | 未着手 | ⚪〜🟡🔴 | 実施順と完了条件は開発計画のP11-1監査結果を参照 |

## 最新mainの監査値

調査基準: `origin/main`の`449a7b2`（P11-1マージ後。データ監査値は直前のCMS生成`a45ce13`から不変）

| 項目 | 値 | 根拠 |
|---|---:|---|
| モンスター | 351体 | `src/data/monster-ids.json`をNodeで集計 |
| CMS予測ID | 351体 | `src/data/cms-id-predictions.json` |
| ID検算 | PASS 351体 | `node scripts/verify-cms-ids.js` |
| 生成詳細ページ | 351件 | ID一覧のURL実在をNodeで照合 |
| index / noindex | 52 / 299 | 生成HTMLのrobots metaをNodeで集計 |
| モン類ページ | 6件 | `monsters/<monSlug>/index.html` |
| sitemap | 82URL | `<loc>`を集計。既存24 + 詳細52 + モン類6 |
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

確認できなかった外部状態:

- Firestoreの公開中rules本文と公開日時。現在のブラウザアカウントには対象projectの権限が無い
- GitHub Actionsの既定Workflow permissionsとPR作成許可check。監査アカウントは`WRITE`で設定を閲覧できない
- PATの値、種類、所有者、期限、実権限、GASとActionsで同一tokenを使っているか
- GASのエディタ版と現在のdeployment版の一致、export・復旧手段

詳細な根拠、危険性、本番影響、依存関係、復旧方法、完了条件とP11-2〜9は
`docs/ライ徹_開発計画.md`のP11-1監査結果を正とする。

## 次の作業

P11-3「配列lockのappend検証と再生成」だけを次に行う。

- ブランチ: `chore/p11-3-repo-guard-lock`
- 348体lockの並びが現在351体の先頭と完全一致し、差が末尾3体の追加だけであることを機械検査する
- `node scripts/verify.js --lock`の正規手順で`src/data/repo-guard.lock.json`を再生成する
- `scripts/verify.js`に必要なappend検証を追加し、公開HTML、CMS管理データ、外部設定は変更しない

## 第2段階への引き継ぎ

第1段階のルール、CMS境界、検証、PR・マージ手順は整備済みで、P10-1のPR経路も成功した。
人工的な文書1行テストは保留する。第2段階では`docs/claude-next-session.md`を起点に、
CMSとセキュリティの残課題を読み取り監査する。稼働中のCMSを壊さないよう、監査と実装を分離し、
mainのブランチ保護はCMSの迂回経路を実機確認するまで変更しない。

## 管理者確認待ち

- Firebase Console → `Firestore Database` → `ルール`で、全pathのwrite禁止、必要なread許可、
  公開日時を確認する。`公開`は押さず、rules全文と日時だけ共有する
- GitHub `Settings` → `Actions` → `General` → `Workflow permissions`で現在の選択値と、
  `Allow GitHub Actions to create and approve pull requests`のcheck状態を確認する。保存しない
- GitHub個人設定の`Developer settings` → `Personal access tokens`で、値を開示せず、
  該当tokenの種類、所有者、対象repo、権限、期限を確認する
- Apps Script「ライ徹CMS」の`プロジェクト履歴`と`デプロイを管理`で、現在のdeployment版と
  エディタ版、復旧可能な直前版を確認する。保存・再デプロイしない
- GAS Script Propertiesの`GITHUB_TOKEN`とGitHub secret `CMS_PUBLISH_TOKEN`が同じtokenか、
  値を比較・共有せず、token名・作成者の台帳で確認する
- Search Consoleの最新状態とAdSense再申請の状況
- P7のreroll刷新・カード記事を今後の優先タスクにするか

## 既知の検証WARN

- `repo-guard.lock.json`は348体時点で、最新mainは351体。CMSによる末尾追加なのでverifyは
  FAILにせずWARNにしている。ロック更新は自動生成物を変更する別タスクとして扱う
- `EDIT_PASSWORD = 'mf2024'`が7ファイルに残る。既知数から増えていないためWARNだが、
  第2段階で機能、撤去範囲、公開影響、安全な移行先を決める
- GASトークン検査は`_cms/gas`の必須2ファイルへ復旧済み。欠落はFAIL、既知token形式0件はPASSする

## 差し戻し履歴

| 日付 | タスクID | 内容 | 対応 |
|---|---|---|---|
| | | | |

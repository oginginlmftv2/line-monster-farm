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
| P11-1 | CMS・セキュリティの現状監査と実施計画 | `chore/p11-1-cms-security-audit` | **レビュー待ち** | ⚪ | repo・GitHub・GASを読取監査。Firestoreと一部権限は管理者確認待ち |
| P11-2 | GASソースの正とC10検査対象の復旧 | `chore/p11-2-gas-source-control` | **次の作業** | ⚪ | GASは読取比較だけ。同期・deployは別承認まで行わない |
| P11-3以降 | 監査で分割したCMS・セキュリティ改善 | P11-1で提示 | 未着手 | ⚪〜🟡🔴 | 実施順と完了条件は開発計画のP11-1監査結果を参照 |

## 最新mainの監査値

調査基準: `origin/main`の`4651dec`（P11引き継ぎ訂正後。データ監査値は直前のCMS生成`a45ce13`から不変）

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
| C1〜C6 GAS管理画面、編集・画像・公開操作、スマホ最適化 | **完了・運用中** | GASソースはリポジトリ外。運用手順と公開成果物を確認 |
| C7 CMS公開Workflow | **完了** | `cms/publish`からbuild・verify後にmainへpush |
| C8 ID検算 | **完了** | 名前・4桁ID・arrayIndexを全件照合 |
| C9 運用ルール | **完了** | `AGENTS.md`と`CLAUDE.md`へ反映 |
| C10 GitHubトークン検出 | **完了** | `scripts/verify.js`の秘密情報検査 |
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

確認できなかった外部状態:

- Firestoreの公開中rules本文と公開日時。現在のブラウザアカウントには対象projectの権限が無い
- GitHub Actionsの既定Workflow permissionsとPR作成許可check。監査アカウントは`WRITE`で設定を閲覧できない
- PATの値、種類、所有者、期限、実権限、GASとActionsで同一tokenを使っているか
- GASのエディタ版と現在のdeployment版の一致、export・復旧手段

詳細な根拠、危険性、本番影響、依存関係、復旧方法、完了条件とP11-2〜9は
`docs/ライ徹_開発計画.md`のP11-1監査結果を正とする。

## 次の作業

P11-2「GASソースの正とC10検査対象の復旧」だけを次に行う。

- ブランチ: `chore/p11-2-gas-source-control`
- Apps Script「ライ徹CMS」の2ファイルを読取exportし、repoとの差を秘密値なしで確認する
- `cms/gas`を正にするかGAS exportを正にするかを、実物と現在のdeploymentから確定する
- repoへ置く場合は実GASと一致させ、`scripts/verify.js`をSKIPではなくPASSにする
- GASへの同期・保存・deploy、GitHub外部設定、公開物は管理者の別承認まで変更しない

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
- `scripts/verify.js`のGASトークン検査は`cms/gas`がリポジトリに無いためSKIPになる。
  第2段階でGASソースの置き場所を推測せず、同等の検査方法を決める

## 差し戻し履歴

| 日付 | タスクID | 内容 | 対応 |
|---|---|---|---|
| | | | |

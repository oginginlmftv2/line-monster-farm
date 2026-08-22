# 進捗

最終更新: 2026-08-22

状態: `未着手` / `進行中` / `レビュー待ち` / `完了` / `保留`

> 完了にするのは進捗管理チャットの判断。開発ツールの自己申告では完了にしない。
> 全体計画と完了条件は`docs/ライ徹_開発計画.md`を参照。

## 現在地

| ID | 作業 | ブランチ | 状態 | 本番影響 | 備考 |
|---|---|---|---|---|---|
| P10-1 | 管理者の開発準備再確認と計画・進捗文書の同期 | `chore/p10-1-admin-readiness` | **レビュー待ち** | ⚪ | 文書だけ。公開HTML、CMS管理データ、自動生成物は変更しない |
| P10-2 | 管理者による非公開影響の通し稽古 | `chore/p10-2-admin-smoke-test` | 未着手 | ⚪ | 第2段階。管理者環境とGitHub画面を実機確認 |
| P10-3 | 通常ページ更新の実地確認 | 未提示 | 未着手 | 🔴 | P10-2完了後、次に必要な小さい公開更新を選ぶ |
| P10-4 | 公開経路の追加防御 | 未提示 | 保留 | 🟡🔴 | CMS迂回経路を確認するまでブランチ保護を有効化しない |

## 最新mainの監査値

調査基準: `origin/main`の`a45ce13`（2026-08-21のCMS公開生成コミット）

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

## 次の作業

P10-2「管理者による非公開影響の通し稽古」を行う。

- 管理者のWindows環境で`git --version`、`node --version`、Claude、GitHub権限を確認
- `docs/admin-development.md`の動作確認日を1行だけ変更
- 最新mainから`chore/p10-2-admin-smoke-test`を作る
- `node build.js` → `node scripts/verify.js`でFAIL 0
- Claudeの案内でcommit、push、PR作成、チェック確認、mainマージ、ブランチ削除まで行う
- 公開HTML、CMS管理データ、自動生成物に差分が無いことを確認
- 迷ったGitHub画面文言と解決方法をこの文書へ記録

## 第2段階への引き継ぎ

第1段階は手順と文書を整える作業で、管理者のWindows環境とGitHub権限はまだ実機確認していない。
第2段階では文書1行の⚪変更だけを使い、`docs/admin-development.md`第10章どおりに
開始確認からmainマージ後の後片付けまで通す。CMSや公開HTMLは触らず、ブランチ保護も変更しない。

## 管理者確認待ち

- 管理者のPCでGit、Node.js 20、Claudeが利用できるか
- GitHubで対象リポジトリの`Actions`、`Pull requests`、push、merge権限があるか
- mainの現在のRules / Branch protection状態（読み取り確認だけ。変更しない）
- Search Consoleの最新状態とAdSense再申請の状況
- P7のreroll刷新・カード記事を今後の優先タスクにするか

## 既知の検証WARN

- `repo-guard.lock.json`は348体時点で、最新mainは351体。CMSによる末尾追加なのでverifyは
  FAILにせずWARNにしている。ロック更新は自動生成物を変更する別タスクとして扱う
- `EDIT_PASSWORD = 'mf2024'`が7ファイルに残る。既知数から増えていないためWARNだが、
  CMS C1〜C10とは別の保留課題として撤去範囲と公開影響を決める必要がある

## 差し戻し履歴

| 日付 | タスクID | 内容 | 対応 |
|---|---|---|---|
| | | | |

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
| P11-1 | CMS・セキュリティの現状監査と実施計画 | `chore/p11-1-cms-security-audit` | **次の作業** | ⚪ | 読み取りと文書整理のみ。外部設定、公開物、CMS管理データは変更しない |
| P11-2以降 | 監査で確定したCMS・セキュリティ改善 | P11-1で提示 | 未着手 | 要判定 | 変更対象、依存関係、復旧方法ごとに分割する |

## 最新mainの監査値

調査基準: `origin/main`の`31764c5`（P10-1引き継ぎマージ後。データ監査値は直前のCMS生成`a45ce13`から不変）

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

第2段階P11「CMSとセキュリティの仕上げ」を開始する。最初はP11-1の読み取り監査を行う。

- `docs/claude-next-session.md`のプロンプトを次回Claudeへ渡す
- 最新mainから`chore/p11-1-cms-security-audit`を作る
- CMS公開Workflow、検証スクリプト、権限境界、既知WARNを実物から確認する
- GAS、GitHub、Firestoreの外部状態は、管理者が画面で確認できる項目とClaudeが確認できる項目に分ける
- 秘密値を表示・記録せず、問題、依存関係、本番影響、復旧方法を整理する
- P11-2以降を独立した実装単位へ分割し、各タスクのブランチ名と完了条件を提示する
- 監査中は公開HTML、CMS管理データ、自動生成物、外部設定を変更しない

## 第2段階への引き継ぎ

第1段階のルール、CMS境界、検証、PR・マージ手順は整備済みで、P10-1のPR経路も成功した。
人工的な文書1行テストは保留する。第2段階では`docs/claude-next-session.md`を起点に、
CMSとセキュリティの残課題を読み取り監査する。稼働中のCMSを壊さないよう、監査と実装を分離し、
mainのブランチ保護はCMSの迂回経路を実機確認するまで変更しない。

## 管理者確認待ち

- mainの現在のRules / Branch protection状態（読み取り確認だけ。変更しない）
- GASプロジェクトのソース管理場所と、C10相当の秘密情報検査を実行できる範囲
- `CMS_PUBLISH_TOKEN`の利用主体、最小権限、失効・再発行手順（値は共有しない）
- Firestoreの現在のルールが書込全面禁止のままか（読み取り確認だけ）
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

# lMfDB 外部能力DB連携

最終更新: 2026-08-28

対象: P12-17a 段階2（dry-run）

本番影響: ⚪（監査専用。3DB、生成ページ、CMS、公開経路を変更しない）

## 1. 入力と正

外部の正は `futsalife24-bot/lMfDB` の `data/abilities.json` とする。
通常確認は `main`、自動連携では通知された40桁の小文字コミットSHAを固定して取得する。

```text
https://raw.githubusercontent.com/futsalife24-bot/lMfDB/<externalSha>/data/abilities.json
```

ローカルの比較対象は次の3ファイルである。

- `src/data/assist-abilities.json`: 外部 `id` とローカル `legacyId` を同一IDとして比較する
- `src/data/assist-cards.json`: cardIdの存在と、カード名 + rarityの一意性を検査する
- `src/data/lmfdb-card-map.json`: `sourceName + rarity → cardId` の完全一致対応だけを認める

外部の `card` はローカルの `sourceName` として扱う。trim、大文字小文字変換、括弧除去、
部分一致、類似検索、表記補正は行わない。

## 2. 実行方法

```bash
# 外部mainを確認
node scripts/sync-lmfdb-abilities.js

# 通知された外部コミットを固定して確認
node scripts/sync-lmfdb-abilities.js --sha <40桁の小文字SHA>

# テスト用ローカルJSON
node scripts/sync-lmfdb-abilities.js --file /absolute/path/abilities.json

# 任意の機械可読レポート（一時ディレクトリ配下だけ）
node scripts/sync-lmfdb-abilities.js --sha <SHA> --json-report /tmp/lmfdb-audit.json
```

スクリプトは監査結果を標準出力へ出すだけで、`--write`、`--apply`、シート更新、
GitHub送信機能を持たない。外部JSONもリポジトリへ保存しない。

## 3. 検証と比較

取得時はHTTP失敗、15秒タイムアウト、空レスポンス、2MiB超、不正JSONを拒否し、
取得バイト列のSHA-256を報告する。外部JSONは次を検査する。

- `schemaVersion === 1`、`generatedFrom === "ux/index.html"`
- `counts.abilities === abilities.length`
- 正の整数ID、ID重複0、必須7項目の存在と型
- `tags`が重複のない非空文字列配列
- `</script`（大文字小文字を問わない）を含む文字列がない

外部配列は並べ替えない。外部管理項目は `legacyId / sourceName / name / description /
source / rarity / tags`、ローカル管理項目は `abilityId / cardId / linkStatus / sortOrder /
flags / status` である。dry-runは後者を変更しない。

新規能力だけは、固定対応表に完全一致する場合に `resolved` 候補として報告する。
既存の `ambiguous` / `unlinked` は、名前が一致しても自動確定しない。外部から消えたIDも
削除せず、欠落として報告する。

## 4. 最終判定

| 判定 | 条件 |
|---|---|
| `SAFE` | スキーマ・対応表に問題がなく、既存変更・欠落・未知値・未対応新規がない |
| `REVIEW_REQUIRED` | 既存内容変更、外部ID欠落、未知source/rarity、固定対応のない新規能力がある |
| `BLOCKED` | 取得・スキーマ・ID・危険文字列・対応表が不正、abilityId衝突またはcardId矛盾がある |

追加件数だけでは停止しない。固定対応できる新規能力は安全な同期候補として報告するが、
この段階では実データへ書き込まない。

## 5. 段階2で変更しないもの

- `src/data/assist-cards.json` / `assist-effects.json` / `assist-abilities.json`
- `_cms/gas/**`、GASのシート、Drive、Secrets
- `build.js`、生成カードHTML、公開HTML、sitemap.xml
- `.github/workflows/**`、公開ブランチ、main、外部リポジトリ

段階3（実データ反映、自動連携、Workflow、公開）は別承認の別タスクとする。

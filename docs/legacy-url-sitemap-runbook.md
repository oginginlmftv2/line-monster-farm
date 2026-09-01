# 旧URL恒久インデックス削除（sitemap-legacy.xml）手順書

最終更新: 2026-09-01

対象: `sitemap-legacy.xml`、`scripts/gen-legacy-sitemap.js`、`scripts/verify.js` の5節。

本番影響: `sitemap-legacy.xml` はGitHub Pagesで配信される公開ファイルなので🟡。
ただし `sitemap.xml`・`robots.txt`・`monsters/monster.html` には一切触れない。

## 0. これは一時的な仕組みである

旧URL `monsters/monster.html?id=N` は初期HTMLに `noindex,nofollow` を持ち、
クロールできればインデックスから消える状態にある。にもかかわらず消えないのは、
旧URLが `sitemap.xml` にも内部リンクにも無く、**Googleに再訪する動機が無い**ためである。
2026-08-21時点で処理済みは344件中17件（約5%）、7月のペースは週1件だった。

`sitemap-legacy.xml` は旧URLだけを `lastmod` 付きで列挙し、GSCへ手動送信して
再クロールを起こすためのものである。noindexが読まれ切れば役目は終わる。
**恒久的に置くファイルではない。**

対策は2段構えで、第1段（GSCの「一時的な削除」）は時間稼ぎ、第2段（本ファイル）が本命。

| 段 | 内容 | 実施日 |
|---|---|---|
| 第1段 | GSC「一時的な削除」でプレフィックス `.../monsters/monster.html` を非表示 | 2026-09-01 |
| 第2段 | `sitemap-legacy.xml` をGSCのサイトマップへ送信 | 2026-09-01 |

## 1. 運用上の制約（変更しないこと）

- `sitemap-legacy.xml` を `sitemap.xml` に含めない
  - 事故防止として `scripts/verify.js` の5節が
    「`sitemap.xml` に `monster.html?id=` が無いこと」を機械的に検査する
- `robots.txt` に `Sitemap: .../sitemap-legacy.xml` を**追加しない**
  - robots.txt経由で公開すると、GoogleBot以外のクローラーにも旧URLを広めてしまう
  - GSCへの手動送信だけで運用する
- `scripts/gen-legacy-sitemap.js` を `build.js` から呼ばない（手動実行のみ）
- `build.js` の `existingBlocks.length !== 24` 等の定数に影響を与えない
- `monsters/monster.html` の削除、noindex・canonicalの変更をしない
  （現在の noindex + JS転送の構成は正しく機能している）

## 2. 再生成（モンスターが増えたとき）

旧URLのidは `monsters-data.js` の配列インデックスで、CMS公開でモンスターが増えると
旧URLも増える。増分を送信対象へ入れたい場合だけ再生成する。

```bash
git checkout main && git pull
node scripts/gen-legacy-sitemap.js
node build.js
node scripts/verify.js
```

`sitemap.xml` に差分が出ていないこと、`verify.js` がFAIL 0であることを確認して
作業ブランチからPRを出す。マージ後、GSCでサイトマップを再送信する
（同じ `sitemap-legacy.xml` を再送信すればよい）。

## 3. 撤去の判断基準

GSCの「ページ」レポートで、旧URLの
**「noindex タグによって除外されました」の件数が344に近づいたら**撤去する。

⚠ **期限: 第1段の「一時的な削除」は約6か月で失効する（2027-03頃）。
それまでに第2段を完了させること。** 失効後に恒久削除が終わっていないと、
旧URLが再び検索結果に現れる。

## 4. 撤去手順

1. GSCの「インデックス作成 → サイトマップ」から `sitemap-legacy.xml` を削除する
2. リポジトリから次の2ファイルを削除する
   - `sitemap-legacy.xml`
   - `scripts/gen-legacy-sitemap.js`
3. `scripts/verify.js` に追加した旧URL混入検査は**残してよい**
   （`sitemap.xml` への事故混入を防ぐ検査として引き続き有用）
4. 本手順書の「実施日」欄へ撤去日を追記する
5. `node build.js` と `node scripts/verify.js` を実行し、FAIL 0を確認してPRを出す

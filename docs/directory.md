# ディレクトリ構造・URL設計

詳細な根拠は `docs/monster-id.md` を参照。ここは結論だけを置く。

## 生成ページのURL階層

```
/monsters/                              モンスター一覧（348体・全件静的＋JSフィルタ）
  └ /monsters/<モン種>/                 モン種一覧          6ページ
      └ /monsters/<モン種>/<血統>/      血統一覧           34ページ
          └ .../<ID>.html               モンスター詳細      93ページ（解説ありのみ）
```

例: `/monsters/mazoku/pixie/0101.html`（ピクシー）

**オーラ別ページは作らない。** 一覧ページのJSフィルタ条件としてのみ使う。

## モン種のslug

| モン種 | slug | 体数 |
|---|---|---:|
| 魔族 | `mazoku` | 81 |
| 獣 | `kemono` | 66 |
| 幻霊 | `genrei` | 60 |
| 無機 | `muki` | 55 |
| 怪物 | `kaibutsu` | 49 |
| 創造 | `souzou` | 37 |

**`獣` = `kemono` で確定（2026-08-16）。** 血統34種のslugは `generate-ids.js` の `BLOOD_SLUG` が正。

血統34種のslugは `docs/monster-id.md` の「slug命名方針」節で確定済み（2026-08-18）。変更禁止。

## 画像

```
img/monster/<ID>.jpg        例: img/monster/0101.jpg
```

## リポジトリ構造

```
src/                  ビルド入力。gh-pages に出さない
  data/               monster-ids.json / sheet-sortorder.json / *-editorial.json
  templates/
  build.js
admin/                管理画面。gh-pages に出さない
tools/                開発用スクリプト。gh-pages に出さない
docs/                 ルール文書。gh-pages に出さない
scripts/verify.js     ルール検証
```

**デプロイは `main` 直接ではなく `gh-pages`。** これが `src/` `admin/` `tools/` を
公開しない唯一の確実な方法（robots.txt は保護にならない）。

## ルート直下に置いたまま動かさないファイル

| ファイル | 理由 |
|---|---|
| `google59378bd79752d094.html` | Search Console の所有権確認。削除・移動すると計測権限を失う |
| `CNAME` | 独自ドメイン設定 |
| `robots.txt` / `sitemap.xml` / `ads.txt` | 仕様上ルート固定 |

`verify.js` の「1. 公開URLの不変性」がこれらの存在を検査する。

## 既存の公開URL

**変更しない。** 一覧と理由は `AGENTS.md` 第3章。

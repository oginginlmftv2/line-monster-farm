# ディレクトリ構造・URL設計

詳細な根拠は `docs/monster-id.md` を参照。ここは結論だけを置く。

## 生成ページのURL階層

```
monsters.html（ルート直下・既存） モンスター一覧（カード部分をbuild.jsが生成）
└ /monsters/<モン類>/ モン類一覧 6ページ
└ /monsters/<モン類>/<血統>/ ※血統ページは作らない（ディレクトリのみ）
└ .../<ID>.html モンスター詳細 全件（800字未満はnoindex,follow）
─────────────────
生成数はCMS公開ごとにモンスター数へ自動追従
```

> `monsters/index.html` は生成しない。一覧は既存の `monsters.html` が担う。
> 生成すると重複コンテンツになるため。詳細は `docs/build-spec.md` 2-2 を参照。

血統ページも生成しない。 モン類ページが血統ハブを兼ねる。
理由と将来の追加手順は docs/build-spec.md 3-2 を参照。

例: `/monsters/mazoku/pixie/0101.html`（ピクシー）

**オーラ別ページは作らない。** 一覧ページのJSフィルタ条件としてのみ使う。

## モン類のslug

| モン類 | slug | 体数 |
|---|---|---:|
| 魔族 | `mazoku` | 81 |
| 獣族 | `kemono` | 66 |
| 幻霊 | `genrei` | 62 |
| 無機 | `muki` | 56 |
| 怪物 | `kaibutsu` | 49 |
| 創造 | `souzou` | 37 |

**`獣族` = `kemono` で確定（2026-08-16）。** 血統34種のslugは `generate-ids.js` の `BLOOD_SLUG` が正。

血統34種のslugは `docs/monster-id.md` の「slug命名方針」節で確定済み（2026-08-18）。変更禁止。

## 画像

```
monster/<4桁ID>.<拡張子>        例: monster/0101.jpg
```

新規・差し替え画像はGAS管理画面からDrive経由で配置する。
リポジトリ側から直接差し替えない。

## リポジトリ構造

```
build.js                       公開HTML・CMS参照データの生成
src/data/                      ビルド入力とCMS公開の受け渡し
monsters/                      生成されるモンスター詳細・モン類ページ
monster/                       CMSがDrive経由で配置する4桁ID画像
.github/workflows/cms-publish.yml  CMS公開の検算・ビルド・main反映
scripts/verify.js              リポジトリルール検証
scripts/verify-cms-ids.js      CMS予測IDとgenerate-ids.jsの照合
docs/                          ルール・計画・運用文書
tools/                         開発用スクリプト
```

**現在のGitHub Pagesは`main`を直接配信する。**
そのため通常PRのmainへのマージとCMS公開Workflowのmainへのpushは、
どちらも即時公開になる。`gh-pages`は未使用の予約ブランチ名である。

## ルート直下に置いたまま動かさないファイル

| ファイル | 理由 |
|---|---|
| `google59378bd79752d094.html` | Search Console の所有権確認。削除・移動すると計測権限を失う |
| `CNAME` | 独自ドメイン設定 |
| `robots.txt` / `sitemap.xml` / `ads.txt` | 仕様上ルート固定 |

`verify.js` の「1. 公開URLの不変性」がこれらの存在を検査する。

## 既存の公開URL

**変更しない。** 一覧と理由は `AGENTS.md` 第3章。

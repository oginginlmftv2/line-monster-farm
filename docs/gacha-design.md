# ガチャDB・静的ページ生成設計

作成: 2026-08-30
対象タスク: G1
本番影響: ⚪（`gachas.json`を空でコミットするため、公開HTML・sitemapは変化しない）

## 1. 目的と範囲

ガチャを更新単位として扱うためのDB、検証、詳細ページ、一覧、sitemap連携の基盤を置く。
G1では既存ページへの導線や表示を変更しない。GAS、シート、Workflowも変更しない。

本番入力は次の空DBで開始する。

```json
{ "schemaVersion": 1, "gachas": [] }
```

空DBでは`gacha/`配下を1枚も生成せず、`sitemap.xml`も変えない。

## 2. DB

`src/data/gacha-types.json`の`types`配列順を表示順とする。ガチャ本体は
`src/data/gachas.json`の`gachas`配列に置く。

主キーは`gachaId`（`YYYYMMDD-連番`）。名前・画像・期間・解説・公開状態をガチャ側に持ち、
ピックアップの名前・属性・画像・解説はモンスター4桁IDまたは`cardId`で既存DBから解決する。
排出率は`0 < rate <= 100`の数値で持ち、表示時だけ`%`を付ける。

`startAt`と`endAt`は`YYYY-MM-DDTHH:mm+09:00`形式に限定する。`gachaId`の日付部は
`startAt`のJST日付と一致させる。

## 3. 共通定数と検証

`build.js`だけに次を定義し、`scripts/verify.js`と`test-gacha-build.js`はexportを参照する。

```js
const PICKUP_SLOTS = 5;
const GACHA_EXCERPT_CHARS = 140;
const GACHA_GATE_VISIBLE_CHARS = 800;
const GACHA_GATE_EXPLANATION = 150;
```

DB検査の正は`build.js`の`validateGachaData()`とする。通常ビルド、`verify.js`、破壊テストで
同じ関数を使い、ID・日時・種別・参照先・排出率・画像・枠数・公開日の判定を重複実装しない。

## 4. 生成ページ

`status === "published"`だけを次へ生成する。

- `gacha/<gachaId>.html`: 詳細ページ。ゲート未通過でも生成する
- `gacha/index.html`: publishedが1件以上ある場合だけ生成する

詳細はパンくず、固有メタデータ、バナー、種別、期間、解説、モンスター、カード、一覧導線を持つ。
既存の`style.css`にある`section`、`card-grid`、`card`、`menu-grid`などを使用し、G1専用CSSは作らない。
テンプレートは既存の`build.js`と同じくテンプレートリテラルで保持する。

一覧は基準時刻に対して開催中（開始前を含む）と終了へ分ける。開始前は開始日を表示し、
終了ガチャも削除せず全件掲載する。すべての詳細へリンクし、ゲート未通過も回遊対象にする。

開催中判定の基準時刻は`buildGachaPages()`の`now`入力とする。通常ビルドでは
`GACHA_BUILD_NOW`から渡す。DBが空なら不要である。同じDBと同じ基準時刻からは同じバイト列を出す。

## 5. インデックスゲートとsitemap

モンスター詳細と同じ`visibleChars()`で、script、style、コメント、タグ、空白を除いた
`body`の可視文字数を数える。

```text
index対象 = 可視本文800字以上 AND explanation 150字以上
```

未通過詳細は`noindex,follow`、広告なし、sitemap非掲載とする。通過詳細はrobotsメタなし、
広告あり、sitemap掲載とする。一覧は生成される場合は常にsitemapへ載せる。
手書きURL23件の固定検査は変更せず、ガチャURLは生成件数から動的に加算する。

## 6. G1実測

`explanation`を空にし、実DBの解説つきモンスター・カードをID参照するfixtureで測った。
テンプレート部分は同じページからピックアップ抜粋だけを除いて再計測し、差分を抜粋部分とした。

| ケース | ピックアップ | 総数 | テンプレート部分 | ピックアップ抜粋部分 |
|---|---|---:|---:|---:|
| A | モンスター5体・カード5枚 | 1,938字 | 613字 | 1,325字 |
| B | モンスター3体・カード2枚 | 1,137字 | 451字 | 686字 |
| C | モンスター1体・カード0枚 | 432字 | 292字 | 140字 |

暫定800字はA/Bでは解説が空でも可視本文側だけ通るが、解説150字条件により自動indexを防げる。
Cは可視本文も不足する。閾値を下げるより、最小構成でも固有情報を増やせる構成をG2以降で検討し、
運営者解説150字以上を維持するのが安全である。

## 7. テスト配置

fixtureは`src/data/`へ置かず、`scripts/test-gacha-build.js`が一時ディレクトリへ生成する。
既存の`test-verify-assist-cms.js`などが、破壊用コピーをOSの一時ディレクトリへ作り、終了時に消す
慣行に合わせた。本番DBを書き換えず、正常10件・破壊10件と決定性を同じ入口で検証する。

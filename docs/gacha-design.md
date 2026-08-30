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

主キーは`gachaId`（`YYYYMMDD-連番`）。採番した時点の予定開始日に由来する一意キーであり、
開始日の延期・変更後も日付部が`startAt`と一致し続けることは保証しない。名前・画像・期間・解説・公開状態をガチャ側に持ち、
ピックアップの名前・属性・画像・解説はモンスター4桁IDまたは`cardId`で既存DBから解決する。
排出率は`0 < rate <= 100`の数値で持ち、表示時だけ`%`を付ける。

`startAt`と`endAt`は`YYYY-MM-DDTHH:mm+09:00`形式に限定する。公開済みURLの不変性を優先するため、
`gachaId`と現在の`startAt`の日付一致は検査しない。

## 3. 共通定数と検証

`build.js`だけに次を定義し、`scripts/verify.js`と`test-gacha-build.js`はexportを参照する。

```js
const PICKUP_SLOTS = 5;
const GACHA_EXCERPT_CHARS = 140;
const GACHA_GATE_VISIBLE_CHARS = 800;
const GACHA_GATE_EXPLANATION = 300;
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

開催中判定の基準時刻は`buildGachaPages()`の`now`入力とする。通常ビルドでは現在時刻を渡し、
`GACHA_BUILD_NOW`が設定されている場合だけテスト・再現用の上書き値として使う。
DBが空なら基準時刻は不要である。同じDBと同じ基準時刻からは同じバイト列を出す。

## 5. インデックスゲートとsitemap

モンスター詳細と同じ`visibleChars()`で、script、style、コメント、タグ、空白を除いた
`body`の可視文字数を数える。

```text
index対象 = 可視本文800字以上 AND explanation 300字以上
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

モンスター詳細リンクを解説の有無から独立させた後の再計測値は次のとおり。リンク文言ぶんだけ
テンプレート部分がAは50字、Bは30字、Cは10字増え、抜粋部分は変わらなかった。

| ケース | 総数（修正後） | テンプレート部分（修正後） | ピックアップ抜粋部分（修正後） |
|---|---:|---:|---:|
| A | 1,988字（+50） | 663字（+50） | 1,325字（±0） |
| B | 1,167字（+30） | 481字（+30） | 686字（±0） |
| C | 442字（+10） | 302字（+10） | 140字（±0） |

暫定800字はA/Bでは解説が空でも可視本文側だけ通るため、実測結果を踏まえて解説条件を
300字へ引き上げ、自動indexを防ぐ。Cは可視本文も不足する。閾値を下げるより、最小構成でも
固有情報を増やせる構成をG2以降で検討し、運営者解説300字以上を維持するのが安全である。

## 7. テスト配置

fixtureは`src/data/`へ置かず、`scripts/test-gacha-build.js`が一時ディレクトリへ生成する。
既存の`test-verify-assist-cms.js`などが、破壊用コピーをOSの一時ディレクトリへ作り、終了時に消す
慣行に合わせた。本番DBを書き換えず、正常13件・破壊10件と決定性を同じ入口で検証する。

## 8. G2: 既存ページ統合

`index.html`と`reroll.html`は、`GACHA:<NAME>:START/END`マーカーの内側だけを
`replaceMarkerBlock()`で置換する。HTMLコメントとJavaScript行コメントは引数で切り替え、
欠落・逆順・多重定義はファイル名とマーカー名を含むエラーでビルドを停止する。

本番DBが空なら全区間へ触れない。publishedが1件以上ならトップの更新履歴、開催中ガチャ別の
モンスター／カード、ガチャ一覧導線を生成する。開催中が0件ならトップは一覧リンク付きの案内へ
置換するが、リセマラ区間は直前のおすすめを残すため更新しない。

リセマラ候補はpublishedかつ`startAt <= now <= endAt`だけとし、`rerollPriority=true`があれば
その集合、なければ全候補から`startAt`降順・同時刻は`gachaId`昇順の先頭を選ぶ。

publishedガチャのピックアップは、終了後もモンスター／カード詳細の「登場ガチャ」に残す。
`startAt`降順で表示し、該当0件ならセクション自体を出さない。

カード詳細は生成後のHTMLを読み直さない。`build.js`から`buildAssistPages()`へ
`gachaAppearancesFor(cardId)`を渡し、`scripts/build-assist-pages.js`のテンプレートが
「アシストカード一覧」の直前へ返却文字列を組み込む。コールバック未指定時は空文字とし、
カードビルドの単体実行を維持する。カードのゲートは従来どおり効果・verified能力・解説だけで
判定し、登場ガチャの表示文字列を加算しない。

### 保留

- トップの更新履歴は既存どおりJavaScript配列で描画するため、クローラー向け静的HTML化は別タスクとする。

## 9. G3: ガチャCMS（シート保存まで）

`gachas`と`gacha_types`の2シートだけを既存の`setup1_createSheets()`へ追加する。既存シートは読まず、削除・全消去・行削除を行わない。G3は下書きの新規・編集、競合拒否、ピックアップ照合、バナー画像アップロードまでとし、GitHub公開はG4へ分離する。

GAS側の枠数は`GACHA_PICKUP_SLOTS = 5`を正とし、`monster`、`monsterRate`、`card`、`cardRate`の列名をループ生成する。`gachas`の列順は次のとおり。

```text
gachaId / name / gachaType / image / startAt / endAt / explanation /
monster1..5 / monsterRate1..5 / card1..5 / cardRate1..5 /
rerollPriority / status / publishedAt / author / updatedAt / lastEditor
```

新規の`gachaId`は`startAt`のJST日付を`YYYYMMDD`へ変換し、同じ日付の既存IDから空いている最小の正整数枝番を選ぶ。publishedは公開URLを不変にするため、開始日時を変更しても既存IDを維持する。draftはまだ公開URLが存在しないため、開始日のJST日付が変わったときだけ新しい日付で採番し直す。時刻だけの変更ではIDを変えない。

draftの採番し直し時は`image`列を空にし、新しいIDで画像を再アップロードする。Drive上の旧ファイルを保存処理からリネーム・削除するとシート保存との補償経路が増えるため行わず、参照だけを確実に外す。公開時にIDと画像名が食い違うことを防ぐため、旧画像パスを保持する実装へ戻してはならない。

ピックアップ照合は`RAW_BASE`の`monster-ids.json`と`assist-cards.json`をCacheService経由で参照する。保存前に名前へ解決できることを確認し、排出率は数値型の`0 < rate <= 100`だけを受け入れる。最終的なDB検査の正は引き続き`build.js`の`validateGachaData()`であり、GAS側ではシート投入前の最低限だけを検査する。

画像はScript Propertyの`GACHA_DRIVE_FOLDER_ID`が指すフォルダへ`<gachaId>.<拡張子>`で保存する。JPG・PNG・WebP、2MB以下、マジックバイト一致を必須とし、新規ファイル作成後に同じIDの旧画像をゴミ箱へ移す。シートには`gacha/<ファイル名>`を保存する。

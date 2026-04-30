# LINEモンスターファーム徹底攻略 - 作業メモ

---

## 🔴 作業のたびに必ずやること（忘れると怒られる）

- **index.html の更新履歴テーブルに追記する**（`<!-- 更新履歴 -->` セクション）
  - 日付は `YYYY.MM.DD` 形式
  - 作業内容を簡潔に1行で書く
  - 一番上（最新）に追加する

---

## 🔴 現在のピックアップ状態（毎回更新のたびに書き換えること）

| 項目 | 値 |
|---|---|
| ピックアップモンスター | ニャハト（新）・シュシュポッポ（継続） |
| monsters-data.js 末尾インデックス | **334**（配列の要素数335、0始まりなので末尾=334） |
| index.html のリンク | `monsters/monster.html?id=334`（ニャハト）・`monsters/monster.html?id=333`（シュシュポッポ） |
| ピックアップカード | ディアナ（新）・ノルン（新） |
| カードID | `b16i-MR-diana` / `b5g-SSR-norun` |
| index.html のリンク | `cards/card.html#b16i-MR-diana` / `cards/card.html#b5g-SSR-norun` |

---

## ⚠️ 新モンスター追加時の注意

### monsters-data.js
- **必ず配列の末尾に追加すること**
- 先頭や途中に追加すると全モンスターのインデックス（id）がずれ、
  monster.html・monster-match・ピックアップリンクなどが全て壊れる
- 過去に2回この問題が起きている

### 新モンスターのインデックス確認方法
- monsters-data.js の `];` 直前の行が末尾要素
- **インデックス = 配列の要素数 - 1**（要素数はファイル内の `name: '` の数を数えることで確認できる）
- 追加後のインデックス = **現在の末尾インデックス + 1**
- 現在の末尾インデックスは上の「現在のピックアップ状態」テーブルで確認
- ⚠️ ラインナンバーとインデックスは一致しない（コメント行・宣言行があるためずれる）ので必ず要素数で数えること

### 新モンスターの localImg について
- `localImg: 'S__XXXXXXXX.jpg'` のように **ファイル名だけ** を書く（`monster/` プレフィックス不要）
- monsters.html が自動で `monster/` を付けて表示する
- GameWithはもう更新されていないので **`gwImg: null`** にする
- `gwImg: null` のモンスターは monsters.html で**一番先頭（最新の位置）**に表示される

### 追加時にセットで更新が必要なファイル
1. `monsters-data.js` → **末尾に追加**
2. `monster-match.html` → `LOCAL_FILES` 配列に画像ファイル名を追加、枚数表示も更新
3. `index.html` → ピックアップのリンク（`?id=X`）を新しいインデックスに更新
4. 上の「現在のピックアップ状態」テーブルを書き換える

---

## ⚠️ 新アシストカード追加時の注意

### assist.html のカード追加位置
- **`<div class="card-grid" id="cardGrid">` の直後（一番先頭）に追加すること**
- これが「一番新しい場所」になる
- cards-data.js は先頭に追加してOK（表示順は affect しない）

### 追加時にセットで更新が必要なファイル
1. `cards/cards-data.js` → 先頭に追加
2. `assist.html` → `#cardGrid` の **先頭に** HTMLブロックを追加
3. `ability-match.html` → `ABILITY_FILES` 配列に能力画像ファイル名を2枚追加
4. `index.html` → ピックアップのカード画像・リンク・説明文を更新
5. `assist-abilities/` → 能力画像を配置（フォルダがなければ作成）
6. `assist-cards/` → カード画像を配置
7. 上の「現在のピックアップ状態」テーブルを書き換える

### カードHTMLブロックのテンプレート
```html
<a class="card" data-rarity="MR" href="cards/card.html#カードID">
  <img class="card-img" src="assist-cards/カードID.jpg" alt="カード名">
  <div class="card-info"><div class="card-name">カード名</div><span class="rarity rarity-MR">MR</span></div>
</a>
```

---

## ℹ️ 画像の仕組み

### モンスター画像
- `localImg: 'S__XXXXXXXX.jpg'` → **ファイル名だけ**（`monster/` 不要）
- monsters.html の `validLocalImg` チェックが `startsWith('S__')` で判定するため
- GameWithはもう更新されていないので新モンスターは `gwImg: null` にする

### アシストカード能力画像
- `assist-abilities/` フォルダに画像を置く
- カードへの割り当ては `ability-match.html` でFirestoreに保存する

---

## ℹ️ ファイル構成メモ

| ファイル | 役割 |
|---|---|
| `monsters-data.js` | モンスター一覧データ（配列・インデックス=id） |
| `cards/cards-data.js` | アシストカードデータ |
| `assist.html` | アシストカード一覧（カードはHTMLに直接ハードコード） |
| `monster-match.html` | モンスター画像マッチング管理画面 |
| `ability-match.html` | アシストカード能力画像マッチング管理画面 |
| `index.html` | トップページ（ピックアップ表示） |
| `beginner.html` | 初心者ガイド |
| `newbie.html` | これから始める人へ |

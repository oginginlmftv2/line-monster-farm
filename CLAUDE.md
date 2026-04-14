# LINEモンスターファーム徹底攻略 - 作業メモ

## ⚠️ 新モンスター追加時の注意

### monsters-data.js
- **必ず配列の末尾に追加すること**
- 先頭や途中に追加すると全モンスターのインデックス（id）がずれ、
  monster.html・monster-match・ピックアップリンクなどが全て壊れる
- 過去に2回この問題が起きている

### 追加時にセットで更新が必要なファイル
1. `monsters-data.js` → 末尾に追加
2. `monster-match.html` → `LOCAL_FILES` 配列に画像ファイル名を追加、枚数表示も更新
3. `index.html` → ピックアップのリンク（`?id=X`）を末尾インデックスに合わせる

---

## ⚠️ 新アシストカード追加時の注意

### 追加時にセットで更新が必要なファイル
1. `cards/cards-data.js` → 先頭に追加（表示順に影響しないので先頭でOK）
2. `ability-match.html` → `ABILITY_FILES` 配列に能力画像ファイル名を2枚追加
3. `index.html` → ピックアップのカード画像・リンク・説明文を更新
4. `assist-abilities/` → 能力画像を配置（フォルダがなければ作成）
5. `assist-cards/` → カード画像を配置

---

## ℹ️ 画像の仕組み

### モンスター画像
- `localImg` が設定されていればそちらを優先表示
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
| `monster-match.html` | モンスター画像マッチング管理画面 |
| `ability-match.html` | アシストカード能力画像マッチング管理画面 |
| `index.html` | トップページ（ピックアップ表示） |
| `beginner.html` | 初心者ガイド |
| `newbie.html` | これから始める人へ |

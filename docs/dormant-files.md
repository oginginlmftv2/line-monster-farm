# 休止中ファイル台帳

**このファイルに載っているものは削除しない。** 広告審査のため 2026-06-25 に一時的に
取り下げたページと、そのデータです。審査通過後に復活させる可能性があります。

同時に、**開発中のエージェント（Claude Code / Codex）はこれらを読み込まない**こと。
合計 1.2MB あり、1本読むだけで作業1回分のトークンが消えます。
読み込み禁止は `.claude/settings.json` の `permissions.deny` で機械的に強制しています。

## 休止中のページ（2026-06-25 に全てリダイレクトスタブ化）

| 現在のファイル | 取り下げ前のサイズ | 使っていたデータ |
|---|---:|---|
| `ability-search.html` | 56,063 B | `lMfDB_abilities.json` / `lmfdb_abilities_data.json` |
| `game-runner.html` | 41,678 B | `monster-runner/` の画像 |
| `friend.html` | 37,275 B | – |
| `assist-card-search.html` | 33,069 B | `assist-card-data.js` |
| `game-2048.html` | 32,063 B | – |
| `monsuta-shindan.html` | 26,795 B | – |
| `bbs.html` | 24,489 B | Firestore |
| `assist-ranking.html` | 23,198 B | `assist-card-data.js` |
| `npc-regen.html` | 18,321 B | – |
| `ability-ranking.html` | 18,089 B | `lMfDB_abilities.json` |
| `monster-quiz.html` | 14,435 B | – |
| `abilitypoint/index.html` | 5,358 B | `abilitypoint/script.js` |
| `ability-db.html` | 528 B | – |

※ 復活させたい場合は `git log -- <ファイル名>` で 2026-06-25 の直前のコミットから戻せます。

## 休止中のデータファイル（読み込み禁止）

| ファイル | サイズ | 用途 |
|---|---:|---|
| `assist-card-data.js` | 344 KB | assist-card-search / assist-ranking 用 |
| `lMfDB_abilities.json` | 336 KB | 能力データベース（新形式） |
| `lMfdb-index-20-23.html` | 388 KB | 能力データベースの一覧ページ |
| `lmfdb_abilities_data.json` | 176 KB | 能力データベース（旧形式） |
| `abilitypoint/script2.js` `abilitypoint/style2.css` | – | index2.html 用 |

## 稼働中だが読み込み禁止のファイル

内容を読む必要がないもの。参照は残すので削除も移動もしない。

| ファイル | サイズ | 参照元 |
|---|---:|---|
| `assist-effect-data.js` | 152 KB | `cards/card.html` `assist-effect-import.html` |
| `script.js` | 80 KB | `motonoyatu.html` のみ |

## 画像ディレクトリ（読み込み禁止）

`assist-abilities/`(27.6MB) `diary-img/`(25.5MB) `hiden-monsters/`(5.3MB)
`ikusei-img/`(2.6MB) `profile-img/`(1.8MB) `aptitude-images/` `monster-runner/`

`monster/` と `assist-cards/` は画像マッチング作業で使うため禁止対象から外しています。
ただし**一括で読み込まないこと**。必要な数枚だけを個別に開くこと。

## 例外を出す場合

上記を読む必要が本当に生じたときは、ファイル全体を読ませるのではなく
**処理するスクリプトを書いて実行させる**こと。

    ×  「assist-card-data.js を読んでカード名を一覧化して」
    ○  「assist-card-data.js からカード名を抽出する Node スクリプトを書いて実行して」

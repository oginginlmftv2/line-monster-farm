# lMfDB 外部能力候補監査

最終更新: 2026-08-28

対象: P12-17a（読取専用候補監査エンジン）

本番影響: ⚪（3DB、生成ページ、CMS、公開経路を変更しない）

## 1. 目的と非目的

外部`futsalife24-bot/lMfDB`の`data/abilities.json`を読み取り、ライ徹に未登録と
思われる能力を、管理者が確認するための**候補**として抽出する。

外部DBは、既存能力を更新・削除するための正本ではない。外部数値`id`も永続的な
同一性キーではなく、外部側の参考番号、同一コミット内の追跡、ID再利用検出だけに使う。

この監査は次を行わない。

- 既存能力の更新、削除、無効化、再採番
- `abilityId / cardId / linkStatus / sortOrder / flags / status`の変更
- 新規候補の登録、resolved化、公開
- `--write`、`--apply`、GAS・シート・GitHubへの送信

## 2. 入力

通常確認は外部`main`、再現可能な監査では40桁小文字のコミットSHAを指定する。

```text
https://raw.githubusercontent.com/futsalife24-bot/lMfDB/<externalSha>/data/abilities.json
```

ローカルの読取対象は次の3ファイルである。

- `src/data/assist-abilities.json`: 登録済み内容との比較
- `src/data/assist-cards.json`: カードIDと`name + rarity`の一意性検査
- `src/data/lmfdb-card-map.json`: 新規候補へのカード候補提示

対応表は新規候補に対する`sourceName + rarity → cardId`の完全一致だけを許す。
trim、括弧除去、部分一致、類似検索、表記補正は行わない。

## 3. 実行方法

```bash
node scripts/sync-lmfdb-abilities.js
node scripts/sync-lmfdb-abilities.js --sha <40桁の小文字SHA>
node scripts/sync-lmfdb-abilities.js --file /absolute/path/abilities.json
node scripts/sync-lmfdb-abilities.js --sha <SHA> --json-report /tmp/lmfdb-audit.json
node scripts/sync-lmfdb-abilities.js --sha <SHA> --show-all-representation
node scripts/sync-lmfdb-abilities.js --sha <SHA> --show-duplicate-details
```

ファイル名はPR #69の既存入口を維持するため残すが、機能は同期ではなく候補監査である。
`--show-all-representation`を指定しない限り、表記違いの詳細は先頭5件だけを出す。
`--show-duplicate-details`を指定しない限り、重複内容一致は件数だけを出す。

## 4. 取得・構造検査

HTTP失敗、15秒タイムアウト、空レスポンス、2MiB超、不正JSONを拒否し、取得した
バイト列のSHA-256を報告する。外部JSONは次を検査する。

- `schemaVersion === 1`、`generatedFrom === "ux/index.html"`
- `counts.abilities === abilities.length`
- 正の整数ID、ID重複0、必須7項目の存在と型
- `tags`が重複のない非空文字列配列
- `</script`を含む文字列がない
- sourceが`イベント / 閃き / EXトレ / 伝授`
- rarityが`MR / SSR / SR / その他`

`伝授 / SR / その他`は外部候補として正式に受理する。この段階ではライ徹3DBやGASの
許可値を変更しない。カードDBのrarity許可値とも混同しない。

構造検査に失敗した場合は`auditStatus: FAIL`、`safetyVerdict: BLOCKED`とする。

## 5. 分類順序

比較対象の6項目は`sourceName / name / description / source / rarity / tags`で、外部`card`を
`sourceName`として扱う。分類だけに内容比較を使い、永続的な同一性保証には使わない。

### 5-1. ID再利用疑い

同じ外部`id`とローカル`legacyId`が存在し、NFKC比較後も次のいずれかを満たす場合は
`ID_REUSE_SUSPECTED`とする。

- `sourceName / name / source / rarity`が同時に変わった
- 主要6項目の3項目以上が変わり、変更が`name / description / rarity`だけに限定されない
- カード文脈から2項目以上、能力内容から2項目以上が変わった

1件でもあれば`safetyVerdict: BLOCKED`とするが、監査は最後まで続ける。
既存内容差分や新規候補として二重計上しない。

### 5-2. 登録済み完全一致

6項目が完全一致するローカル能力が1件あれば`knownExact`とする。外部IDと
`legacyId`が違っても登録済みとしてよい。

### 5-3. 表記違い

保存値を変更せず、比較時だけ各文字列へ`String.prototype.normalize('NFKC')`を適用する。
正規化後に6項目が一致すれば`representationOnly`とする。

- 新規候補・主要変更へ含めない
- 既存能力を更新しない
- 低優先度で件数と少数例だけを標準出力する

### 5-4. 重複内容一致

完全一致またはNFKC比較後一致するローカル能力が複数ある場合は
`duplicate_local_content_match`とする。これは`actionable: false / priority: low`の
対応不要な監査情報である。

- 新規候補、表記違い、既存内容差分、カード対応候補、未紐付け候補へ含めない
- `ID_REUSE_SUSPECTED`、BLOCK理由、REVIEW_REQUIRED理由へ含めない
- 同じ外部数値IDの能力を含め、一致したローカル能力のどれかを優先・選択しない
- ローカル能力を更新、統合、削除せず、外部欠落能力も変更しない
- 標準出力には件数だけを出し、明示的な詳細表示時だけ外部ID、能力名、
  一致した`abilityId`一覧、一致種別を出す

### 5-5. 既存内容差分

同じ外部`id`とローカル`legacyId`が存在し、ID再利用条件には該当しない名称修正、
説明修正、rarity補完などを`existingContentDifferences`とする。自動更新せず、
新規候補にも含めない。

### 5-6. 新規候補

上記のどれにも該当しない外部能力だけを`newCandidates`とする。新規候補だけに
固定対応表を適用し、完全一致なら`card_match_candidate`、それ以外は
`unlinked_candidate`とする。cardIdやresolved状態は実データへ書き込まない。

## 6. 外部欠落の観測

外部コミットに同じ数値IDが見つからないローカル能力は
`missing_upstream_observation`として報告する。

- 削除候補・廃止候補と呼ばない
- ローカル能力を削除しない
- status、linkStatus、cardIdを変更しない
- 新規候補へ含めない

連続欠落の直後にID再利用疑いがあれば
`CONTIGUOUS_MISSING_IDS_WITH_REUSE_SUSPECTED`を関連警告として出す。

## 7. レポート

```json
{
  "auditStatus": "PASS",
  "safetyVerdict": "BLOCKED",
  "blockReasons": ["ID_REUSE_SUSPECTED"],
  "counts": {
    "newCandidates": 0,
    "knownExact": 0,
    "representationOnly": 0,
    "existingContentDifferences": 0,
    "idReuseSuspected": 0,
    "missingUpstreamObservations": 0,
    "cardMatchCandidates": 0,
    "unlinkedCandidates": 0,
    "duplicateLocalContentMatches": 0
  }
}
```

`auditStatus`は取得後の構造・比較処理が正常か、`safetyVerdict`は自動同期の安全性を示す。
現在は自動同期機能自体を実装しない。BLOCKEDでもID再利用疑い、新規候補、欠落観測を
最後まで報告する。

重複内容一致だけでは`safetyVerdict`を`BLOCKED`にも`REVIEW_REQUIRED`にもせず、
`blockReasons`と`reviewReasons`へ追加しない。

## 8. 固定コミットで確認済みの事象

外部コミット`dad5d301cc7cf3812a8c3f8ea8616642f505d61f`では、ID 1084が
ローカルの「炎獄の造物主 II / デミウルゴス」から外部の
「レネゲイドカウンター / [ボス]ヒノトリ(零)」へ全面変更されている。
これは`ID_REUSE_SUSPECTED`であり、安全性をBLOCKする。

同じ固定コミットで確認される重複内容一致22件は、対応不要な低優先度監査情報として
件数だけを通常表示する。これらをBLOCK理由へ加えず、固定コミットのBLOCK理由は
`ID_REUSE_SUSPECTED`だけとする。

ローカルID 1064〜1083は`missing_upstream_observation`として残し、ID 1084と合わせて
連続欠落・再利用警告を出す。いずれもローカルDBを変更しない。

## 9. 変更禁止範囲

- `src/data/assist-cards.json / assist-effects.json / assist-abilities.json`
- `_cms/gas/**`、GASのシート、Drive、Secrets
- `build.js`、生成カードHTML、公開HTML、sitemap.xml
- `.github/workflows/**`、公開ブランチ、main、外部リポジトリ

CMSへの候補提示、登録、公開、外部自動通知は段階3以降の別設計・別承認とする。

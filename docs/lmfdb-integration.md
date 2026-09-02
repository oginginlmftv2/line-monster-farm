# lMfDB 外部能力候補監査

最終更新: 2026-09-02

対象: P12-17a（読取専用候補監査エンジン）/ P12-17b（外部候補の手動登録設計）/
P12-17 段階4-7（本番導入・運用確定）

本番影響: この文書変更は⚪。段階4-7の管理者操作は🟡、既存アシスト公開を実行する場合は🟡🔴。
Codexは本番GAS、スプレッドシート、Script Properties、deployment、公開を操作しない。

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

対応表はカードDBの射影であり、手作業で維持しない。`build.js`が
`src/data/assist-cards.json`の並び順のまま`name / rarity / cardId`を写して
`src/data/lmfdb-card-map.json`を生成し、GASの監査APIは同じ規則でcardsシートから
その場で作る。カード追加のたびに更新が必要な固定hashで凍結しないため、CMSからの
新規カード追加・公開はそのまま通る。名前とrarityの重複だけを拒否し、
`cardMapSha256`を監査結果へ返して照合できるようにする。

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
対応表を適用し、完全一致なら`card_match_candidate`、それ以外は
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

CMSへの候補提示と登録は段階3以降の別設計・別承認とし、第10章以降に記載する。
公開と外部自動通知はこの設計でも自動化しない。

## 10. 段階3の境界（P12-17b）

P12-17bは、P12-17aの監査結果から新規能力を将来手動登録するための設計だけを確定する。
この段階ではGAS、シート、3DB、Workflow、生成処理、公開ページを変更しない。

外部DBは引き続き参考フィードであり、既存能力の更新・削除・無効化には使わない。
候補取得は読み取り専用で、時間トリガー、外部更新トリガー、自動登録、自動公開を作らない。
登録成功後も、公開は管理者が既存CMSのアシスト公開を明示実行する。

## 11. ローカル不変ID

### 11-1. 決定

新規能力も既存形式を維持し、`ab-`と10進数のローカル単調増加番号を使う。

```text
ab-0001 ... ab-1084（既存）
ab-1085 ...          （将来の新規。番号部は最低4桁で、10000以降は桁を増やす）
```

採番は`LockService.getScriptLock()`を取得したサーバーだけが行う。クライアントと外部数値IDは
`abilityId`を指定できない。ロック取得後に`abilities`全行と`ability_external_refs`の
予約済み`abilityId`を再読込し、`^ab-([0-9]{4,})$`の最大番号に1を加える。同時に
`sourceOrder`も`abilities`の最大値+1を採番する。採番済みIDは、誤登録を復旧した場合も
外部参照履歴へ残し、再利用しない。

Windowsで禁止される文字、大文字小文字の差、乱数、日時、外部IDを含まないため、JSON、URL、
静的ページ、CMS表示で安定して使える。管理画面では保存前に「サーバー採番」と表示し、
保存成功後に確定した`abilityId`を表示する。

### 11-2. 比較した案

| 案 | 判定 | 理由 |
|---|---|---|
| 既存`ab-####`のローカル連番を継続 | **採用** | 既存1,079件、CMS、JSON、将来URLとの互換性を維持できる。ScriptLock下のサーバー採番で競合を防げる |
| 新規用の別prefix | 不採用 | 新旧で検証・並び・URL規則が分岐し、外部由来かどうかを公開IDへ漏らす。由来は専用履歴で管理する |
| UUID | 不採用 | 衝突耐性は高いが、人がCMSとログで照合しにくく、既存形式との互換性を失う |

外部数値IDを`ab-####`へ変換する処理は禁止する。たまたま番号が同じでも同一性を意味しない。

## 12. `legacyId`の扱い

`legacyId`は既存1,079件を移行元へ追跡するための値として保持し、新規能力では`null`とする。
外部数値IDも、新しいローカル連番も入れない。既存の整数値は変更しない。

能力JSONは将来`schemaVersion: 2`へ上げ、次の条件にする。

- 既存移行レコード: `legacyId`は正の整数で、非null値どうしで一意
- 新規レコード: `legacyId: null`
- `null`が複数あることは重複ではない
- `legacyId`から外部能力を更新・削除しない

段階4で必要になる変更は次のとおり。この段階では変更しない。

| 対象 | 将来の変更 |
|---|---|
| JSON | abilitiesの`schemaVersion`を1から2へ上げ、nullable規則を明記する。既存1,079件の整数値は維持する |
| GAS行変換 | 空セルを`null`として読み、`null`を空セルへ往復する。既存整数を自動変換しない |
| GAS検証 | 非nullだけを正の整数・一意として検査し、新規作成APIは常にnullを設定する |
| `scripts/verify.js` | schemaVersion 2、nullable、一意性、既存1,079件の値不変を検査する |
| `scripts/verify-assist-cms.js` | GASと同じnullable規則、行変換、export往復を検査する |
| `scripts/sync-lmfdb-abilities.js` | `localByLegacyId`と外部欠落観測からnullを除外する。外部IDとの照合は既存整数だけに限定する |
| CMS画面 | `legacyId`を参照専用の「移行ID」とし、新規能力では「なし」と表示する |
| export | 新規行を`legacyId: null`で出力し、空文字や0へ変換しない |
| 既存互換性 | 既存ID、配列順、内容を変えない回帰検査を行う。buildがschemaVersionを固定確認する場合だけ2を受理させる |

`legacyId`を別列へ移す案は、既存検査・シート・JSONを二重化するだけなので採らない。
新規能力へ別のローカル数値を入れる案も、`abilityId`と同じ情報を二重保持するため採らない。

## 13. 外部参照履歴

### 13-1. 保存場所

本番スプレッドシートに内部専用の`ability_external_refs`シートを追加する。
`abilities`へ外部監査列を足す案は採らない。1つの外部数値IDが時期によって複数の実体を
指すため、能力1行に押し込むとID 1084の履歴を表現できず、公開JSONへ内部情報が混入する
危険も増える。専用シートは公開3DBへexportせず、公開ページと生成処理から参照しない。

列は次で固定する。

```text
provider
candidateKey
externalNumericId
firstSeenSha
lastSeenSha
externalFingerprint
comparisonFingerprint
externalSnapshotJson
disposition
abilityId
importedAt
importedBy
decidedAt
decidedBy
reviewFlagsJson
note
version
```

最低限の`provider / externalNumericId / firstSeenSha / lastSeenSha / externalFingerprint /
comparisonFingerprint / importedAt / importedBy / disposition`に加え、復旧と再確認に必要な
項目を持つ。`provider`の初期許可値は`lmfdb`だけとする。時刻は`nowIso_()`、操作者は
`members.nickname`からサーバーが設定し、クライアント入力を受け取らない。

`externalSnapshotJson`は外部の`id / card / name / desc / source / rarity / tags`だけを
固定順で保存する。秘密値、URL、メールアドレスは保存しない。シートの通常バックアップに
含まれるため、本番bookのコピーから復旧できる。

### 13-2. 候補の識別とfingerprint

- `externalFingerprint`: 外部原文6項目`sourceName / name / description / source / rarity / tags`を
  固定キー順のJSONにし、保存値を一切変えずSHA-256した小文字64桁
- `comparisonFingerprint`: 同じ6項目の各文字列だけへNFKCを適用し、固定キー順のJSONを
  SHA-256した小文字64桁。tagsの順序はP12-17aと同じく維持する
- `candidateKey`: `provider + LF + externalNumericId + LF + externalFingerprint`のSHA-256

同じ外部数値IDでも原文fingerprintが違えば別行になるため、ID再利用履歴を失わない。
同じ`candidateKey`の行は1件だけとし、再確認では`lastSeenSha`、disposition、note、versionを
更新する。候補取得中はシートを書き換えず、管理者が「無視」「重複」「対象外」などを
確定した時だけ履歴へ保存する。`firstSeenSha / lastSeenSha`は「読み取った全回数」ではなく、
最初と最後に管理者が処置を確定した監査SHAを表す。

`disposition`は`imported / ignored / duplicate / unsupported / id_reused / reverted`とする。
`reverted`は復旧手順だけが設定できる。ID再利用を確認したうえで登録した行は
`disposition: imported`、`reviewFlagsJson: ["id_reused"]`として両方の事実を残す。

監査一覧は、同じcandidateKeyが`imported / ignored / duplicate / unsupported`なら通常表示から
除外し、管理者が「処置済みを表示」を選んだ場合だけ再表示する。`id_reused`は確認対象として
残す。外部から消えてもこのシートとローカル能力を削除・変更しない。

### 13-3. 実行時間

候補監査APIは外部JSONを1回取得し、`cards / abilities / ability_external_refs`を各1回の
`getDataRange().getValues()`で読み、メモリ上のMapで分類する。候補ごとのシート読込や
HTTP要求を行わない。一覧は既定50件ずつ返し、折りたたみ対象の詳細は要求時だけ返す。
これにより現在約2,000行に履歴が増えてもGASの6分制限内に収める。

## 14. 新規登録専用API

将来実装する入口は`api_asstCreateAbilityFromExternalCandidate(payload)`とする。
既存の`api_asstSaveAbility()`は既存行の編集専用のまま維持し、作成APIから呼ばない。

### 14-1. クライアント契約

```js
{
  auditVersion: 3,
  provider: 'lmfdb',
  externalSha: '<40桁の小文字SHA>',
  candidateKey: '<64桁SHA-256>',
  externalNumericId: 1234,
  externalFingerprint: '<64桁SHA-256>',
  expectedAbilitiesVersion: '<能力行のID/version/updatedAtから作ったSHA-256>',
  registration: {
    sourceName: '外部原文または管理者の確定値',
    name: '管理者の確定値',
    description: '管理者の確定値',
    source: 'イベント',
    rarity: 'MR',
    tags: [],
    linkStatus: 'resolved',
    cardId: '...またはnull'
  },
  confirmations: {
    originalCompared: true,
    normalizationReviewed: true,
    cardReviewed: true,
    idReuseReviewed: false
  }
}
```

クライアントは`abilityId / legacyId / sourceOrder / sortOrder / status / flags / version /
updatedAt / updatedBy / importedAt / importedBy / disposition / comparisonFingerprint`を送れない。
余分なキーがあれば拒否する。監査情報は、サーバーが指定SHAの外部JSONを再取得して候補を
再分類し、原文から再計算する。これにより任意入力による監査情報の偽装を防ぐ。

成功時は次を返す。

```js
{
  ok: true,
  abilityId: 'ab-1085',
  legacyId: null,
  status: 'draft',
  linkStatus: 'resolved',
  sortOrder: 4,
  externalSha: '<SHA>',
  externalFingerprint: '<fingerprint>',
  validation: 'PASS'
}
```

### 14-2. サーバー処理

1. assist権限を持つ利用者を確定する
2. `ScriptLock`を待たずに取得する。取れなければ他の保存・公開との競合として拒否する
3. 外部`main`の現在SHAを解決し、payloadのSHAと違えば「候補が更新済み」として拒否する
4. 指定SHAのJSONを再取得し、P12-17aと同じ構造検査・分類・fingerprint計算を行う
5. `expectedAbilitiesVersion`を現在の能力行から再計算し、不一致なら再監査を要求する
6. `abilities / cards / ability_external_refs`を再読込し、以下の拒否条件を全て検査する
7. `abilityId / sourceOrder / resolved時sortOrder`をサーバー採番する
8. 追加前の両シート行数を記録し、新しい能力1行と参照履歴1行だけを追加する
9. 3DB全体と追加行を再検査する。失敗時は追加した2行だけを除去し、行数が元へ戻ったことを検算する
10. `assist_log`へ実行者、外部SHA、外部数値ID、fingerprint、新abilityId、直後検証結果を記録する
11. ロックを解放し、確定IDを返す。公開処理は呼ばない

Google Sheetsには複数シートのトランザクションがないため、8〜9を補償トランザクションとして
扱う。書込み前に対象行番号と行数を固定し、catch時はその2行以外を触らない。除去後の行数検算に
失敗した場合は全保存・公開を停止するissueを返し、第17章のバックアップ復旧へ進む。

段階4では、カード・効果・能力の保存とアシスト公開が同じScriptLockを使うよう統一する。
現行`api_asstPublish()`はロックを持たないため、作成API実装と同じ小段階で是正する。

### 14-3. 必須拒否条件

- 生成予定またはクライアント由来の`abilityId`が既存・予約済み、または採番後に衝突する
- 同じ`candidateKey`が登録済み、または同じ外部候補が`imported`である
- 外部原文または管理者が編集した登録予定値の主要6項目が、既存能力と完全一致、
  またはP12-17aの比較用NFKC後に一致する
- `ID_REUSE_SUSPECTED`なのに`idReuseReviewed !== true`
- `sourceName / name / description / source / rarity`が空、tagsが不正
- sourceが`イベント / 閃き / EXトレ / 伝授`以外
- rarityが`MR / SSR / SR / その他`以外
- `resolved`のcardIdが存在しない、またはカード確認がない
- `resolved`なのに対象カードの既存sortOrderが1からの連番でない
- `unlinked`なのにcardIdまたはsortOrderが指定されている
- `ambiguous`を新規登録へ指定する
- auditVersion、外部SHA、externalFingerprint、candidateKey、expectedAbilitiesVersionが古い・不一致
- 他のカード・効果・能力保存、OCR予約、アシスト公開が同じScriptLockを使用中
- 外部監査結果がFAIL、または候補が新規候補・確認済みID再利用候補のどちらでもない
- クライアントが内部監査列、採番値、初期statusを指定する

既存行を更新する分岐、upsert、外部内容による補完は置かない。成功時のデータ変更は新しい
能力1行、外部参照1行、`assist_log`1行だけである。

処置だけを記録する別APIは`api_asstSetExternalCandidateDisposition(payload)`とし、
`ignored / duplicate / unsupported / id_reused`だけを受け付ける。これも候補をサーバーで再取得・
再計算し、任意の監査情報を保存させない。

### 14-4. 読取API

候補監査の入口は`api_asstAuditExternalAbilities(payload)`とする。payloadは省略可能な
40桁の固定SHAと、一覧のpage/pageSizeだけを受け付ける。`pageSize`は1〜1000の整数で、
省略時は50とする（2026-09-02にCMS画面の一括取り込みへ合わせて上限を50から1000へ引き上げた。
既定値と応答構造は変えていない）。SHA省略時は外部`main`を完全な
コミットSHAへ解決してから取得し、応答へ`auditVersion / externalSha / externalSha256 /
expectedAbilitiesVersion / auditStatus / safetyVerdict / counts / candidates`を返す。

このAPIは3DBとシートを一切書き換えず、Script Properties、トリガー、キャッシュを正本にしない。
画面は応答のSHAとversionを作成APIへ返すが、作成APIはそれらを信用せず再取得・再計算する。

## 15. CMS画面

トップレベルの「アシストカード」内へ「外部能力DBを確認」を追加し、次の順に進める。

```text
外部能力DBを確認
  → 監査サマリー
  → 新規候補一覧
  → 候補詳細
  → 外部原文と登録予定値の左右比較
  → 管理者が登録値を修正し、カード候補を確認
  → 最終プレビューと確認チェック
  → 新規能力として保存（status: draft）
  → 既存の能力編集で確認後にverified
  → 管理者が既存のアシスト公開を明示実行
```

一覧は次の優先順とし、4〜7は新規登録ボタンを持たない。

1. カード対応候補
2. 未紐付け候補
3. ID再利用疑い
4. 既存内容差分
5. 表記違い
6. 重複内容一致
7. 外部欠落観測

表記違い、重複内容一致、外部欠落観測、処置済み候補は既定で折りたたむ。
監査サマリーには外部コミットSHA、JSON SHA-256、監査状態、安全性、分類別件数、
処置済み件数を表示する。

候補詳細には、外部コミットSHA、外部数値ID、外部原文、比較用正規化結果、登録予定値、
完全一致・NFKC一致・類似する既存能力、`sourceName / name / description / source / rarity /
tags / cardId候補 / linkStatus / sortOrder / status`を表示する。sortOrderとabilityIdは
「保存時にサーバー採番」と表示し、編集欄にしない。

外部原文と登録予定値は差分を強調し、最終プレビューには、候補取得後にDBが変わっていないか、
カードリンク、`draft`であること、公開されないことを表示する。登録成功画面から公開を自動実行しない。

### 15-1. 取り込み結果の再利用・タブ内ページ送り・検索（2026-09-02）

読取APIの契約（`externalSha / page / pageSize`だけ、pageSize 50）は変えない。画面側の扱いだけを
次のとおりにする。

- 「外部能力DBを確認」または「最新状態で再監査」で、`pageSize`1000の1回の呼び出しで
  全候補を取り込み、1つの配列としてメモリ上に保持する。候補が1000件を超える場合だけ、
  1ページ目の解決SHAへ固定したまま`page`を進めて残りを取得し、同じ配列へ結合する。
  途中で`externalSha`または`expectedAbilitiesVersion`が変わったら結合せず停止し、
  取り込み直しを促す
- タブ切り替え、検索、ページ送りではAPIを呼ばない。再取得は
  「最新状態で再監査」「同じ条件で再試行」「登録・処置の保存後の再監査」だけとする
- ページ送りは選択中のタブだけを対象にし、20件ずつ表示する。タブ切り替え・検索・
  処置済み表示の切り替えで1ページ目へ戻す。タブ件数は`counts`ではなく、
  取り込み済み候補へ処置済み表示と検索を適用した実数を表示する
- 検索は能力名（`name`）、元のカード名（`card / sourceName`）、`cardIdCandidate`、
  外部数値IDを対象に、NFKC・小文字化・空白除去して部分一致で絞り込む。
  入力中は絞り込まず、「検索」ボタンまたは確定後のEnterで適用する（IME変換中のEnterは無視する）。
  日本語入力の変換前ローマ字で確定してしまうのを避けるため、ライブ検索にしない

取り込み結果はメモリだけに置く。`localStorage`・`sessionStorage`・Cookie・GASのCacheServiceへ
保存しない（`scripts/verify-assist-cms.js`がFAILにする）。画面を離れる・再読み込みすると
破棄され、次回は再監査からやり直す。固定SHAの監査結果を古いまま再利用しないための制約である。

### 15-2. 応答のnull項目の正規化（2026-09-02）

GASの`google.script.run`は、返り値のオブジェクトから値が`null`の項目を落として渡すことがある。
`missing_upstream_observation`のように`externalSnapshot / candidateKey / cardIdCandidate`などが
`null`の候補は、画面側で`undefined`として届き、応答構造検査が「externalSnapshotが不正です」で
止まっていた。50件ページングの間は優先順の低いこれらの候補が1ページ目に載らず表面化しなかったが、
一括取り込みで全候補を受け取るようになって顕在化した。

画面側では応答を検査する前に、`candidateKey / externalFingerprint / comparisonFingerprint /
externalSnapshot / sameIdComparison / cardIdCandidate / disposition / localObservation /
changedFields / comparison`の未定義を`null`へ、`auditOnly / requiresIdReuseConfirmation`の
未定義を`false`へ、一致abilityId配列の未定義を空配列へそろえてから判定する。
`processed / registrationEligible / classification / externalNumericId`は必須項目のままで、
型が違えば従来どおり構造不正として拒否する。構造不正のメッセージには何件目・外部数値ID・分類を添える。

サーバー側の応答（`api_asstAuditExternalAbilities`）の契約は変更しない。

### 15-3. 自動候補がない候補の手動カード紐付け（2026-09-02）

対応表は`sourceName + rarity`の完全一致だけを見るため、外部側が「ジュリア（ライバル）」の
ようにカード名へ補足を付けている場合、こちらの「ジュリア（MR）」と一致せず
`unlinked_candidate`になる。予測精度の改善では限界があるので、候補詳細から管理者が
紐付け先カードを選べるようにする。

- 候補詳細の「カード対応」に、カードDB（`ASST.cards`）から選ぶ`cardId`のselectを置く。
  既定値は自動候補があればそれ、無ければ未選択とする
- `linkStatus: resolved`は、カードDBが読み込めているかぎり自動候補の有無にかかわらず選べる。
  選択が空、またはカードDBに無い`cardId`のときはクライアント検査で拒否する
- 画面には「自動候補cardIdCandidate」「選択中のカード」「選択の由来（未選択／自動候補と一致／
  手動で選択）」を並べ、手動選択であることを最終プレビューでも確認できるようにする
- `unlinked`を選んだ場合は選択に関係なく`cardId: null`で送る

対応表の照合規則（完全一致のみ、trim・部分一致・類似検索をしない）は変更しない。
サーバー側も変更しない。`api_asstCreateAbilityFromExternalCandidate`は元から
`resolved`のcardIdを「cardsシートに実在するか」だけで検査し、自動候補との一致は要求していない。
`sortOrder`は選んだカードの末尾へサーバーが採番し、statusは`draft`のままである。

### 15-4. 保存予定（メモリ）とまとめて保存（2026-09-02）

1件決めるたびに書込みと再監査が走ると確認が進まないため、決定をメモリへ貯めてから
まとめて書き込む。

- 候補詳細の「保存予定に追加」（新規登録）と「処置を保存予定に追加」で、決定内容を
  `ASST.audit.pending`へ積む。この時点ではAPIを呼ばず、データも変わらない。
  同じ候補を再度追加する場合は確認のうえ置き換える
- 一覧の「まとめて保存（N件）」で順に書き込む。送信payloadは保存時点の
  `externalSha / expectedAbilitiesVersion` と、再監査済み候補の`candidateKey / fingerprint`から
  組み立て直す。追加時点のpayloadを使い回さない
- 処置は`abilities`を変えないため`expectedAbilitiesVersion`が変わらず、続けて送れる。
  新規登録は1件ごとに`expectedAbilitiesVersion`が変わるので、成功後に固定SHAのまま
  再監査してから次へ進む。最後に必ず1回再監査する
- 失敗した項目は保存予定に残し、結果一覧へ理由を出す。候補が再監査で特定できない、
  登録できない状態になった場合はその項目だけ飛ばして次へ進む
- 保存後の再監査に失敗した場合は1度だけやり直し、それでも失敗したら中断する。
  中断・失敗のどちらでも、未処理の項目は保存予定へ残す（処理順のスナップショットを
  `batch.entries`に持ち、`batch.done`以降を残す）。失われる保存予定を作らない
- 保存予定はメモリだけに持つ。画面を離れる・再読み込みで消える（永続化しない方針は15-1と同じ）
- 保存結果は、全件成功なら12秒（`ASST_AUDIT_MESSAGE_MS`）で自動的に消す。
  失敗を含む場合は残し、「この結果を閉じる」で閉じる

サーバーAPIと契約は変更しない。1回の呼び出しで書けるのは従来どおり1件で、
サーバーは毎回再取得・再計算して検査する。

## 16. 登録値、状態、カード紐付け

### 16-1. 比較用と保存用の正規化

比較用正規化はP12-17aと同じで、主要6項目の各文字列だけへNFKCを適用する。
重複判定と候補分類だけに使い、保存値、画面の編集欄、外部原文へ反映しない。

保存用は「自動補正」ではなく、管理者が最終プレビューで確定した値を保存する。

自動で許可する処理:

- フォーム通信上のCRLF/CRをLFへ統一する
- JSONの型検査、必須値検査、許可値検査を行う
- description内は既存仕様どおり`<br>`だけを改行表現として許可し、他のHTMLタグを拒否する
- 制御文字、`</script`、空タグ、重複タグを拒否する

自動で禁止する処理:

- NFKCを保存値へ適用する
- 全角・半角、括弧、ローマ数字、記号、空白、句読点、プラス・マイナスを一律変換する
- OCR効果用の`normalize` / `sanitize`を能力テキストへ流用する
- 誤字と思われる文字を推測で直す、tagsを説明から推測する、sourceやrarityを置換する
- `sourceName`の類似名からcardIdを自動確定する

管理者は外部原文を残したまま登録予定値だけを手修正できる。変更箇所、比較用NFKC結果、
保存される文字列を並べ、チェック後の値だけを保存する。

### 16-2. source / rarity

能力側の新規登録許可値を次へ拡張する。カードDBのrarity許可値とは別の定数・検査にする。

```text
source: イベント / 閃き / EXトレ / 伝授
rarity: MR / SSR / SR / その他
```

既存の`rarity: null`36件は移行データとして保持するが、新規能力ではnullを拒否する。
`伝授 / SR / その他`も候補一覧と登録対象に含める。対応カードが無ければunlinkedとし、
cardIdを推測しない。ボス、育成論、師匠版を類似名で自動対応しない。

### 16-3. resolved / unlinked / ambiguous

- 対応表`sourceName + rarity → cardId`は候補提示だけに使い、自動保存しない
- `resolved`: 管理者が候補カードを確認した場合だけ選べる。サーバーが対象カード内の
  最大sortOrder+1を採番し、クライアントのsortOrderは受け付けない
- `unlinked`: カードが無い・確定できない場合に登録できる。cardId / sortOrderはnull
- `ambiguous`: 既存移行データの未解決状態として残すが、外部候補の新規登録には使わない。
  複数候補がある場合はunlinkedで保存し、後で既存能力編集から解決する

### 16-4. statusと公開表示

新規登録は常に`status: draft`とする。外部DBに存在すること、カード候補が一致したこと、
登録APIの検査が通ったことだけではverifiedにしない。登録後に既存能力編集を開き直し、
管理者が原文、保存値、カード対応を確認した明示操作でだけverifiedへ変更する。

候補の処置状態は`ability_external_refs.disposition`、能力DBの公開確認状態は`status`であり、
混同しない。公開生成は、既存の「resolved以外を表示しない」を維持したうえで、
`status: verified`も必須にする。したがってdraftのresolved能力は公開操作が行われても表示せず、
カードのindex/noindex判定にも数えない。段階4では`build-assist-pages.js`と検査をこの条件へ
合わせる必要がある。

verifiedへ変更するプレビューでは、その能力を加えた場合のカード可視本文字数と
index/noindexの変化を表示する。公開前検査でも、新能力によって変わるカード一覧を表示する。

## 17. 同時実行、公開、復旧

### 17-1. 同時実行と公開

- 外部候補の取得・分類・画面表示はシートを書き換えず、ScriptLockを取らない
- 候補の処置保存と新規登録だけがScriptLockを取る
- カード・効果・能力保存、OCR利用予約、アシスト公開も同じScriptLockへ統一する
- ロックが取れない場合は待って続行せず、再読込を案内して拒否する
- ロック取得後に能力、カード、履歴、外部SHAをすべて再検査する
- 新規登録後も自動export、自動GitHub送信、自動公開を行わない
- 管理者が既存アシスト公開を押したとき、3DB全体、画像、ID、sortOrder、draft非表示を検査する

### 17-2. 保存記録

`ability_external_refs`と`assist_log`により、最低限次を一意に追跡できるようにする。

- 保存前の`abilities`と`ability_external_refs`の行数
- 追加したabilityIdとsourceOrder
- 外部コミットSHAと外部数値ID
- externalFingerprintとcomparisonFingerprint
- 操作者、保存日時
- 追加直後の3DB検証結果

`assist_log.detail`には上記を固定キー順のJSONで保存し、自由文だけにしない。

### 17-3. 誤登録の復旧

CMSへ汎用の能力削除ボタンは追加しない。誤操作で既存能力を消せる面を増やさないためである。
復旧は管理者手順とし、`abilityId + candidateKey + externalFingerprint`の3点で、P12-17b経由で
追加した1行だけを特定する。

1. アシスト公開前なら、対象行を`draft`のままにして公開を止める
2. 保存直後で対象がabilities末尾かつカード内sortOrder末尾なら、日付・abilityId入りの
   一回限りの管理者grantを使う復旧関数で能力行だけを除去する
3. 外部参照行は削除せず`disposition: reverted`へ変え、abilityIdを予約済みとして残す
4. 後続能力があり物理削除で順序へ影響する場合は削除せず、対象の追加行だけを
   `status: draft / linkStatus: unlinked / cardId: null / sortOrder: null`へ戻し、
   `reverted-external-import`フラグを付ける。既存行と後続行を並べ替えない
5. 直後に3DB検査を通し、assist_logへ復旧者、日時、理由、検証結果を記録する
6. すでに公開済みなら、まず対象を上記状態へして既存のアシスト公開を実行する。
   mainの他の能力を過去版へ巻き戻さない

補償書込みの行数検算に失敗した場合や、対象を3点で一意に特定できない場合は作業を止め、
保存前の本番bookコピーから対象2シートを比較して管理者が復旧する。自己判断で行削除しない。

## 18. 段階4の実装単位

段階4は次の7タスクへ分け、各タスクで検査を通してから次へ進む。一度にGAS画面、保存、
本番反映を実装しない。

1. **ローカルID・legacyId・外部参照のスキーマ検査**
   schemaVersion 2、nullable legacyId、`ab-`採番器、`ability_external_refs`、既存1,079件不変の
   検査を先に実装する。test/rehearsalシートだけで確認する
2. **GASの読取API**
   固定SHA取得、P12-17a相当の構造検査・分類・fingerprint、履歴照合、監査サマリーを返す。
   シート書込み、トリガー、登録はまだ作らない
3. **CMSの監査サマリーと候補一覧**
   優先順、50件ページング、折りたたみ、処置済み表示を実装する。保存ボタンはまだ置かない
4. **候補詳細・編集プレビュー**
   原文、NFKC比較、登録予定値、既存一致、カード候補、最終確認を表示する。登録はまだ行わない
5. **testシートへの追加専用API**
   ScriptLock、サーバー採番、二重再検査、補償書込み、draft、履歴・ログをtest/rehearsalだけで実装する
6. **重複・競合・部分書込みの破壊テスト**
   abilityId衝突、同一候補、完全/NFKC重複、ID再利用未確認、古いSHA/version、未知cardId、
   sortOrder不整合、ロック競合、2シートの各書込み失敗、補償失敗、draft公開除外を破壊して拒否を確認する
7. **本番移行と公開確認**
   管理者承認後にシートバックアップ、GAS同期・deployment、未紐付け1件とresolved 1件の
   test登録、3DB検査、手動公開、カード表示・index影響、復旧手順を確認する

各タスクは独立ブランチ・PRとし、段階6まで本番GAS、シート、公開経路を変更しない。

## 19. 段階4-7 本番導入前監査（2026-08-29）

基準は`origin/main`のマージコミット`87ee245`で、段階4-1〜4-6のマージをすべて含む。
監査時の作業ツリーはclean、モンスターは352体、カード91件、効果888件、能力1,079件だった。

| 確認項目 | 結果 | リポジトリ上の根拠 |
|---|---|---|
| 段階4-1〜4-6 | PASS | PR #71〜#76のマージコミット`38cd56f`、`0d71ac9`、`b128c34`、`051e88d`、`1265455`、`87ee245` |
| 読取API | PASS | `api_asstAuditExternalAbilities()` |
| 監査UI・詳細プレビュー | PASS | `ui_assist.html`の「外部能力DBを確認」、候補詳細、左右比較、最終プレビュー |
| 追加専用登録API・処置API | PASS | `api_asstCreateAbilityFromExternalCandidate()` / `api_asstSetExternalCandidateDisposition()` |
| 書込み失敗時の復旧 | PASS | 対象行限定の操作ジャーナル、逆順補償、一意確認、補償失敗時の重大停止 |
| abilityId採番 | PASS | 外部IDを使わず、abilitiesと予約済みIDの最大`ab-####` + 1 |
| 新規legacyId | PASS | 常に`null`。Sheetでは空セルと往復する |
| 初期status | PASS | 常に`draft` |
| resolved | PASS | 実在する確認済みcardIdが必須。sortOrderはサーバー採番 |
| unlinked | PASS | cardIdとsortOrderは`null` |
| NFKC | PASS | 比較・重複検査専用。保存値へ適用しない |
| ID再利用疑い | PASS | `ID_REUSE_SUSPECTED`として分離し、通常候補として自動登録しない。ID 1084は本番最小登録対象外 |
| draft非公開 | PASS | 生成対象は`linkStatus: resolved && status: verified`だけ |
| 既存CMS公開フロー | PASS | 既存2 Workflow、公開ブランチ、許可リスト、concurrencyを維持 |

導入前に実行した検査:

```text
node scripts/test-sync-lmfdb-abilities.js             25件 PASS
node scripts/test-asst-lmfdb-read-api.js              19件 PASS
node scripts/test-asst-lmfdb-audit-ui.js              32件 PASS
node scripts/test-asst-lmfdb-create-api.js            22件 PASS
node scripts/test-asst-lmfdb-write-safety.js          26件 PASS
node scripts/test-verify-assist-cms.js                 85破壊ケースをすべて拒否
node scripts/verify.js                                 PASS 83 / FAIL 0 / WARN 0 / SKIP 0
```

能力DBは`schemaVersion: 2`、既存1,079件の`abilityId`、legacyId、内容、配列順を
verifierが固定検査する。監査時点では新規由来の`legacyId: null`と`status: draft`は0件であり、
本番最小登録後は選択した1件だけが増える想定である。

## 20. 管理者向け本番導入手順

以下は管理者が実施する。秘密値、スプレッドシートID、deployment URL、tokenの一部を含め、
値そのものをチャット、文書、スクリーンショットへ載せない。項目の不一致、想定外のシート、
352体以外のモンスター件数、既存3DB件数の不一致が1つでもあれば、その時点で停止する。

### A. 本番操作前の確認

1. 本番スプレッドシートを開き、名称、所有者、既存シート、`members`のA1 noteが
   `LMF CMS production`であることを確認する。noteは変更しない。
2. `monsters`のデータ行が352件であることを確認する。名前、ID、配列順、各セルは変更しない。
3. `cards` 91件、`assist_effects` 888件、`abilities` 1,079件であることを確認する。
   件数が違えばrehearsalとの差または未公開編集の可能性があるため停止する。
4. 本番Apps Scriptプロジェクトを開き、所有者、現在のdeployment、実行ユーザー、アクセス範囲が
   日常運用中の統合CMSであることを確認する。ここではまだ保存しない。
5. Script Propertiesは値を表示・共有せず、キーの有無と指し先だけを管理画面内で確認する。
   必須の既存キーは`ENVIRONMENT`、`SPREADSHEET_ID`、`DRIVE_FOLDER_ID`、`GITHUB_TOKEN`、
   `ASSIST_IMAGE_FOLDER_ID`、`GOOGLE_CLOUD_VISION_API_KEY`、`OCR_DAILY_LIMIT`である。
   `OCR_DAILY_USAGE`はGASが管理する日次カウンタであり、手入力や移送をしない。
6. `ENVIRONMENT=production`相当で、`SPREADSHEET_ID`が手順1の本番bookを指すことを確認する。
   rehearsalのbook ID、`ENVIRONMENT=rehearsal`、一時プロジェクトの設定が混入していれば停止する。
7. `members`で作業者がactiveであり、`role=admin`、`scopes`に`assist`を含むことを確認する。
   他メンバーの権限を広げない。

### B. バックアップと復旧点

8. 本番スプレッドシート全体の復旧可能なコピーを作る。コピー名は
   `YYYY-MM-DD HHmm P12-17導入前 ライ徹CMS`のように、実施日時と導入前であることを含める。
9. Apps Scriptの「デプロイを管理」と「プロジェクト履歴」で、現在のdeployment ID、version、
   作成日時、実行ユーザー、アクセス設定を値を公開せず管理者台帳へ記録する。
10. 復旧対象を次で固定する。
    - コードまたは画面の不具合: deploymentを手順9の直前versionへ戻す。
    - `setup1_createSheets`で既存シートへ想定外の変更: CMS操作を止め、手順8のコピーと比較し、
      管理者の復旧作業として影響したシートだけを導入前へ戻す。破壊的importを再実行しない。
    - 最小登録の通常失敗: 操作ジャーナルの自動補償結果と行数を確認し、手で行削除しない。
    - 補償失敗または一意特定不能: 全保存・公開を止め、`abilities`、
      `ability_external_refs`、`assist_log`をコピーと比較してから別の復旧作業に分ける。

### C. GAS同期とスキーマ導入

11. リポジトリ`_cms/gas/manifest.json`とApps Scriptのファイル名を照合する。
    Apps Scriptへ同期するのは次の11ファイルで、`README.md`はリポジトリ内の運用文書なので同期しない。

```text
00_core.gs
10_monster.gs
20_assist.gs
25_lmfdb_write.gs
30_publish.gs
40_setup.gs
index.html
ui_common.html
ui_monster.html
ui_assist.html
ui_publish.html
```

12. 上記11ファイルを同名ファイルへ同期する。内容が同じファイルも含め、ファイル名を取り違えない。
    manifest外の既存ファイルを自己判断で削除せず、余剰や不足があれば保存前に停止する。
13. 保存し、Apps Scriptエディタに構文エラーや未解決の関数参照が出ないことを確認する。
14. `abilities`のヘッダーが次の17列と完全一致することを確認する。並べ替え、列追加、既存値変換をしない。

```text
sourceOrder, abilityId, legacyId, cardId, sourceName, name, description, source,
rarity, tagsJson, sortOrder, linkStatus, flagsJson, status, version, updatedAt, updatedBy
```

15. `setup1_createSheets`を1回実行する。期待結果は既存シートの変更なし、
    `ability_external_refs`が無ければ新規作成、既に正しいヘッダーで存在すれば作成なしである。
    `要確認`が`なし`以外なら停止する。
16. `ability_external_refs`のヘッダーが第13章の17列と完全一致し、導入前のデータ行が0件であることを確認する。
    既存能力1,079件に対する参照行を一括生成しない。
17. `setup4_checkAll`を実行する。期待するassist結果は
    `cards=91 / effects=888 / abilities=1079 / issues=[]`である。
    この確認で能力exportがschemaVersion 2、nullable legacyId対応であることを検査する。
18. 手順14〜17の前後で`abilities` 1,079件の内容・行順・legacyIdが変わっていないこと、
    `cards`、`assist_effects`、`monsters`の件数と内容が変わっていないことを確認する。

### D. deployment更新

19. 構文・setup結果に問題がない場合だけ、新しいversionを作成する。
20. 既存Webアプリdeploymentをそのversionへ更新する。新規の別URLへ切り替えず、
    実行ユーザーとアクセス設定を手順9の本番契約から変更しない。URLをチャットへ貼らない。
21. deployment更新に失敗した場合は再保存を繰り返さず、直前versionへ戻して停止する。

### E. 読取専用の本番確認

22. 更新後CMSを開き、通常のモンスター一覧・カード一覧・カード編集・効果・OCR・能力・公開タブが
    従来どおり見えることを確認する。保存、OCR送信、公開はまだ行わない。
23. 「外部能力DBを確認」を開き、最初はSHAを指定せず監査する。
24. `auditStatus=PASS`で最後まで完走することを確認する。`safetyVerdict=BLOCKED`の場合、
    `blockReasons`が既知の`ID_REUSE_SUSPECTED`だけであることを確認する。
25. 外部コミットSHA、外部JSON SHA-256、次の分類件数を記録する。

```text
newCandidates / knownExact / representationOnly / existingContentDifferences /
idReuseSuspected / missingUpstreamObservations / cardMatchCandidates /
unlinkedCandidates / duplicateLocalContentMatches / processed
```

26. ID 1084が`ID_REUSE_SUSPECTED`として分離され、通常のカード対応候補・未紐付け候補に
    混ざらないことを確認する。本番最小登録の対象には選ばない。
27. 表記違いと重複内容一致が低優先度の監査情報であり、既存更新や登録を促さないことを確認する。
28. 監査前後で全シートの最終行、主要件数、更新日時が変わっていないことを確認する。
29. 過去の118件などとの完全一致は要求しない。外部SHAや分類件数が過去値と違う場合は、
    新しいSHA、総件数差、分類差を報告する。理由を説明できない差、未知のBLOCK理由、
    schema差、ID衝突があれば書込み前に停止する。

### F. 本番での最小書込み確認

30. 手順22〜29がすべて正常な場合だけ、管理者が新規候補を1件選ぶ。次をすべて満たすこと。
    - `registrationEligible=true`、`processed=false`
    - `ID_REUSE_SUSPECTED`、`duplicate_local_content_match`、既存内容差分、表記違い、外部欠落ではない
    - 外部原文と登録予定値を人が照合できる
    - 可能なら最初は確実な未紐付け候補。resolvedを選ぶ場合はカード対応を人が確認できる
31. 登録直前に`abilities`、`ability_external_refs`、`assist_log`のデータ行数を記録する。
32. 最終プレビューで、外部原文、保存値、NFKCは比較だけであること、カード対応、
    `legacyId=null`、`status=draft`、自動公開されないことを確認して1回だけ登録する。
33. 登録後、次を確認する。
    - 新しいabilityIdが外部IDと無関係なローカル`ab-`連番
    - legacyIdはnull（Sheet上は空セル）、statusはdraft
    - unlinkedならcardId/sortOrderは空、resolvedなら確認済みcardIdとサーバー採番sortOrder
    - abilitiesは1行だけ、ability_external_refsは1行だけ、assist_logは設計どおり1行だけ増加
    - 既存能力1,079件、カード91件、効果888件、モンスター352体は不変
34. 同じcandidateKeyをもう一度登録し、重複として拒否されることを確認する。
    拒否後に3シートの行数が増えていないことも確認する。
35. 同じ固定SHAで監査を更新し、対象が登録済み・処置済みとして識別され、通常候補から外れることを確認する。
36. 能力編集画面では新規能力がdraftであること、公開カード詳細・公開能力一覧には出ていないことを確認する。
    verifiedへの変更とアシスト公開はこの最小書込み確認では行わない。
37. 本番で障害注入、途中失敗、補償処理の故意発生、シート破損を試さない。
    補償安全性は第19章のmock破壊テスト26件を証跡とする。

## 21. 管理者から受け取る本番導入結果

秘密値を含めず、次の票を同じチャットへ返す。成功条件が1つでも未確認・失敗なら、
Codexはcommit、push、PR、mergeへ進まず、必要なら復旧手順だけを提示する。

```text
本番前バックアップ作成: 成功 / 失敗
スキーマ確認・必要な初期化: 成功 / 失敗
GAS同期・保存: 成功 / 失敗
deployment更新: 成功 / 失敗
CMS通常機能: 正常 / 異常
外部監査: 成功 / 失敗
auditStatus:
safetyVerdict:
blockReasons:
外部コミットSHA:
外部JSON SHA-256:
各分類件数:
読取監査前後のシート変更なし: 確認済み / 未確認
最小登録確認: 成功 / 未実施 / 失敗
登録した候補のexternal IDまたはcandidateKey:
発行されたローカルabilityId:
abilities増加数:
ability_external_refs増加数:
assist_log増加数:
status=draft: 確認済み / 未確認
legacyId=null: 確認済み / 未確認
既存能力1,079件・カード91件・効果888件・モンスター352体不変: 確認済み / 未確認
draft非公開: 確認済み / 未確認
重複登録拒否: 確認済み / 未確認
想定外事項: なし / 内容
```

## 22. 成功報告後のリポジトリ作業

管理者報告の全成功条件を確認してから、Codexが次を行う。

1. 本文書、`docs/PROGRESS.md`、必要な場合だけ`docs/ライ徹_開発計画.md`へ結果を最小限追記する
2. P12-17段階4-7を完了として同期し、運用がCMSからの手動監査・追加登録であることを明記する
3. 外部データを正本にせず、既存更新・削除・自動同期・自動公開を行わないことを明記する
4. 本番GAS、Sheet、Script Properties、deployment操作は管理者が実施したと記録する
5. 関連テストと`node scripts/verify.js`を再実行する
6. 差分確認後にcommit、push、PRを作成する
7. GitHub Actions成功後にmainへマージし、Pages deployment成功を確認する
8. ローカルmainを最新化し、作業ブランチをローカル・リモートから削除する

## 23. 段階4-7 本番導入結果（2026-08-30）

本番GAS、スプレッドシート、Script Properties、deploymentは管理者が操作し、Codexは操作していない。
導入前バックアップ、schemaVersion 2・nullable legacyId対応、`ability_external_refs`初期化、
GAS同期・保存、deployment更新、CMS通常機能をすべて成功確認した。

読取監査は外部コミット`dad5d301cc7cf3812a8c3f8ea8616642f505d61f`、外部JSON SHA-256
`5e7ab00fedd8bef40d0f974a8b8eedaea084b094357d36f1b1deeea1e35df292`でPASSした。
安全性は既知の`ID_REUSE_SUSPECTED` 1件だけを理由にBLOCKEDで、ID 1084は最小登録対象から除外した。
監査前後のシート変更が無いことも確認した。

管理者は通常の新規候補1件だけを手動登録した。

| 項目 | 結果 |
|---|---|
| candidateKey | `a2d112f802ab5bd620690a28c2247e9e35d4e479a03189fde6ae0730b0353811` |
| ローカルabilityId | `ab-1085` |
| legacyId / status | `null` / `draft` |
| 行数差 | abilities +1 / ability_external_refs +1 / assist_log +1 |
| 既存データ | 既存能力1,079件、カード91件、効果888件、モンスター352体は不変 |
| 公開 | draftのため非公開。verified化・アシスト公開は未実施 |
| 重複確認 | 同じcandidateKeyの再登録を拒否し、拒否後の行数増加なし |

登録後の固定SHA再監査は、外部1,177件、ローカル1,080件、カード対応候補97件、
未紐付け候補20件、ID再利用疑い1件、既存内容差分42件、表記違い548件、
重複内容一致22件、外部欠落観測20件だった。`processed=0`は異常ではない。
登録した候補は新しいローカル能力と完全一致して`knownExact`へ先に分類され、候補配列を対象とする
processed集計から外れるためである。通常候補から消え、同一candidateKeyの重複登録が拒否されたことで
登録済み認識を確認した。

以後の運用はCMSからの手動監査と追加専用登録だけとする。外部DBを正本として信頼せず、
既存能力の更新・削除・無効化、自動同期、時間トリガー、外部更新起点の自動公開を行わない。
新規能力はdraftで開始し、管理者が別途確認してverifiedへ変更し、既存のアシスト公開を明示実行するまで
公開ページへ出さない。これをもってP12-17段階4-7の本番導入・運用確定を完了とする。

# lMfDB 外部能力候補監査

最終更新: 2026-08-28

対象: P12-17a（読取専用候補監査エンジン）/ P12-17b（外部候補の手動登録設計）

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
40桁の固定SHAと、一覧のpage/pageSizeだけを受け付ける。SHA省略時は外部`main`を完全な
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

- 固定対応表`sourceName + rarity → cardId`は候補提示だけに使い、自動保存しない
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

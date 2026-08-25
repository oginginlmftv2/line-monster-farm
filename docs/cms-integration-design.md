# CMS統合 設計書（P12-10）

作成: 2026-08-25
対象タスク: P12-10（設計）／実装は P12-11 以降
本番影響: ⚪（この文書は設計のみ。コード・GAS・シート・deploymentを変更しない）

方針の正は `docs/cms-integration-plan.md`。この文書はそこで決まったことを覆さず、
実装可能な粒度まで具体化する。実装者はこの文書だけで着手できる。

**この文書に判断の先送りは無い。**
判断はすべて確定し、採らなかった案と採った理由を各章に書いた。

---

## 0. 事前調査の前提と、実物との食い違い

着手指示に添えられた前提1〜6を実物で検証した。結果を先に置く。
**食い違いがあったものは、実物を正として以降を設計している。**

| 前提 | 判定 | 実物 |
|---|---|---|
| 1. 関数名11個衝突 | **一致** | 11個・名前も完全一致。ただし下記の追加あり |
| 2. `SPREADSHEET_ID` が別物を指す | **一致** | `_cms/gas/コード.gs:76` と `_cms/assist-gas/コード.gs:142` |
| 3. アシスト側に二重の防御 | **一致** | `requireTest_()` と A1メモ `P12-8 ASSIST CMS TEST` |
| 4. UIの構造が違う | **不一致** | 下記 0-2 |
| 5. Script Properties 全7キー | **不足** | 8キー目 `OCR_DAILY_USAGE` がある |
| 6. C10検査は2ファイル前提 | **不足** | CMS検査は2か所あり、片方は統合すると必ずFAILする |

### 0-1. 前提1への追加 — グローバル変数も4個衝突している

関数だけでなく、トップレベル `var` が4個衝突する。

| 変数 | モンスター側 | アシスト側 | 危険度 |
|---|---|---|---|
| `RAW_BASE` | 同じ値 | 同じ値 | 無害 |
| `SHEET_MEMBERS` | `'members'` | `'members'` | シート名が衝突する |
| `SHEET_PUBLISH_LOG` | `'publish_log'` | `'publish_log'` | シート名が衝突する |
| `HEADERS` | 4シート分 | 5シート分 | **同名キーで列定義が違う** |

`HEADERS` は単一のオブジェクトで、両方が同じキーへ代入する。

```text
HEADERS['members']      monster: email, nickname, role, profileUrl, active, note
                        assist:  email, nickname, role, active, note
HEADERS['publish_log']  monster: 日時, モンスターID... （日本語5列）
                        assist:  timestamp, user, action, result, detail
```

**2本の `.gs` をそのまま1プロジェクトへ置くと、後に読み込まれた側が
`HEADERS` を上書きし、もう片方のシート読み書きが列ずれを起こす。**
`rows_()` と `readMonsters_()` はどちらも `HEADERS[name].length` 列を読むため、
列数が違えばデータを取り違える。これは関数名衝突より静かに壊れる。

### 0-2. 前提4は不一致 — アシストのタブはトップレベルではない

`_cms/assist-gas/index.html:153` のタブは、**カードを1枚選んだ後の編集画面の中**にある
サブタブである（カード / 効果 / 効果OCR / 能力）。アプリ全体のナビゲーションではない。

```js
// _cms/assist-gas/index.html:153
'<div class="tabs">'+tabButton('card','カード')+tabButton('effects','効果',d.effects.length)
 +tabButton('ocr','効果OCR')+tabButton('abilities','能力',d.abilities.length)+'</div>';
```

そして**トップレベルの構造は両者ほぼ同じ**である。

| | モンスター | アシスト |
|---|---|---|
| レイアウト | 左一覧 + 右エディタの2ペイン | 同じ |
| 一覧 | `#list` + `#q` 絞り込み | `#cardList` + `#query` 絞り込み |
| エディタ | `#edit` | `#editor` |
| スマホ | `#btnBackToList` + `body.mobile-editing` | `#btnBack` + `body.editing` |
| 通知 | `#msg` | `#message` |

つまり「単一画面 対 タブ画面」ではなく、**同じ2ペイン構造が2つある**。
統合はシェルを1つにしてドメインを切り替える形になる（第5章）。

要素idの実衝突は `who` と `f_imageFile` の2件。JS のトップレベル関数
（`el` `esc` `show`/`msg` `call`）も両方に定義がある。

### 0-3. 前提5への追加 — 8キー目がある

`OCR_DAILY_USAGE` を `_cms/assist-gas/コード.gs:122,127` が読み書きする。
管理者が設定する値ではなく、GAS自身が書く日次カウンタである。
移行時に手で移す対象ではないが、**Script Properties の一覧に現れるので
「設定漏れ」と誤認しないこと。**

### 0-4. 前提6は不足 — CMS検査は2か所ある

| 場所 | 対象 | 内容 |
|---|---|---|
| `scripts/verify.js:251-303`（第8章） | `_cms/gas` | 必須2ファイル存在 + 配下を再帰的にtoken走査 |
| `scripts/verify.js:1053-1067`（第15章） | `_cms/assist-gas` | 必須2ファイル存在 + `verify-assist-cms.js` |

判明した2点。

1. **token走査は `_cms/gas` にしか掛かっていない。**
   `_cms/assist-gas` にGitHubトークンを書いても現在は検出されない。
2. **`verify-assist-cms.js:88-96` の `forbiddenSource` は、統合すると必ずFAILする。**

```js
// scripts/verify-assist-cms.js:88-96 — assist ソースにあってはならない
[/GITHUB_TOKEN/, ...], [/cms\/(?:assist-)?publish/, ...],
[/api\.github\.com/, ...], [/git\/refs|actions\/workflows/i, ...]
```

統合後の1プロジェクトにはGitHub送信が必ず含まれる。
**この検査は「弱めて消す」のではなく、対象範囲をアシストドメインのファイルへ
絞って移設する**（第8章）。

### 0-5. 追加の食い違い — `cms/assist-publish` は存在しない

着手指示とcms-integration-planは「`cms/publish` と `cms/assist-publish` の出し分け」
と書くが、**`cms/assist-publish` はリポジトリのどこにも無い。**

- `.github/workflows/` に assist 用 Workflow は無い
- `scripts/` に assist 用の許可リストは無い
- `_cms/assist-gas/コード.gs` にGitHub送信処理は無い。
  `api_export()`（1041行〜）は3ファイルのJSON文字列とSHA-256をブラウザへ返すだけで、
  そこから先は人がコピーして手で反映している

したがって F章は「既存2経路の出し分け」ではなく、
**「既存1経路を無改造で残し、アシスト経路を新規に作る」設計になる。**
「許可リストを1本化しない」という制約は自動的に満たされる。

---

## A. プロジェクト構成

### A-1. 決定

**1つのApps Scriptプロジェクトへ集約する。共通ライブラリは使わない。**
プロジェクトは同一ソースから本番用とtest用の2つを作る（第C章）。
これは「製品が2つ」ではなく「同じ製品の本番と検証」である。

### A-2. 採らなかった案と理由

| 案 | 採らない理由 |
|---|---|
| 共通ライブラリ + 2プロジェクト | `google.script.run` はコンテナプロジェクトの関数しか呼べない。ライブラリの `api_*` を画面から直接呼べず、全APIに薄いラッパを書くことになる。行数は減らず、ラッパとライブラリの二重管理が増える |
| 同上（バージョン固定運用） | ライブラリは変更のたびに新バージョンを発行し、参照側のバージョン番号を上げて再deployする。1回の改修に「ライブラリ保存→バージョン発行→参照更新→deploy」の4手が必要になり、`docs/cms-integration-plan.md` の「deployment・権限承認・保守が1組で済む」に真っ向から反する |
| 2プロジェクトのまま共通部分だけコピー | 現状と同じ。UIが2URLに分かれたままで、統合の目的を1つも満たさない |

集約の弱点「片方の改修が全体に及ぶ」は認める。
対処は**ファイル分割＋関数名の接頭辞＋検査**（第D章・第H章）で、
「モンスター用の関数がアシストのファイルに現れたら検査でFAILする」状態を作る。

### A-3. `_cms/` のディレクトリ構成

```text
_cms/
  gas/
    manifest.json      ← このディレクトリの正しいファイル一覧（検査の正）
    00_core.gs         共通: 環境・設定・book・認証・画像・時刻・ログ
    10_monster.gs      モンスタードメイン: シート読み書き・ID予測・編集API
    20_assist.gs       アシストドメイン: 3DB変換・検証・編集API・OCR・画像
    30_publish.gs      公開: GitHub API・両ドメインのpublish・状態確認
    40_setup.gs        セットアップ: シート作成・登録・取込・点検
    index.html         シェル（header・タブ・2ペイン枠のみ）
    ui_common.html     共通CSS・共通JS（el/esc/show/call/setBusy）
    ui_monster.html    モンスター画面
    ui_assist.html     アシスト画面
    ui_publish.html    公開画面
    README.md          運用・セットアップ・token更新手順
```

**`_cms/assist-gas/` は移行完了時に削除する**（第I章 段階7）。
削除まではモンスター側の唯一動いている経路を守るため残す。

### A-4. ファイル分割の単位と根拠

| ファイル | 入る条件 | 入らないもの |
|---|---|---|
| `00_core.gs` | 両ドメインが呼ぶもの。ドメイン固有の定数を1つも持たない | シート名・列定義・GitHub |
| `10_monster.gs` | `monsters` / `edit_log` シートに触れるもの | GitHub API、アシストのシート |
| `20_assist.gs` | `cards` / `assist_effects` / `abilities` / `assist_log` に触れるもの | GitHub API、モンスターのシート |
| `30_publish.gs` | `UrlFetchApp` で `api.github.com` を呼ぶもの | シートの業務ロジック（読み出しは各ドメインの関数を呼ぶ） |
| `40_setup.gs` | GASエディタから人が手で実行するもの | 画面から呼ばれるもの |

**GitHub送信を `30_publish.gs` の1ファイルだけに閉じ込める。**
これは検査可能な境界であり（第H章 検査6）、
`verify-assist-cms.js` の `forbiddenSource` を等価以上に保つ手段でもある。

### A-5. GASのファイル読み込み順に関する制約

Apps Script は複数の `.gs` を1つのグローバルスコープへ連結する。
関数宣言は巻き上がるが、**トップレベルの `var 代入` は連結順に実行される。**
編集画面の並び順に依存する設計は事故になる。

**規約: トップレベルの `var` は、他ファイルの `var` を参照してはならない。**
派生値が要るときは関数にする。

```js
// ×  20_assist.gs
var ASST_IMAGE_MAX_BYTES = CORE_IMAGE_MAX_BYTES;   // 00_core.gs の値に依存

// ○  20_assist.gs
function asstImageMaxBytes_() { return coreImageMaxBytes_(); }
```

`manifest.json` はファイル名の配列で、`00_`〜`40_` の数値接頭辞は
GASエディタ上の並び順を人が読んで確認するためのものである。
**動作の正しさをこの順序に依存させない。**

---

## B. スプレッドシートの扱い

### B-1. 決定

**本番スプレッドシートへアシストの4シートを同居させる。
`SPREADSHEET_ID` は1キーのままにする。**
`docs/cms-integration-plan.md` の「スプレッドシート: すでに同居方針」を踏襲する。

test環境は、**同じソースから作った別のApps Scriptプロジェクト**が
自分の Script Properties で自分の test スプレッドシートを指すことで維持する。
1つのプロジェクトに2つのIDを持たせるのではなく、
**プロジェクトを環境ごとに分ける。**

```text
本番プロジェクト   ENVIRONMENT=production  SPREADSHEET_ID=<本番book>
testプロジェクト   ENVIRONMENT=test        SPREADSHEET_ID=<testbook>
                   ↑ ソースは同一。GITHUB_TOKEN は本番だけに設定する
```

### B-2. 採らなかった案と理由

| 案 | 採らない理由 |
|---|---|
| `SPREADSHEET_ID` と `ASSIST_SPREADSHEET_ID` の2キー | 移行は不要になるが、方針の「スプレッドシート統合」から外れる。`members` が2つに割れたままになり、「名簿が1つになり追加・削除の漏れが消える」という統合の目的を1つ落とす。またシートを跨いだ整合（同じ人が両方に居るか）を誰も検査できない |
| 本番bookにtest用シートも同居させ、シート名で分ける | 1つのbookに本番データとtestデータが混ざる。`setup3_importFromMain` は `setRows_()` で全行を消して書き直すため、シート名を1つ間違えた瞬間に本番が消える。前提3の防御が守っていたのはまさにこれで、これを捨てることになる |
| testを廃止して本番だけにする | P12-9のOCR検証はDriveと外部API課金を伴う。本番データで試す構成にはできない。`docs/cms-integration-plan.md` のPhase D「test環境で完成させてから本番deploymentを切り替える」も実行不能になる |

### B-3. 統合後のシート構成

同名衝突（`members` / `publish_log`）を解消する。

| シート | 所属 | 列 | 由来 |
|---|---|---|---|
| `members` | **共通** | email, nickname, role, profileUrl, active, note, **scopes** | モンスター側の6列 + 新規1列 |
| `monsters` | モンスター | 現行22列。変更しない | そのまま |
| `edit_log` | モンスター | 現行6列。変更しない | そのまま |
| `publish_log` | モンスター | 日時, 実行者, コミットSHA, 結果, 詳細 | そのまま |
| `cards` | アシスト | 現行20列。変更しない | そのまま |
| `assist_effects` | アシスト | 現行9列。変更しない | そのまま |
| `abilities` | アシスト | 現行17列。変更しない | そのまま |
| `assist_log` | アシスト | timestamp, user, action, result, detail | **旧 assist `publish_log` を改名** |
| `assist_publish_log` | アシスト | 日時, 実行者, コミットSHA, 結果, 詳細 | **新規。モンスター `publish_log` と同一列** |

**`assist_log` への改名理由**: 中身は保存・取込・export・OCR・画像アップロードの操作履歴で、
公開履歴ではない。`_cms/assist-gas/README.md:14` 自身が
「`publish_log`はtestの保存・取込・export履歴であり、公開操作を意味しない」と書いている。
名前を実態に合わせ、本物の公開履歴の場所を空ける。

**`assist_publish_log` を `publish_log` と同一列にする理由**:
公開状態のポーリング（`publishStatus_` / `recordedPublishResult_` / `sentPublishUser_` /
`setAllPublishStatus_`）を**シート名を引数にした1実装で共用できる**。
列が違えば2実装になり、片方だけ直す事故が起きる。

### B-4. `members` の `scopes` 列

**追加する理由**: 名簿を1つにすると、これまでモンスターだけを編集していた人が
アシストも編集できるようになり、逆も起きる。
統合は運用の便宜であって、**権限を広げる決定はされていない。**

| 値 | 意味 |
|---|---|
| `monster` | モンスタータブだけ |
| `assist` | アシストタブだけ |
| `monster,assist` | 両方 |
| 空欄 | **どちらも不可（fail-closed）** |

空欄を「両方」にしない。手で行を足して埋め忘れたときに
権限が広がる方向へ倒れるのは、防御として逆である。
空欄のときのエラー文で、埋めるべき値を具体的に案内する。

```js
// 00_core.gs
function requireScope_(scope) {
  var user = me_();
  if (!user) throw new Error('権限がありません。membersシートを確認してください。');
  if (user.scopes.indexOf(scope) < 0) {
    throw new Error('この操作の権限がありません（必要な範囲: ' + scope + '）。' +
      'membersシートのscopes列へ monster / assist / monster,assist のいずれかを設定してください。');
  }
  return user;
}
```

`role` は現行どおり `admin` / `writer` を保つ。**公開は `role === 'admin'` かつ
該当 `scope` を持つ人だけ**が実行できる。

### B-5. データ移行

アシストの3DBは既に `src/data/*.json` としてリポジトリにある（P12-4〜P12-6で正規化済み）。
**testスプレッドシートから本番スプレッドシートへ行をコピーしない。**
本番bookでは `setup3_importAssistFromMain()` を1回だけ実行し、
`main` の3DB JSONから読み直す。

理由: リポジトリの3DBが正であり、`node scripts/verify.js` 第15章が全件を検査している。
検査済みの正データから入れ直すほうが、検査されていないシート間コピーより安全である。
test側で行った編集は、実運用の入力ではなく検証用の試し書きである。

移行対象の唯一の実データは `assist-cards/` のカード画像で、これは既にリポジトリにあり
（`verify-assist-cms.js` が全91件の実在を検査している）、移動しない。

---

## C. 環境と防御

### C-1. 現在の防御が何を守っていたのかの分析

撤去の可否を決める前に、2つの防御がそれぞれ何を止めていたのかを特定する。

| 防御 | 実装 | 止めていた事故 |
|---|---|---|
| `requireTest_()` | `prop_('ENVIRONMENT') !== 'test'` で全処理停止 | **未検証のアシストコードが本番データに触ること。** P12-8時点でアシスト側は公開ゲート・ID検算・build検査を一度も通っておらず、本番bookで動かす資格が無かった |
| A1メモ `P12-8 ASSIST CMS TEST` | `book_()` の先頭で先頭シートA1のnoteを照合 | **`SPREADSHEET_ID` が意図しないbookを指したまま破壊的処理が走ること。** `setup1_createSheets` はヘッダー行と余剰列を書き換え、`setup3_importFromMain` は `setRows_()` で全データ行を消して書き直す。IDを1文字打ち間違えた先が偶然開けるbookだった場合、これが唯一の歯止めだった |

**2つは同じことの別側面ではない。**
前者は「コードの成熟度」を、後者は「設定値の同一性」を守っている。
`ENVIRONMENT` を production にすれば前者の役目は終わるが、
**後者の役目は統合後も一切減らない。むしろ守る対象が本番モンスターデータに増える。**

現行のモンスター側には後者に相当する防御が無い（`book_()` は `openById` するだけ）。
統合は、この防御をモンスター側へも広げる機会である。

### C-2. 決定

**`ENVIRONMENT` を必須キーとし、`production` / `test` の2値に再定義する。
A1メモは廃止せず、「test専用マーカー」から「環境識別マーカー」へ格上げして両ドメインへ適用する。**

```js
// 00_core.gs
var ENV_PRODUCTION = 'production';
var ENV_TEST = 'test';
var BOOK_MARKER_PREFIX = 'LMF CMS ';

function env_() {
  var value = prop_('ENVIRONMENT');
  if (value !== ENV_PRODUCTION && value !== ENV_TEST) {
    throw new Error('ENVIRONMENT は production または test を設定してください（現在: ' + value + '）。');
  }
  return value;
}

function book_() {
  var book = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var expected = BOOK_MARKER_PREFIX + env_();     // 'LMF CMS production' / 'LMF CMS test'
  var marker = String(book.getSheets()[0].getRange('A1').getNote() || '');
  if (marker !== expected) {
    throw new Error('スプレッドシートの環境マーカーが一致しません。' +
      '期待「' + expected + '」／実際「' + (marker || '（なし）') + '」。' +
      'SPREADSHEET_ID と ENVIRONMENT を確認してください。');
  }
  return book;
}
```

これは現行より強い。

- 現行: testコードがtest以外のbookを開くのを止める（片方向・アシストのみ）
- 統合後: **本番コードがtest bookを開くこと**も、**testコードが本番bookを開くこと**も、
  **どちらのコードも無関係なbookを開くこと**も止める（双方向・両ドメイン）

### C-3. 破壊的セットアップの追加ゲート

`env_()` とマーカーだけでは、「本番bookを本番コードが正しく開いた上で、
人が `setup3_importAssistFromMain` を誤って押す」事故は防げない。
現行の `requireTest_()` はこれを止めていた（testでしか動かないので本番では押せない）。
等価以上を保つため、**破壊的関数だけに一回限りの鍵を要求する。**

対象は3つ。`setup3_importMonsterSeed`、`setup3_resetMonsters`、`setup3_importAssistFromMain`。

```js
// 40_setup.gs
function consumeDestructiveGrant_(operation) {
  var properties = PropertiesService.getScriptProperties();
  var granted = String(properties.getProperty('ALLOW_DESTRUCTIVE_SETUP') || '').trim();
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var expected = operation + ' ' + today;
  if (granted !== expected) {
    throw new Error('この操作は既存データを全消去します。実行するには Script Properties へ ' +
      'ALLOW_DESTRUCTIVE_SETUP = "' + expected + '" を設定してください。' +
      '実行後は自動で削除されます。');
  }
  properties.deleteProperty('ALLOW_DESTRUCTIVE_SETUP');   // 一回限り
}
```

- 鍵は操作名と日付の両方を含む。別の破壊的操作には流用できず、翌日には失効する
- 使ったら消える。連打で2回目が走らない
- 設定できるのはScript Propertiesを開ける管理者だけ

`setup1` `setup2` `setup4` `setup5` は冪等で既存データを消さないため、この鍵を要求しない。
既存シートのデータ行に触れないことは第H章の検査で担保する。

### C-4. 公開の環境ゲート（二重）

```js
// 30_publish.gs
function requirePublishable_(scope) {
  if (env_() !== ENV_PRODUCTION) {
    throw new Error('公開は本番環境でだけ実行できます（現在: ' + env_() + '）。');
  }
  var user = requireScope_(scope);
  if (user.role !== 'admin') throw new Error('公開操作はadminだけが実行できます。');
  if (!user.nickname) throw new Error('membersシートのニックネームが空です。');
  return user;
}
```

加えて **testプロジェクトには `GITHUB_TOKEN` を設定しない。**
コード上のゲートと、鍵の不在という物理的な事実の2重で、
testからGitHubへ何かが飛ぶことはない。

### C-5. 画面側の表示

`api_bootstrapShell()` が `environment` を返し、シェルが常時バッジを出す。

| 環境 | バッジ | 公開タブ |
|---|---|---|
| `production` | 表示しない（通常配色） | **表示する** |
| `test` | 画面上部に固定の帯「TEST環境 — 公開されません」 | **表示しない** |

test環境で公開タブそのものを出さない。押せないボタンを置いて
エラーで止めるより、存在しないほうが誤解が無い。

### C-6. 採らなかった案と理由

| 案 | 採らない理由 |
|---|---|
| A1メモを廃止し `ENVIRONMENT` だけで守る | 前提3の防御を等価物なしに撤去することになる。`ENVIRONMENT` と `SPREADSHEET_ID` はどちらもScript Propertiesの1行で、同じ画面で同じ人が編集する。片方だけ直す事故を、もう片方では検出できない。マーカーは**データ側に置かれた独立した事実**なので、Properties をどう間違えても効く |
| `ENVIRONMENT` を廃止しマーカーだけにする | マーカーはbookを開いて初めて読める。`GITHUB_TOKEN` の有無や公開タブの表示など、bookを開く前に決めたいことがある |
| 破壊的操作を確認ダイアログだけで守る | `setup3_*` はGASエディタから実行する関数で、実行前に画面を出せない。GASエディタの実行ボタンは確認を挟まない |
| 破壊的操作を削除する | 復旧手段が消える。`_cms/assist-gas/README.md:139` の再セットアップ手順が実行不能になる |

---

## D. 名前衝突の解決

### D-1. 命名規約

| 種別 | 規約 | 例 |
|---|---|---|
| 共通の内部関数 | 接頭辞なし、末尾 `_` | `prop_` `book_` `me_` `env_` |
| 共通の定数 | 接頭辞なし、大文字 | `ENV_PRODUCTION` `BOOK_MARKER_PREFIX` |
| モンスター固有 | `mon` / `MON_` | `monReadAll_` `MON_SHEET_MONSTERS` |
| アシスト固有 | `asst` / `ASST_` | `asstRows_` `ASST_SHEET_CARDS` |
| 画面API | `api_` + ドメイン略号 | `api_monSave` `api_asstSaveCard` |
| セットアップ | `setupN_<動詞><対象>` | `setup3_importAssistFromMain` |
| HTML要素id | `mon_` / `asst_` / `app_` | `mon_list` `asst_query` `app_who` |

**`api_` で始まる関数は画面から呼べる。それ以外は呼べない。**
ドメイン略号を必ず入れ、`api_save` のようなドメイン不明の名前を作らない。

### D-2. 関数11個の処置

| # | 名前 | 処置 | 統合後 | 根拠 |
|---|---|---|---|---|
| 1 | `prop_` | **共通化** | `prop_`（`00_core.gs`） | 実装が同一。アシストの `optionalProp_` `positiveIntProp_` も core へ移す |
| 2 | `book_` | **共通化（再実装）** | `book_`（`00_core.gs`） | C-2 の環境マーカー版1つ。`requireTest_()` は廃止し C-3/C-4 へ置換 |
| 3 | `byteAt_` | **共通化** | `byteAt_` | 完全一致 |
| 4 | `isExpectedImage_` | **共通化** | `isExpectedImage_` | 完全一致。JPEG/PNG/WebPのマジックバイト判定 |
| 5 | `me_` | **共通化（再実装）** | `me_` | 統合 `members` を読む1実装。戻り値 `{email, nickname, role, profileUrl, scopes}`。アシスト側は `email` を使わない |
| 6 | `now_` | **改名（両方）・共通化しない** | `nowJst_` / `nowIso_` | **形式が違う。統合すると必ず壊れる**（D-3） |
| 7 | `doGet` | **片方採用（新規1本）** | `doGet(e)`（`00_core.gs`） | 1プロジェクトに1つしか置けない。両方の権限案内を統合した新実装 |
| 8 | `api_bootstrap` | **改名（3分割）** | `api_bootstrapShell` / `api_monBootstrap` / `api_asstBootstrap` | 返す内容が違う。シェル起動時に共通分だけ取り、タブを開いたときにドメイン分を取る（D-4） |
| 9 | `setup1_createSheets` | **共通化** | `setup1_createSheets` | 統合 `HEADERS` から全9シートを作る1実装 |
| 10 | `setup2_registerMe` | **共通化** | `setup2_registerMe` | 統合 `members` へ1行。`scopes` は `monster,assist`、`role` は `admin` で登録し、戻り値で絞り込みを案内する |
| 11 | `setup4_check` | **改名・統合** | `setup4_checkAll` | 内部で `monCheck_()` と `asstCheck_()` を両方実行し、1つのレポートへまとめる |

### D-3. `now_` を共通化してはいけない理由

```js
// _cms/gas/コード.gs:88          → 'yyyy-MM-dd HH:mm:ss'
// _cms/assist-gas/コード.gs:152  → "yyyy-MM-dd'T'HH:mm:ssXXX"
```

モンスター側の `now_()` は**公開コミットの件名に入る**。

```js
// _cms/gas/コード.gs:1276
message: 'CMS publish ' + now_(),
```

そして許可リストがこの件名を正規表現で検査している。

```js
// scripts/verify-cms-source.js:110
if (!/^CMS publish \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(subject))
```

**ISO形式に統一した瞬間、モンスターCMSの公開が公開ゲートで全て拒否される。**
一方アシスト側のISO形式は `cards.updatedAt` などのシート値として既に入っており、
JST形式へ変えると `dateCell_()` の往復が変わる。

どちらも他方へ寄せられない。`nowJst_()` と `nowIso_()` に改名し、
**両方を `00_core.gs` に並べて、それぞれの用途をコメントで明記する。**

```js
// 00_core.gs
// nowJst_ : monsters/edit_log/publish_log のセル値と、公開コミット件名に使う。
//           形式を変えると scripts/verify-cms-source.js の件名検査が全件拒否になる。
function nowJst_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'); }

// nowIso_ : cards/assist_effects/abilities の updatedAt と assist_log に使う。
//           形式を変えると既存シート値と混在する。
function nowIso_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"); }
```

### D-4. `api_bootstrap` の3分割

| 関数 | 呼ぶ時 | 返す |
|---|---|---|
| `api_bootstrapShell()` | 画面を開いた直後に1回 | `{environment, me:{nickname, role, scopes}, tabs:[...]}` |
| `api_monBootstrap()` | モンスタータブを最初に開いた時 | 現行 `api_bootstrap` の全内容（一覧・血統・閾値・memberNames） |
| `api_asstBootstrap()` | アシストタブを最初に開いた時 | 現行アシスト `api_bootstrap` の全内容（カード一覧・OCR設定・画像設定） |

**分ける理由**: 現行のモンスター `api_bootstrap` は351体を読み、
アシストは91カード＋888効果＋1,079能力の件数集計で3シートを全走査する。
起動時に両方走らせると、GASの実行時間と画面表示が確実に遅くなる。
片方しか使わない日のほうが多い。

### D-5. グローバル変数4個の処置

| 変数 | 処置 | 統合後 |
|---|---|---|
| `RAW_BASE` | **共通化** | `RAW_BASE`（`00_core.gs`）。値は同一 |
| `SHEET_MEMBERS` | **共通化** | `SHEET_MEMBERS = 'members'`（`00_core.gs`） |
| `SHEET_PUBLISH_LOG` | **分離・改名** | `MON_SHEET_PUBLISH_LOG = 'publish_log'` / `ASST_SHEET_LOG = 'assist_log'` / `ASST_SHEET_PUBLISH_LOG = 'assist_publish_log'` |
| `HEADERS` | **分離・改名** | `MON_HEADERS` / `ASST_HEADERS` / `CORE_HEADERS`（`members` のみ） |

`HEADERS` を3つに割る。`setup1_createSheets` と `setup4_checkAll` は
3つを合成した一覧を回す。

```js
// 40_setup.gs
function allHeaders_() {
  var all = {};
  [CORE_HEADERS, MON_HEADERS, ASST_HEADERS].forEach(function (group) {
    Object.keys(group).forEach(function (name) {
      if (all[name]) throw new Error('シート名が重複しています: ' + name);
      all[name] = group[name];
    });
  });
  return all;
}
```

**重複したら例外で止める。**列ずれで静かに壊れるより、セットアップ時に落ちるほうがよい。
この関数の存在は第H章の検査で担保する。

### D-6. `setup*` の取り違え防止

4つを重ねる。

1. **名前に対象を必ず入れる。**
   `setup3_importSeed` → `setup3_importMonsterSeed`、
   `setup3_importFromMain` → `setup3_importAssistFromMain`。
   「どちらにも読める名前」を残さない。
2. **全 `setup*` が先頭で対象を宣言し、戻り値の1行目に出す。**

```js
function setupTarget_() {
  var book = book_();          // 環境マーカー検査を通る
  return 'ENVIRONMENT=' + env_() + ' / book=「' + book.getName() + '」';
}
// 各 setup の戻り値1行目
//   ENVIRONMENT=test / book=「ライ徹CMS test」
//   → 実行者が実行ログの1行目で対象を確認できる
```

3. **破壊的な3つは C-3 の一回限りの鍵を要求する。**
   鍵の文字列に操作名が入るので、`setup3_resetMonsters` の鍵で
   `setup3_importAssistFromMain` は動かない。
4. **非破壊の `setup1` `setup2` `setup4` `setup5` は冪等にする。**
   既存シートのデータ行と既存の列見出しを書き換えない。
   現行アシストの `setup1_createSheets` は余剰列を `clearContent()` するが、
   統合後は**列が想定と違えば書き換えずに issue として報告する**へ変更する。
   本番bookの `monsters` 22列を消す事故を構造的に無くす。

### D-7. HTML側の衝突

| 衝突 | 処置 |
|---|---|
| 要素id `who` | `app_who` に統一（共通ヘッダーへ1つ） |
| 要素id `f_imageFile` | `mon_f_imageFile` / `asst_f_imageFile` |
| `el()` `esc()` | `ui_common.html` に1つ。両ドメインのコピーを削除 |
| `show()` / `msg()` | `ui_common.html` の `show(message, isError)` に統一 |
| `call()` | `ui_common.html` に1つ。アシスト版（deployment未反映API検出つき）を採用 |
| `setBusy()` | `ui_common.html` に1つ。アシスト版（オーバーレイつき）を採用 |
| 状態変数 `state` / `BOOT` `CUR` | `MON = {}` / `ASST = {}` の2名前空間へ入れる |

要素idは**全 `ui_*.html` を横断して一意**であることを検査する（第H章 検査3）。
接頭辞規約に頼らず、機械で確かめる。

---

## E. UI設計

### E-1. タブ構成

**トップレベル3タブ: `モンスター` / `アシストカード` / `公開`。**
アシストタブの中には、現行のカード編集サブタブ（カード / 効果 / 効果OCR / 能力）を
**そのまま残す。**

```text
┌────────────────────────────────────────────────┐
│ ライ徹CMS   [モンスター][アシストカード][公開]      ぎん / admin │
├────────────────────────────────────────────────┤
│  ┌─ 一覧 ────┐  ┌─ エディタ ──────────────────┐ │
│  │ 絞り込み   │  │ （アシストタブのときだけ）        │ │
│  │ ─────── │  │ [カード][効果 12][効果OCR][能力 8] │ │
│  │ 項目       │  │ ─────────────────────── │ │
│  │ 項目       │  │ フォーム                        │ │
│  └──────────┘  └────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

### E-2. 採らなかった案と理由

| 案 | 採らない理由 |
|---|---|
| フラットな6タブ（モンスター / カード / 効果 / 能力 / OCR / 公開履歴） | 効果・能力・OCRは**1枚のカードに属する**編集画面である。トップレベルへ出すと各タブに独自のカード選択UIが要り、選択状態が4つのタブでずれる。P12-8b・P12-9で実機確認済みの編集動線（カードを選ぶ→サブタブで往復する）を壊してまで得るものが無い |
| モンスターとアシストを左一覧の中で混ぜ、種別で絞り込む | 一覧の列（モンスター: ID・血統・字数 / カード: レアリティ・効果数・能力数）が違い、絞り込み条件も違う。1つの一覧に押し込むと両方の絞り込みが使えなくなる |
| 公開をタブにせずヘッダーのボタンのまま | 現行モンスター側は `#btnPublish` をヘッダーに置いている。ドメインが2つになると**ヘッダーに公開ボタンが2つ並ぶ**。狭い場所で隣り合う2つの破壊的ボタンは、この設計が最も避けたい形である |

### E-3. モンスターの単一画面をどこへ収めるか

**現行 `_cms/gas/index.html` の2ペイン（`#list` + `#edit`）をそのまま
モンスタータブの中身にする。**ヘッダーから移すのは公開系だけ。

| 現行の要素 | 移動先 |
|---|---|
| `#list` `#q` `#fMon` `#fState` `#fSort` `#btnNew` | モンスタータブの一覧ペイン（id接頭辞のみ変更） |
| `#edit` とその中の全フォーム | モンスタータブのエディタペイン（同上） |
| `#btnBackToList` `body.mobile-editing` | 共通シェルへ（アシストの `#btnBack` と統合） |
| `#stats` `#who` | 共通ヘッダー `#app_stats` `#app_who` |
| **`#btnPublish` `#btnPublishStatus` `#publishState`** | **公開タブへ移動** |

モンスタータブの中に公開ボタンは置かない。

### E-4. 公開タブ

ドメインごとに独立したカードを縦に並べる。共有する要素を作らない。

```text
┌─ モンスターを公開 ──────────────────────────┐
│ 送信先ブランチ : cms/publish                          │
│ 送るファイル   : monsters-data.js                     │
│                  src/data/monsters-editorial.json     │
│                  src/data/cms-id-predictions.json     │
│                  monster/<4桁ID>.<jpg|png|webp>       │
│ 直近の送信     : 2026-08-25 10:14 / a1b2c3d / 公開成功 │
│                                                       │
│           [ モンスターを公開 ]  [ 結果を確認 ]         │
└─────────────────────────────────────────┘

┌─ アシストカードを公開 ────────────────────────┐
│ 送信先ブランチ : cms/assist-publish                    │
│ 送るファイル   : src/data/assist-cards.json           │
│                  src/data/assist-effects.json         │
│                  src/data/assist-abilities.json       │
│                  assist-cards/<cardId>.<jpg|png|webp> │
│ 直近の送信     : 送信記録なし                          │
│                                                       │
│        [ アシストカードを公開 ]  [ 結果を確認 ]        │
└─────────────────────────────────────────┘
```

**「いま何を編集していて、押すと何が公開されるか」を誤解しない仕掛け:**

1. **ボタン文言に必ずドメイン名を入れる。**「公開」という単独の文字列を画面に置かない
2. **送るファイルの一覧を常時表示する。**折りたたまない。
   この一覧は `verify-cms-source.js` / `verify-assist-source.js` の許可リストと同じ集合で、
   一致することを第H章の検査6で担保する
3. **押下時の確認ダイアログにドメイン・ブランチ・件数を出す。**

```text
モンスターを公開します。

  送信先   : cms/publish
  ファイル : 3件 + 画像 12件
  対象外   : アシストカードのデータは含まれません

実行しますか？
```

4. **2枚のカードに配色を分ける。**モンスターは青系、アシストは橙系
   （現行アシストのヘッダー背景 `#f3ead7` を踏襲する）。
   モンスタータブとアシストタブのエディタ枠にも同じ配色を薄く敷き、
   タブ・エディタ・公開カードの3か所で色が一致する
5. **`scope` を持たないドメインのカードは表示しない。**
   アシストしか編集しない人の画面にモンスター公開ボタンは出ない
6. **公開中は反対側のボタンも無効化する。**
   GASの6分制限に対し、両ドメイン同時実行を作らない

### E-5. スマホ表示

現行の両者が持つ「一覧↔エディタの切り替え」を共通シェルへ1つにまとめる。
`body.editing` に統一し、`body.mobile-editing` は廃止する。
`@media (max-width:860px)`（モンスター側の値）を採用する。
アシスト側の閾値と異なる場合はモンスター側に合わせる。既存CSSの数値を新たに増やさない。

---

## F. 公開経路

### F-1. 決定

**出し分けは、GASのサーバー側関数そのもので固定する。実行時の変更検出をしない。**

| 関数 | 送るもの | ブランチ |
|---|---|---|
| `api_monPublish()` | monsters-data.js / monsters-editorial.json / cms-id-predictions.json / monster画像 | `cms/publish` |
| `api_asstPublish()` | assist-cards.json / assist-effects.json / assist-abilities.json / assist-cards画像 | `cms/assist-publish` |

各関数が組み立てる `treeEntries` にはドメイン外のパスを一切入れない。
どちらの関数も、もう一方のパスを**書けない**（定数がファイル内に無い）。

### F-2. 採らなかった案と理由

| 案 | 採らない理由 |
|---|---|
| 変更検出で公開先を自動判定 | 「両方変わっていたら」の分岐が必ず生まれる。両方送れば1コミットが2ドメインに跨り、狭い許可リストが機能しなくなる。片方だけ送れば残りは黙って取り残される。どちらも `docs/cms-integration-plan.md` が守ろうとしたものを壊す |
| 1つの `api_publish(domain)` に引数でドメインを渡す | 引数は画面から来る。画面のバグや改変で `domain` が入れ替われば、許可リスト側は「正しい件名の正しい親を持つコミット」として受ける可能性がある。**送信範囲をコードの構造で固定するほうが強い** |
| 両ドメインを1コミットにまとめて1回で送る | GASの6分実行制限。現行のモンスター公開だけで最大12枚の画像をbase64でblob化しており、91カード分の画像が加わると上限に近づく。`docs/cms-integration-plan.md` の「全件同時publishを作らない」に従う |

### F-3. 新規に作るもの

**`scripts/verify-cms-source.js` は変更しない。**
既存のモンスター公開を1バイトも危険にさらさない。

新規 `scripts/verify-assist-source.js`（`verify-cms-source.js` と同じ構造の別ファイル）。

```js
const TEXT_SOURCE_FILES = new Set([
  'src/data/assist-cards.json',
  'src/data/assist-effects.json',
  'src/data/assist-abilities.json',
]);
const IMAGE_PATH = /^assist-cards\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/i;
const GENERATED_PREFIXES = ['cards/'];
const GENERATED_FILES = new Set(['sitemap.xml']);
const SUBJECT = /^CMS assist publish \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
```

検査項目は `verify-cms-source.js` と同一にする。
単一親 / 親が実行時点の `origin/main` / 件名の形式 / 許可外パスの拒否 /
`100644 blob` 以外の拒否 / 画像のマジックバイトと2MB上限 /
build後の生成差分が許可範囲だけ。

**`GENERATED_PREFIXES` に `cards/` を置く根拠**: `build.js` は
`scripts/build-assist-pages.js` を呼んで `cards/<cardId>.html` を全件生成し、
`sitemap.xml` を再生成する（`docs/build-spec.md` 12-1, 12-2）。
モンスター側の `monsters/` に対応する。

新規 `.github/workflows/cms-assist-publish.yml`。
`cms-publish.yml` と同じ手順で、次の2点だけが違う。

```yaml
on:
  push:
    branches:
      - cms/assist-publish

concurrency:
  group: cms-publish          # ★ モンスター側と同じグループ
  cancel-in-progress: false

permissions:
  contents: read
```

ステップは `verify-cms-source.js` の代わりに `verify-assist-source.js` を
`origin/main` から取り出して実行する。
`generate-ids.js` と `verify-cms-ids.js` も**そのまま実行する**
（アシスト公開でモンスターIDが変わらないことを確認する意味がある）。
`build.js` と `verify.js` も同じく全件実行する。

### F-4. `sitemap.xml` の競合対策

`sitemap.xml` は両ドメインが書き換える唯一のファイルである
（`docs/build-spec.md` 2-1 でモンスター側、12-2 でカード側が載る）。
3段構えで守る。

1. **同じ concurrency group `cms-publish` に入れる。**
   `cancel-in-progress: false` なので、後発は先行の完了を待って直列に走る
2. **親コミット一致検査が既に効いている。**
   `verify-cms-source.js:112` は「GAS元コミットの親が実行時点の `origin/main`」を要求する。
   先行runが main を進めた後に後発が動くと、後発の親は古い main なので**拒否される。**
   運用者は画面のエラーを見て、もう一度公開を押す。これで
   「片方のドメインだけを反映した sitemap」が main へ乗ることはない
3. **`build.js` は常に全再生成する。**
   `sitemap.xml` は入力（`monster-ids.json` + 3DB）から毎回まるごと作り直される。
   差分マージをしないので、正しい親から作られた sitemap は常に両ドメインの全URLを含む

やり直しが要る場面は「両ドメインをほぼ同時に公開したとき」だけで、
運用上まれである。**沈黙して壊れるより、拒否してやり直させるほうを選ぶ。**

### F-5. GitHub admin 権限が不要であることの明記

新規 Workflow が使うものは、すべて write 権限で扱える。

| 使うもの | 必要な権限 | 可否 |
|---|---|---|
| `.github/workflows/cms-assist-publish.yml` の追加 | リポジトリへの push | **○** |
| `cms/assist-publish` ブランチの作成 | ブランチ作成 | **○** |
| Repository secret `CMS_PUBLISH_TOKEN` の参照 | Secrets の閲覧・編集 | **○** |
| Actions の実行と結果確認 | — | **○** |

**使わないもの**（`docs/cms-integration-plan.md` の「GitHub権限の前提」より admin 必須）:

- Settings → Actions → General の Workflow permissions（既定のまま。
  `permissions: contents: read` を Workflow 内で明示し、既定値に依存しない）
- Rulesets / Branch protection（追加も変更もしない）
- Pages の設定（触らない）
- GitHub Actions による PR 作成（**この統合では実装しない。** 第J章）

**結論: 第F章の全実装は admin 権限なしで完結する。**

---

## G. token

### G-1. 決定

| 項目 | 値 |
|---|---|
| 種類 | **fine-grained personal access token** を1本 |
| 対象 | `oginginlmftv2/line-monster-farm` のみ（Only select repositories） |
| Contents | **Read and write** |
| Actions | **Read-only** |
| Metadata | Read-only（fine-grained では必須） |
| 上記以外の全項目 | **No access** |
| 有効期限 | **90日** |
| 置き場所 | GAS Script Properties `GITHUB_TOKEN`（**本番プロジェクトのみ**）／ GitHub Repository secret `CMS_PUBLISH_TOKEN` |
| 発行・設定 | **管理者が行う。** この設計・実装は値を受け取らない |

**値そのもの、末尾数文字、発行画面のスクリーンショットを、
文書・コード・コミットメッセージ・ログ・チャットのいずれにも書かない。**

### G-2. 権限の根拠（実コードから導出）

| 権限 | 使う処理 | 場所 |
|---|---|---|
| Contents: write | `/git/refs`, `/git/blobs`, `/git/trees`, `/git/commits` | `_cms/gas/コード.gs:189-205, 1266-1295` |
| Contents: write | Workflow の `git push origin HEAD:main` | `.github/workflows/cms-publish.yml` 最終ステップ |
| Contents: read | Workflow の `actions/checkout` | 同上 |
| Actions: read | `/actions/workflows/cms-publish.yml/runs`, `/actions/runs/<id>/jobs` | `_cms/gas/コード.gs:282, 294` |

**Workflows 権限は付けない。**
付けると token を持つ処理が `.github/workflows/` を書き換えられる。
CMSは Workflow ファイルに触らないので不要であり、
付けないこと自体が「公開ゲートを CMS から書き換えられない」という防御になる。

### G-3. 1本にする範囲

GAS 側と Actions 側で**同じ値を使う**。置き場所が2つあるのは、
Script Properties と Repository secret が別の保管庫だからで、token は1本である。

| 現在 | 統合後 |
|---|---|
| GAS `GITHUB_TOKEN`（モンスターCMS） | GAS `GITHUB_TOKEN`（統合CMS本番のみ） |
| GitHub secret `CMS_PUBLISH_TOKEN` | GitHub secret `CMS_PUBLISH_TOKEN`（同じ値） |
| アシスト用 token | **発行しない。** アシストも同じ token を使う |

`docs/PROGRESS.md` の「先にアシスト用tokenを発行すると作り直しになる」に従い、
アシスト専用 token は一度も作らない。

### G-4. P11-8（最小権限化）の吸収

P11-8 は「既存 token の権限を最小化する」タスクだった。
既存 token の種類・権限は外部画面でしか確認できず未確認である
（`docs/PROGRESS.md`「確認できなかった外部状態」）。

**古い token を調べて絞るのではなく、G-1 の仕様で新しく1本発行し、
古い token を revoke する。**

理由: 既存 token が classic PAT なら、絞れる粒度は `repo` スコープ単位までで、
リポジトリ単位・権限単位の制限ができない。調査してから判断するより、
仕様の分かっている新しい token に置き換えるほうが確実で、手数も少ない。

切替は第I章 段階6で行い、**revoke は新 token での公開成功を確認した後**にする。

### G-5. 更新手順（`_cms/gas/README.md` へ記載する内容）

```text
1. 管理者が G-1 の仕様で新しい fine-grained PAT を発行する
2. GitHub Repository secret CMS_PUBLISH_TOKEN を新しい値へ更新する
3. GAS 本番プロジェクトの Script Properties GITHUB_TOKEN を同じ値へ更新する
4. 統合CMSの公開タブから「モンスターを公開」を1回実行し、成功を確認する
5. 成功を確認してから、古い token を revoke する
6. 期限の2週間前に管理者へ通知する仕組みは無い。
   README の「次回更新期限」の行を、発行のたびに書き換える
```

---

## H. 検査

### H-1. C10トークン検査の作り直し

現行は「`_cms/gas` に `コード.gs` と `index.html` がある」を前提にする。
統合でファイルが8個になるため、**ファイル名の固定リストをやめ、
マニフェスト方式へ変える。**

`_cms/gas/manifest.json`:

```json
{
  "description": "_cms/gas 配下の正しいファイル一覧。GASプロジェクトと1対1で対応する。",
  "files": [
    "00_core.gs", "10_monster.gs", "20_assist.gs", "30_publish.gs", "40_setup.gs",
    "index.html", "ui_common.html", "ui_monster.html", "ui_assist.html", "ui_publish.html",
    "README.md"
  ]
}
```

`scripts/verify.js` 第8章の置き換え後の検査:

1. `_cms/gas/manifest.json` が存在し、JSONとして読める
2. `files` の全ファイルが実在する（**欠落は FAIL**。現行の必須2ファイル検査の後継）
3. `_cms/gas/` 配下に `files` と `manifest.json` 以外のファイルが**無い**（余剰も FAIL）
4. **`_cms/` 配下を再帰的に**走査し、既知6種のGitHubトークン形式が0件である

4は現行から**範囲を広げる強化**である。現行は `_cms/gas` だけを走査し、
`_cms/assist-gas` を走査していない（0-4節）。統合前でも `_cms/` 全体にすれば
そのギャップが埋まるので、**この変更だけは第I章 段階1で先に入れる。**

トークン形式のパターン6種（`ghp_` `github_pat_` `gho_` `ghu_` `ghs_` `ghr_`）と
その閾値は**変更しない。**

### H-2. `verify-assist-cms.js` の移設（弱めない）

0-4節のとおり、`forbiddenSource` は統合すると必ず落ちる。
**削除ではなく、対象範囲を変えて等価以上にする。**

| 現行の禁止 | 現行の対象 | 統合後の対象 | 強弱 |
|---|---|---|---|
| `GITHUB_TOKEN` | `_cms/assist-gas/{コード.gs, index.html, README.md}` | `20_assist.gs`, `ui_assist.html`, `10_monster.gs`, `ui_monster.html` | **強化**（モンスター側にも掛かる） |
| `api.github.com` | 同上 | 同上 | **強化** |
| `git/refs`, `actions/workflows` | 同上 | 同上 | **強化** |
| `cms/publish`, `cms/assist-publish` | 同上 | 同上 | **強化** |
| メールアドレス直書き | 同上 | **`_cms/` 全ファイル** | **強化** |
| token らしき文字列 | 同上 | **`_cms/` 全ファイル**（H-1の4と重複させる） | **強化** |

裏返しとして、**`30_publish.gs` にだけ GitHub 送信が存在すること**を検査する。
「禁止対象がどこにも無い」ではなく「あるべき1か所にだけある」を確かめる。

`ENVIRONMENT` とマーカーの検査（現行は `!== 'test'` と `P12-8 ASSIST CMS TEST` の
文字列一致）は、C-2の新実装に合わせて次へ差し替える。

```js
if (!/ENVIRONMENT は production または test/.test(core)) issues.push('環境値の検査がない');
if (!/BOOK_MARKER_PREFIX/.test(core) || !/getRange\('A1'\)\.getNote\(\)/.test(core)) {
  issues.push('スプレッドシートの環境マーカー検査がない');
}
```

**3DB構造の検査（`validateRoot` の後半、cardId重複・rarity・aura・cardType・
accessoryStatus・stats・ratings・releasedAt・formations・effectId・sortOrder連番・
abilityId・legacyId・linkStatus・resolved順序）は、判定基準を1つも変えない。**
これらは `_cms/` のファイル構成と無関係で、統合の影響を受けない。

### H-3. 統合後に追加する検査項目

`scripts/verify.js` へ次を足す。既存項目の判定基準は変えない。

| # | 検査 | FAIL条件 |
|---|---|---|
| 1 | 関数名の一意性 | `_cms/gas/*.gs` を横断して `function 名` が重複する |
| 2 | トップレベル `var` の一意性 | 同上で `var 名` が重複する |
| 3 | 要素idの一意性 | `_cms/gas/ui_*.html` と `index.html` を横断して `id="..."` が重複する |
| 4 | 未定義API呼び出し | `ui_*.html` の `call('api_X'` に対応する `function api_X(` が `.gs` に無い |
| 5 | 環境防御 | `book_()` に環境マーカー照合が無い／破壊的 `setup3_*` に `ALLOW_DESTRUCTIVE_SETUP` が無い |
| 6 | **送信範囲と許可リストの一致** | `api_monPublish` の tree path 集合 ≠ `verify-cms-source.js` の許可集合／`api_asstPublish` ≠ `verify-assist-source.js` の許可集合 |
| 7 | 許可リストの分離 | `verify-cms-source.js` と `verify-assist-source.js` の許可パス集合が互いに素でない |
| 8 | GitHub送信の局在 | `api.github.com` / `git/refs` が `30_publish.gs` 以外に現れる |
| 9 | concurrency group | 2つの Workflow の `concurrency.group` が異なる／`cancel-in-progress: true` |
| 10 | 破壊的setupの局在 | `setRows_` / `deleteRows` / `clearContent` が `40_setup.gs` 以外に現れる |

**検査6が最も重要である。**
「GASが送る範囲」と「Workflowが受け入れる範囲」が一致していなければ、
公開のたびに拒否されるか、あるいはゲートが素通りする。
実装とゲートの2か所を人が同期させる運用にせず、機械で照合する。

### H-4. 変えないもの

次はこの統合で一切変更しない。

- `scripts/verify-cms-source.js`（モンスターの公開ゲート本体）
- `scripts/verify-cms-ids.js`（ID検算）
- `repo-guard.lock.json` の配列順ロックと prefix hash 判定
- カードのインデックスゲート（可視本文800字以上かつ解説50字以上）
- モンスターのインデックス閾値（800字）
- 3DBの schemaVersion（cards=3, effects=1, abilities=1）
- `.github/workflows/cms-publish.yml`
- `.github/workflows/verify.yml`
- 現在 PASS している61項目の判定基準

---

## I. 移行手順とロールバック

### I-1. 全体像

```text
段階1  検査の先行強化                    ⚪  現行構成のまま
段階2  統合ソースの作成                  ⚪  リポジトリ内だけ
段階3  test環境で統合CMSを動かす          ⚪  testプロジェクト・testbook
段階4  アシスト公開経路の実証             🟡  cms/assist-publish（mainへ届く）
段階5  本番bookへアシストシートを同居      🟡  本番スプレッドシート
段階6  本番deployment切替 + token1本化    🟡🔴
段階7  旧資産の撤去                       ⚪
```

段階1〜3 は P12-11、段階4〜6 は P12-12、段階7 は P12-12 の最後に行う。

### I-2. 各段階

**段階1 — 検査の先行強化（⚪）**

現行の2プロジェクト構成のまま、H-1の4（`_cms/` 全体のtoken走査）だけを入れる。
`_cms/assist-gas` の走査漏れは今日ある穴で、統合を待つ理由が無い。

- 壊れたら戻せるか: `scripts/verify.js` の1コミット revert
- 確認: `node scripts/verify.js` が FAIL 0

**段階2 — 統合ソースの作成（⚪）**

`_cms/gas/` を A-3 の構成へ書き直す。`_cms/assist-gas/` は残したまま触らない。
`verify.js` 第15章（`_cms/assist-gas` 検査）も残す。
**この段階では GAS へ貼らない。** リポジトリ内のテキストだけが変わる。

- 壊れたら戻せるか: **稼働中の GAS は1バイトも変わっていない。**
  リポジトリを revert すれば完全に戻る
- 確認: H-3 の検査1〜10 が新ソースに対して全て PASS

**段階3 — test環境で統合CMSを動かす（⚪）**

管理者が新しいスタンドアロンGASプロジェクトを作り、段階2のソースを貼る。

```text
Script Properties  ENVIRONMENT=test
                   SPREADSHEET_ID=<新しいtest統合book>
                   ASSIST_IMAGE_FOLDER_ID=<既存のtest画像フォルダ>
                   GOOGLE_CLOUD_VISION_API_KEY, OCR_DAILY_LIMIT=100
                   GITHUB_TOKEN は設定しない
```

test統合bookの先頭シートA1 note に `LMF CMS test` を入れ、
`setup1_createSheets` → `setup2_registerMe` → `setup3_importMonsterSeed`
→ `setup3_importAssistFromMain` → `setup4_checkAll` を順に実行する。

確認する行為（すべて test 上）:

1. モンスタータブで1体の解説末尾へ短い文字列を足して保存し、字数表示が変わる
2. アシストタブでカード保存・効果保存・能力保存が通り、競合（version不一致）を拒否する
3. 効果OCRが動き、`OCR_DAILY_LIMIT` の上限に達すると拒否する
4. カード画像アップロードが test Drive へ入る
5. **公開タブが表示されない**（C-5）
6. `api_monPublish` / `api_asstPublish` を GAS エディタから直接叩くと
   「公開は本番環境でだけ実行できます」で止まる（C-4）
7. `SPREADSHEET_ID` を一時的に本番bookのIDへ書き換えると、
   **`book_()` が環境マーカー不一致で止まる**（C-2）。確認後すぐ戻す
8. `setup3_importAssistFromMain` を鍵なしで実行すると拒否される（C-3）

- 壊れたら戻せるか: **本番GAS・本番book・mainは一度も触っていない。**
  test プロジェクトを捨てれば戻る
- 確認: 上記8項目すべて

**段階4 — アシスト公開経路の実証（🟡）**

`scripts/verify-assist-source.js` と `.github/workflows/cms-assist-publish.yml` を
PRで main へ入れる。ここで初めて mainへ届く経路ができる。

**GASからは押さない。** 人が `cms/assist-publish` ブランチを手で作り、
現在の3DBと同一内容（＝差分ゼロ）のコミットを、規則どおりの件名で1つ載せて push する。

確認:

1. Workflow が起動し、全ステップ成功する
2. main への push 結果が「差分なし」である（`git commit` がスキップされる）
3. 許可外パスを1つ混ぜたコミットで再試行し、**拒否される**
4. 件名を規則外にしたコミットで再試行し、**拒否される**
5. 親を古い main にしたコミットで再試行し、**拒否される**

- 壊れたら戻せるか: 3〜5は main を更新しないので影響が無い。
  2が万一 main を汚した場合、`git revert` 1コミットで戻る。
  **モンスター公開経路は無改造なので、この段階で止まっても止まらない**
- 確認: 上記5項目 + `node scripts/verify.js` FAIL 0

**段階5 — 本番bookへアシストシートを同居（🟡）**

管理者が本番bookの先頭シートA1 note へ `LMF CMS production` を入れる。
**この時点では稼働中の本番GAS（旧モンスターCMS）はマーカーを見ないので、影響しない。**

本番bookのバックアップ（ファイル → コピーを作成）を取ってから、
本番プロジェクトではなく**段階3のtestプロジェクトを一時的に本番bookへ向けない。**
新しい本番用GASプロジェクトを作り、`ENVIRONMENT=production` /
`SPREADSHEET_ID=<本番book>` を設定し、**`GITHUB_TOKEN` はまだ設定しない。**

そのプロジェクトで実行するのは次の3つだけ。

```text
setup1_createSheets           アシスト5シートを追加する。既存4シートには触れない
setup2_registerMe             members へ scopes 列を足し、既存行を埋める
setup3_importAssistFromMain   ALLOW_DESTRUCTIVE_SETUP 付きで3DBを取り込む
```

`setup1_createSheets` が既存の `monsters` / `edit_log` / `publish_log` /
`members` に触れないことは D-6 の4で保証し、H-3 の検査10で担保している。

- 壊れたら戻せるか: 実行前のbookコピーがある。
  **稼働中の本番GASは旧ソースのまま動いており、
  アシストのシートが増えても `Object.keys(HEADERS)` に無いので読まない**
- 確認: `setup4_checkAll` が全シートの行数を出し、
  `monsters` が実行前と同じ行数である。旧CMSの画面が今までどおり開き、保存できる

**段階6 — 本番deployment切替 + token1本化（🟡🔴）**

1. 管理者が G-1 の新 token を発行する
2. GitHub secret `CMS_PUBLISH_TOKEN` を新 token へ更新する
3. **旧CMSで「モンスターを公開」を1回実行し、成功を確認する。**
   ここで Actions 側の新 token が検証される（GAS側はまだ旧 token）
4. 段階5で作った本番プロジェクトへ `GITHUB_TOKEN` = 新 token を設定する
5. そのプロジェクトを Webアプリとして deploy する（「自分として実行」／
   「Googleアカウントを持つユーザー」）。**新しいURLが発行される**
6. 新URLで統合CMSを開き、モンスター公開を1回実行して成功を確認する
7. アシスト公開を1回実行して成功を確認する
8. 旧モンスターCMSの deployment を**アーカイブする（削除しない）**
9. 管理者のブックマークを新URLへ差し替える
10. 旧 token を revoke する

**新URLになる理由**: 旧プロジェクトを書き換えて同じURLを保つ案を採らない。
旧プロジェクトを書き換えると、失敗したときの退避先が
「GASのプロジェクト履歴から前の版を探して戻す」しか無くなる。
別プロジェクトなら**旧CMSがそのまま動いたまま残る。**
URLの変更コストは管理者1人のブックマーク1つで、退避先の価値のほうが大きい。

- 壊れたら戻せるか:
  - 手順6で失敗 → 旧CMSのURLを開けば今までどおり公開できる。GAS側の token だけ旧へ戻す
  - 手順7で失敗 → モンスター公開は既に成功している。アシストだけ止まる
  - 手順3で失敗 → token の問題。secret を旧値へ戻す
- 確認: 各手順の直後に、公開結果を「公開結果を確認」で `公開成功` まで見る

**段階7 — 旧資産の撤去（⚪）**

1. `_cms/assist-gas/` を削除する
2. `scripts/verify.js` 第15章の対象を `_cms/gas` へ移す（H-2）
3. `scripts/verify-assist-cms.js` を H-2 の内容へ書き換える
4. `docs/assist-card-cms-progress.md` と `docs/PROGRESS.md` を更新する

- 壊れたら戻せるか: `git revert`。**この段階は稼働中の何にも触れない**
- 確認: `node scripts/verify.js` FAIL 0

### I-3. 移行中もモンスターCMSの公開を止めない方法

段階1〜5で、モンスター公開に関わるものを1つも変えない。

| 資産 | 段階1 | 2 | 3 | 4 | 5 | 6 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| 旧GASプロジェクト（稼働中） | – | – | – | – | – | 切替 |
| 旧 deployment / URL | – | – | – | – | – | アーカイブ |
| `cms/publish` ブランチ | – | – | – | – | – | – |
| `cms-publish.yml` | – | – | – | – | – | – |
| `verify-cms-source.js` | – | – | – | – | – | – |
| 本番bookの `monsters` 行 | – | – | – | – | – | – |
| `GITHUB_TOKEN`（旧） | – | – | – | – | – | 差替 |

`_cms/gas/` のソースを書き換える段階2が唯一の懸念に見えるが、
**`_cms/gas/` は監査用の正であり、GASの実行には一切使われない。**
リポジトリのファイルを書き換えても、GASエディタ上のコードは変わらない
（`docs/PROGRESS.md` P11-2 実施結果：「`_cms/gas`はエディタ版の開発・監査用の正であり、
deploymentを更新したとは扱わない」）。

したがって段階6の手順5まで、稼働中のモンスターCMSは
**一度も止まらず、一度も変更されない。**

### I-4. ロールバックの単位と手順

deployment が1つになるとロールバック単位が粗くなる。それを前提にした設計にする。

| 単位 | 戻し方 | 粒度 |
|---|---|---|
| リポジトリの変更 | `git revert <PR merge>` | PR単位。細かい |
| GASのソース | **段階6以降は「旧プロジェクトのURLへ戻る」** | プロジェクト単位。粗い |
| GASのソース（段階7以降） | GASの「プロジェクト履歴」から前の版へ | 保存単位 |
| Script Properties | 管理者が手で戻す | キー単位 |
| 本番bookのデータ | 段階5前のコピー | book丸ごと。最も粗い |
| main の公開内容 | `git revert` して push | コミット単位 |

**粗さへの対処:**

1. **旧プロジェクトを削除しない。**段階6の手順8はアーカイブであって削除ではない。
   統合CMSに問題が出たら、旧URLを開けばモンスター公開は即座に復帰する。
   この退避先を**段階7の後も残す**（`_cms/assist-gas/` は消すが、GASの旧プロジェクトは残す）
2. **変更を小さく刻む。**段階6以降、統合CMSへの改修は
   「1PR = 1機能 = 1回のGAS保存 = 1回のdeploy」を守る。
   GASのプロジェクト履歴から戻せる最小単位が保存単位だからである
3. **公開経路は2本のまま。**片方の Workflow が壊れても、もう片方は動く。
   これが許可リストを1本化しない理由の実利でもある
4. **本番bookのコピーを段階5と段階6の直前に取る。**
   段階6でシートの読み書きロジックが入れ替わるため、直前のコピーが要る

---

## J. やらないこと

この統合であえて実装しないものを列挙する。

| やらないこと | 理由 |
|---|---|
| **統合CMSの公開PR経路test（旧タスク）** | **実施不可。** GitHub Actions によるPR作成には Settings → Actions → General の Workflow permissions で「Allow GitHub Actions to create and approve pull requests」を有効にする必要があり、これは admin 権限を要する。リポジトリのオーナーは別の個人アカウントで、個人リポジトリには「オーナー」と「コラボレーター」の2段階しか無く、admin をコラボレーターへ付与できない（`docs/cms-integration-plan.md` GitHub権限の前提）。この前提は変わらないため、統合の必須要件から外す |
| 許可リストの1本化 | `docs/cms-integration-plan.md` の禁止事項。ゲートの価値は狭さにある |
| 公開ブランチの1本化 | 同上。片方の失敗がもう片方を巻き込まない |
| 両ドメイン同時 publish | GASの6分実行制限（F-2） |
| 変更検出による公開先の自動判定 | F-2 |
| main の Ruleset / Branch protection の設定 | admin 権限が要る。かつ有効化するとCMSのmain直接pushが止まる（P11-9は不要と確定済み） |
| GASライブラリ化 | A-2 |
| clasp 等のGAS同期ツールの導入 | 追加パッケージは事前相談が要る（`AGENTS.md` 第9章）。`_cms/gas` の手動exportによる監査は P11-2 で確立済みで、置き換える必要が無い |
| `monsters-data.js` の配列順の変更 | `AGENTS.md` 第3章・第4章。Firestoreの解説データが配列インデックスをキーにしている |
| Firestore への一切の操作 | rules もデータもバックアップも触らない |
| モンスター側の機能追加・スキーマ変更 | 移植だけを行う。フォーム項目・検証・字数計算・ID予測・画像規則を変えない |
| アシスト側の機能追加・スキーマ変更 | 同上。3DBの schemaVersion と全検証を変えない |
| `cards/card.html` `cards/SSR-hori.html` の削除 | `docs/build-spec.md` 12-2。互換入口・転送ページとして残す |
| `docs/dormant-files.md` 記載ファイルの復活 | `AGENTS.md` 第3章 |
| 公開HTMLの移動・リネーム | `AGENTS.md` 第3章 |
| 既存の検査項目の判定基準の変更 | H-4 |
| GASの旧プロジェクトの削除 | I-4 の1。退避先として残す |
| アシスト専用 GitHub token の発行 | G-3。1本にする |

---

## 付録: 実装チェックリスト（P12-11）

段階2で作るものを、着手順に並べる。

```text
□ _cms/gas/manifest.json
□ _cms/gas/00_core.gs
   □ prop_ / optionalProp_ / positiveIntProp_        （現行のまま移す）
   □ env_ / ENV_PRODUCTION / ENV_TEST                 （新規・C-2）
   □ book_ （環境マーカー照合つき）                    （新規・C-2）
   □ nowJst_ / nowIso_                                （改名・D-3）
   □ byteAt_ / isExpectedImage_                       （現行のまま移す）
   □ text_ / dateCell_ / jsonCell_ / parseJsonCell_ 他 （アシストから移す）
   □ tz_ / today_ / pad4_ / countChars_               （モンスターから移す）
   □ CORE_HEADERS（members のみ・scopes 列つき）        （新規・B-4）
   □ me_ / requireScope_ / memberNames_                （再実装・B-4）
   □ doGet(e)                                          （新規・D-2）
   □ api_bootstrapShell                                （新規・D-4）
□ _cms/gas/10_monster.gs
   □ MON_HEADERS / MON_SHEET_* / MON_AURA_LIST / MON_MON_LIST
   □ monSheet_ / monColIndex_ / monReadAll_ / monBaselineMap_ /
     monAvailability_ / monBloodLists_ / monPredictNewId_ / monOverhead_
   □ api_monBootstrap / api_monGet / api_monPredictNewId /
     api_monCreate / api_monSave / api_monUploadImage
   □ monBuildPublishFiles_ / monRenderDataRow_ / monJsSingleQuoted_
     （公開用ファイルの組み立て。GitHub送信は 30 側）
   □ monEditLog_
□ _cms/gas/20_assist.gs
   □ ASST_HEADERS / ASST_SHEET_* / ASST_RARITIES / ASST_AURAS / ASST_CARD_TYPES 他
   □ asstSheet_ / asstRows_ / asstSetRows_ / asstLog_ / asstSha256_
   □ asstCardFromRow_ / asstEffectFromRow_ / asstAbilityFromRow_
   □ asstBuildDocuments_ / asstValidateDocuments_ / asstValidate*_
   □ asstImageFolder_ / asstReserveOcrDailyUsage_
   □ api_asstBootstrap / api_asstGetCard / api_asstSaveCard /
     api_asstSaveEffects / api_asstGetAbility / api_asstSaveAbility /
     api_asstUploadCardImage / api_asstOcrEffectImage / api_asstExport
□ _cms/gas/30_publish.gs
   □ GITHUB_* 定数 / githubRequest_ / githubRef_ / githubBlob_
   □ requirePublishable_                                （新規・C-4）
   □ publishTo_(scope, branch, files, images, logSheet)  （共通化した送信）
   □ api_monPublish   → cms/publish        件名 'CMS publish '        + nowJst_()
   □ api_asstPublish  → cms/assist-publish 件名 'CMS assist publish ' + nowJst_()
   □ publishStatus_(sha, logSheet, workflowFile) 他の状態確認一式
   □ api_monPublishStatus / api_asstPublishStatus /
     api_monLatestPublishStatus / api_asstLatestPublishStatus
□ _cms/gas/40_setup.gs
   □ allHeaders_ / setupTarget_ / consumeDestructiveGrant_
   □ setup1_createSheets（冪等・既存列を消さない）
   □ setup2_registerMe（scopes つき）
   □ setup3_importMonsterSeed      ← 鍵が要る
   □ setup3_resetMonsters          ← 鍵が要る
   □ setup3_importAssistFromMain   ← 鍵が要る
   □ setup4_checkAll / monCheck_ / asstCheck_
   □ setup5_upgradeSheets（列追加の移行用。scopes 列の追加を含む）
   □ setup6_createAssistImageFolder
□ _cms/gas/index.html / ui_common.html / ui_monster.html / ui_assist.html / ui_publish.html
□ _cms/gas/README.md（セットアップ手順・Script Properties一覧・token更新手順）
□ scripts/verify.js         第8章の作り直し（H-1）・検査1〜10の追加（H-3）
□ scripts/verify-assist-cms.js  対象範囲の移設（H-2）
□ scripts/verify-assist-source.js               （新規・F-3。段階4）
□ .github/workflows/cms-assist-publish.yml      （新規・F-3。段階4）
```

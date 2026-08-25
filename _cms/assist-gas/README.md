# ライ徹アシストCMS — P12-8 / P12-8b test仕様

このディレクトリは、アシストカードCMSを独立したtest環境で検証するためのApps Scriptソースです。
公開サイト、本番モンスターCMS、本番スプレッドシート、GitHubブランチは変更しません。

## test境界

- 独立したApps Scriptプロジェクトとスプレッドシートを使う
- Script Property `ENVIRONMENT` が厳密に `test` でなければ全処理を停止する
- 対象スプレッドシート先頭シートのA1 noteに、セットアップが
  `P12-8 ASSIST CMS TEST` を記録する。noteが無いスプレッドシートは開かない
- GitHub token、Driveフォルダ、公開ブランチを使わない
- メールアドレスは`members`シートだけに保存し、コード・HTML・exportへ含めない
- `publish_log`はtestの保存・取込・export履歴であり、公開操作を意味しない

本番のモンスターCMSと同じスプレッドシートへ追加するのはP12-11の本番移行で判断する。
P12-8では本番データ変更を避けるため同居させない。

## ファイル

- `コード.gs`: test境界、シート作成、mainからの初期取込、編集API、3DB検査・export
- `index.html`: カード・効果・能力の構造化管理画面
- `scripts/assist-effect-ocr.js`: Google Visionの座標付き結果から効果候補と既存DB差分を作るadapter
- `scripts/test-assist-effect-ocr.js`: 背景色、青丸、カード分割、スクロール重複統合のテスト

P12-9の効果OCR候補は、黄・金色背景を`conditional`、白背景を`universal`、判別不能を
`unknown`として保持する。解放段階は右上の青丸数から別判定する。OCR結果だけで既存効果を
上書きせず、原画像と既存DBの差分を管理者が確認してから保存する。
条件付き効果は説明冒頭から、効果全体に対する主血統・副血統・オーラ・モン類・種族の
一致だけを`activationConditions`へ抽出する。複数条件は`and`/`or`を持てる論理式とし、
原文も残す。説明中の特定モンスターやトレーニング要件は分類対象にしない。
条件原文は論理式を抽出した根拠とOCR照合用に保持し、公開表示用データとはしない。
説明から抽出できる場合は画面へ自動入力し、OCR誤読がある場合だけ管理者が補正する。
黄色背景の条件付き候補は、対象5種の発動条件を1件以上選択しない限り、効果編集へ反映できない。
通常は条件原文から直接抽出する。`モン類ブリーダー`または
`オーラブリーダー`の派生効果は、ブリーダー出現自体がモン類一致・オーラ一致へ依存するため、
それぞれ`monTypeMatch`・`auraMatch`として扱う。この場合も条件原文は効果欄の実文を保持し、
捏造した一致文へ置換せず、`basis: breeder-dependency`を判定根拠として併記する。
管理画面の「効果OCR」タブでは、複数のJPEG / PNG / WebPをGoogle Cloud Visionへ送り、
効果名・説明・背景種別・解放段階・全体発動条件を候補化する。画像と候補はブラウザ内だけに保持し、
Driveやスプレッドシートへ保存しない。ページ再読み込み、カード切替、候補破棄で消える。
管理者は表示中の原画像と全候補を照合し、確認チェックを入れてから「効果編集へ反映」する。
反映後も通常のtest保存を行うまではDBを更新しない。永続的な確認キュー、ファイル名一致、
`needs_review` / `verified` / `rejected`のOCR用状態管理は使用しない。
候補カードは黄色条件付き・白汎用で背景色を分ける。画像読込・Vision OCR・GAS通信中は画面下部へ
処理中モーダルを表示し、成功・失敗通知は最下部の追従操作欄より上へ固定して、長い候補一覧でも見失わず
操作ボタンとも重ならないようにする。

カード画像はカードフォームからtest専用Driveへアップロードする。管理者がモンスター画像とは別の
正確な格納位置へtest専用フォルダを作成し、そのURL末尾のフォルダIDをScript Propertiesの
`ASSIST_IMAGE_FOLDER_ID`へ登録する。画像をその指定フォルダ直下へ
`cardId.拡張子`で保存する。サブフォルダは作らない。既存91画像をDriveへ複製せず、CMSで新規選択・
差し替えた画像だけを置く。同じcardIdの旧Drive画像はゴミ箱へ移動する。
モンスターCMSと同じく、画像は2MB以下のJPEG / PNG / WebPに限定し、拡張子・MIME申告だけでなく
バイナリ先頭も検査する。公開サイトが読む正画像はGitHubの`assist-cards/`であり、Drive URLを直接表示しない。
P12-9ではDriveから公開リポジトリへの送信は行わず、P12-10以降の公開工程で扱う。

## Script Properties

| キー | 値 |
|---|---|
| `ENVIRONMENT` | `test` 固定 |
| `SPREADSHEET_ID` | P12-8専用testスプレッドシートのID |
| `GOOGLE_CLOUD_VISION_API_KEY` | 任意。効果OCRを実行するtest用Google Cloud Vision APIキー |
| `OCR_DAILY_LIMIT` | OCRの1日上限。testでは`100`（1以上の整数） |
| `ASSIST_IMAGE_FOLDER_ID` | 管理者が正確な格納位置に作成し、test・本番で共有すると明示承認したアシストカード画像用DriveフォルダのID |

値はApps Scriptのプロジェクト設定だけに保存する。リポジトリ、シート本文、ログへ転記しない。
Vision APIキーはURLへ付けず、`x-goog-api-key`ヘッダーで送信する。OCR実行直前に
`OCR_DAILY_LIMIT`を日本時間の日付単位で予約し、同時実行でも上限を超えないようScript Lockを使う。
送信後にVisionがエラーを返した場合も利用済み1件として数える。現在値はコード管理の
`OCR_DAILY_USAGE`に保存され、日付が変わった最初の実行時に自動で0件から数え直す。

## シート

`setup1_createSheets`が次を作る。列名は`コード.gs`の`HEADERS`を正とし、手で変更しない。

| シート | 1行の単位 | 用途 |
|---|---|---|
| `members` | 編集者 | Googleログインとの照合。メールアドレスを置ける唯一のシート |
| `cards` | カード | カードDB。複合値はJSON列で損失なく保持 |
| `assist_effects` | 効果 | カード内の効果。空のdraftカードもcardIdだけの1行で保持 |
| `abilities` | 能力 | 1,079件を含む能力DB。unlinked・ambiguousを削除しない |
| `publish_log` | 操作履歴 | testの取込・保存・export結果とhash |

`sourceOrder`は元JSONの配列順、`version`は同時編集検出に使う。Sheetの複合列は無損失exportの
ためJSON文字列で保持するが、管理画面ではJSONを直接入力させない。カードの`cardId`、能力の
`abilityId`と`legacyId`は管理画面から変更できない。

## 初回セットアップ

1. P12-8専用の空スプレッドシートとスタンドアロンApps Scriptプロジェクトを作る
2. Apps Scriptへ`コード.gs`と`index.html`を配置する
3. Script Propertiesへ`ENVIRONMENT=test`と`SPREADSHEET_ID`を設定する
4. モンスター画像とは別の正確なDrive格納位置へ、アシストカード画像用フォルダを管理者が作成する
5. 作成したフォルダのURL末尾（`/folders/`以降）のIDをScript Propertiesの`ASSIST_IMAGE_FOLDER_ID`へ設定する
6. `setup5_createAssistImageFolder`を実行し、指定フォルダを開けることを確認する。フォルダやサブフォルダは自動作成・移動しない
7. エディタから`setup1_createSheets`を実行する
8. `setup2_registerMe`を実行し、実行者をtestのadminとして登録する
9. `setup3_importFromMain`を実行する
10. `setup4_check`がカード91件・効果888件・能力1,079件・issues 0になることを確認する
11. Webアプリを「自分として実行」「Googleアカウントを持つユーザー」に限定してtest deployする

データ件数は将来変わるため、10の数字をコードや検査へ固定しない。初回の受入確認だけに使う。

## 編集とexport

- カード: アクセサリーを`未確認/あり/なし`、評価4項目、ステータス3組の`項目名: +数値`または`項目名: +数値%`、編成をカード選択式で保存
- 旧地形適性・距離適性は`event2`へ統合済み。カードDB・CMSシートには独立項目を持たない
- カードの公開状態は文章量ゲートで制御するため、カードDBに`status`を持たない
- 効果: 効果名・説明・解放ランクの行を追加、削除、並べ替えてカード単位で保存。0件は`draft`として残す
- 能力: abilityId検索またはカード詳細から開き、cardIdをカード選択、タグを候補選択と追加入力で保存
- `limitBreak`、`sapoRef`、能力`flags`は参照専用。画面のpayloadではなくSheetの現在値をサーバー側で保持する
- カード保存時は`cardType`許可値、画像パス・main上の画像実在、実装日、評価0〜5を検査する。export時も全画像の実在を再検査する
- export: 3DB全体を検査し、1件でも不整合があればダウンロードしない

exportされるのは`assist-cards.json`、`assist-effects.json`、`assist-abilities.json`の3件。
各ファイルのSHA-256を画面と`publish_log`へ記録する。メールアドレス、Script Properties、
非公開URL、Drive IDは含めない。P12-8ではexportをGitHubへ送らない。

## 受入テスト

1. main取込直後に`setup4_check`を実行し、issues 0を確認する
2. testカード1件の解説末尾へ識別可能な短い文字列を追加して保存する
3. 同じカードを古いversionで保存し、同時編集エラーになることを確認する
4. testカード1件の効果を読み込み、文字列を変えずに保存する
5. resolved能力1件を読み込み、文字列を変えずに保存する
6. 3DBをexportし、編集対象以外の意味データがmain入力と一致することを別スクリプトで確認する
7. testカードの変更を戻して再exportし、元入力との意味データ差分が0になることを確認する
8. `publish_log`に取込・保存・exportの結果とhashが残ることを確認する

P12-8bではさらに、JSON入力欄が画面に無いこと、カードの各複合項目・効果の順序・能力タグが
フォームで無変更保存できること、参照専用項目がpayloadから変更できないことを確認する。

OCR、自動公開、GitHub PR、画像アップロードはP12-9以降のため、この受入テストに含めない。

## 復旧

testデータを捨ててよいことを確認し、`setup3_importFromMain`を再実行する。3DBのシート内容だけを
mainの公開JSONから作り直し、`members`と`publish_log`は保持する。復旧のために本番データや
Firestoreを書き換えない。

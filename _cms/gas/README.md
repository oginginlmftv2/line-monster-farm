# ライ徹CMS 統合ソース

このディレクトリはGASプロジェクトへ反映する統合ソースの正です。P12-11段階2ではリポジトリ内だけに作成し、稼働中GASへは貼りません。

## ファイルと反映

manifest.jsonはリポジトリ側の正しい構成を列挙します。GASへ反映する段階では `.gs` と `.html` を同名で配置し、README.mdは運用文書としてリポジトリに残します。秘密値をソースへ書かず、Script Propertiesだけに置きます。

## Script Properties

ENVIRONMENTはproductionまたはrehearsal、SPREADSHEET_IDは対応bookを指定します。モンスター画像アップロードにはDRIVE_FOLDER_IDを使い、未設定の場合はsetup4_checkAllが`DRIVE_FOLDER_ID: ★未設定`を出します。productionだけGITHUB_TOKENを設定します。アシスト画像・OCRにはASSIST_IMAGE_FOLDER_ID、GOOGLE_CLOUD_VISION_API_KEY、OCR_DAILY_LIMITを使います。破壊的setupはALLOW_DESTRUCTIVE_SETUPへ関数名と当日の日付を一度だけ設定します。

常設のtest環境は作りません。大改修のたびに本番bookのコピーを作り、ENVIRONMENT=rehearsalのプロジェクトでリハーサルしてから本番へ反映します。

## P12-19 新規カード登録の反映と確認

リポジトリ内の実装対象は `20_assist.gs` と `ui_assist.html` です。管理者がGASへ反映するときは、この2ファイルを同名ファイルへ同期して保存し、必要なリハーサルを終えてからdeploymentを更新します。CodexはApps Scriptエディタ、スプレッドシート、Drive、deploymentを操作しません。

反映後は次を手動確認します。

1. CMSを開き、bootstrap完了前は「＋ 新規カード」が無効、完了後は有効になる
2. ローカルプレビューではボタンが無効で、登録できない案内が表示される
3. 本番bookのコピーを使う場合は、`ENVIRONMENT=rehearsal`と`members!A1`の環境マーカーを確認する
4. 「＋ 新規カード」から未使用cardIdと必須属性を入力し、確認ダイアログにcardId、カード名、レアリティ、未公開の案内が出る
5. 登録後に一覧件数が1件増え、作成カードの既存編集画面が開き、画像追加の案内が出る
6. `cards`末尾に1行だけ追加され、`sourceOrder`が従来最大値+1、`version`が1、画像などの初期値が仕様どおりである
7. `assist_log`に`create-card / PASS / <cardId> sourceOrder=<値>`が1件ある
8. ページ再読み込み後も作成カードが一覧に現れ、cardIdが編集画面で変更不可である
9. 重複cardIdと同じカード名+レアリティが拒否される。確認用データを本番へ作る場合は、実運用で登録する1件だけを使い、試験専用行を追加しない

行追加後に「登録済みとして扱い、再実行しないでください」と表示された場合は、同じ入力を再送しません。`cards`のcardIdと`assist_log`を確認し、曖昧な条件で行を削除しません。新規カードは画像未登録のdraft相当であり、この操作だけでは公開、GitHub送信、静的ページ生成を行いません。

## セットアップ

setup1_createSheets、setup2_registerMe、対象を明示したsetup3_*、setup4_checkAllの順で実行します。全setupの戻り値1行目でENVIRONMENTとbook名を確認します。
破壊的setupが失敗した場合も一回限りの鍵は消費されるため、再実行前にALLOW_DESTRUCTIVE_SETUPを設定し直します。

## G3 ガチャCMSの反映

ガチャCMSはシート保存とバナー画像アップロードまでです。この段階ではGitHubへ送信せず、保存してもサイトは変わりません。Codexは次の操作を実行せず、管理者が行います。

1. Script Propertiesへ`GACHA_DRIVE_FOLDER_ID`を設定する
2. `50_gacha.gs`と`ui_gacha.html`をGASエディタへ追加し、`index.html`、`00_core.gs`、`40_setup.gs`を貼り替える
3. `setup1_createSheets`を実行し、`gachas`と`gacha_types`が新規作成されたことを確認する。新規作成だけなので`ALLOW_DESTRUCTIVE_SETUP`は不要
4. `gacha_types`シートの`label`列へ、神殿祭、スタフェス、超スタフェス、周年を手で入力する
5. `members`シートで自分の`scopes`へ`gacha`を追加する
6. 「デプロイ」→「デプロイを管理」→「編集」→「新しいバージョン」→「デプロイ」で再deploymentする

既存シートの削除、全消去、行削除は行いません。保存してもサイトは変わりません。

## G4 ガチャ公開経路の反映

G4のリポジトリ変更がmainへマージされた後、管理者が次の順で反映します。CodexはGAS、シート、Drive、GitHub Actionsを操作しません。

1. `_cms/gas/30_publish.gs`、`50_gacha.gs`、`ui_gacha.html`、`ui_publish.html`を同名のGASファイルへ同期して保存する
2. `setup1_createSheets`を再実行し、既存シートを保持したまま`gacha_publish_log`が追加されたことを確認する。新規シート追加だけなので`ALLOW_DESTRUCTIVE_SETUP`は不要
3. `gachas`シートの既存画像パスがある場合は`gacha-banner/`形式であることを確認する。G4導入前は画像・Drive利用がないため移行対象はない
4. 「デプロイ」→「デプロイを管理」→「編集」→「新しいバージョン」→「デプロイ」で再deploymentする
5. ガチャ編集画面で対象を「公開対象にする」へ切り替えて保存する。これだけではサイトへ反映されない
6. 公開タブで「ガチャを公開」を押し、送信SHAを控える
7. 「ガチャ公開結果を確認」で成功を確認し、`gacha_publish_log`の送信済み・公開成功とGitHub Actionsの各検査を確認する
8. 公開ページ、トップ、リセマラ、該当カード・モンスター詳細の「登場ガチャ」をPC幅・スマートフォン幅で確認する

公開失敗時は再deploymentや連打をせず、画面のメッセージ、`gacha_publish_log`、失敗したGitHub Actions stepを共有します。`publishedAt`はGitHub送信前にシートへ確定するため、送信失敗後も残ります。次回公開でもその日付を変更しません。

## アシスト効果の一致時限定フラグ（conditional / conditionsJson）の反映

`assist_effects`シートへ`conditional`と`conditionsJson`の2列を追加します。管理者が次の順で行います。

1. `_cms/gas/20_assist.gs`、`40_setup.gs`、`ui_assist.html`を同名のGASファイルへ同期して保存する
2. `setup5_upgradeAssistEffectColumns`を実行し、`conditional / conditionsJson 列を追加しました`と表示されることを確認する。既存列・既存行は変更しないため`ALLOW_DESTRUCTIVE_SETUP`は不要
3. `setup4_checkAll`でアシスト側のissuesが0件であることを確認する
4. 「デプロイ」→「デプロイを管理」→「編集」→「新しいバージョン」→「デプロイ」で再deploymentする

この2列を追加するまで、アシスト画面は`assist_effects`の読み書きに失敗します。列追加とGAS同期は同じ作業でまとめて行います。既存行は空欄のままで`conditional=0`（限定なし）として扱われます。`conditionsJson`は`{"operator":"and"|"or","types":[...]}`だけを許可し、`types`は主血統一致・副血統一致・オーラ一致・モン類一致・種族一致の5種です。条件原文は保存しません。

## P12-16 効果OCRサニタイザの反映

対象は`ui_assist.html`の1ファイルだけです。シートの列追加もsetup関数の実行も不要です。

1. `_cms/gas/ui_assist.html`を同名のGASファイルへ同期して保存する
2. 「デプロイ」→「デプロイを管理」→「編集」→「新しいバージョン」→「デプロイ」で再deploymentする
3. アシスト効果OCRで画像を1枚読み込み、候補の効果名・説明文が次のとおりになることを確認する
   - 括弧が全角`（）`になる
   - 英字の`II` / `III`が`Ⅱ` / `Ⅲ`になる
   - 読点の直後、全角括弧の直前に半角スペースが残らない
   - 効果名は`+`の直前が半角スペース1個、説明文は`+`の前後にスペースなし
   - 複数行の説明文で改行が保たれる

**この反映前でもアシスト公開は成功します。** 公開を止めていたのは`scripts/verify.js`側の
表記チェックで、そちらはmainへのマージだけで解消します。GAS反映は、以後のOCR取り込みで
表記を自動的に揃えるためのものです。未反映の間はOCR結果に半角括弧や英字ローマ数字が
残りますが、公開は失敗しません。

## token更新

新tokenは最小権限で発行し、GitHub secretと本番GASのGITHUB_TOKENを管理者が同一作業で更新します。値を文書・ログ・チャットへ貼りません。rehearsalにはGITHUB_TOKENを設定しません。

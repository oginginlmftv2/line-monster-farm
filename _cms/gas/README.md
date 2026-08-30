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

既存シートの削除、全消去、行削除は行いません。ガチャ公開経路はG4まで追加しません。

## token更新

新tokenは最小権限で発行し、GitHub secretと本番GASのGITHUB_TOKENを管理者が同一作業で更新します。値を文書・ログ・チャットへ貼りません。rehearsalにはGITHUB_TOKENを設定しません。

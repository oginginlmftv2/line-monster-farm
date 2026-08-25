# ライ徹CMS 統合ソース

このディレクトリはGASプロジェクトへ反映する統合ソースの正です。P12-11段階2ではリポジトリ内だけに作成し、稼働中GASへは貼りません。

## ファイルと反映

manifest.jsonはリポジトリ側の正しい構成を列挙します。GASへ反映する段階では `.gs` と `.html` を同名で配置し、README.mdは運用文書としてリポジトリに残します。秘密値をソースへ書かず、Script Propertiesだけに置きます。

## Script Properties

ENVIRONMENTはproductionまたはrehearsal、SPREADSHEET_IDは対応bookを指定します。productionだけGITHUB_TOKENを設定します。アシスト画像・OCRにはASSIST_IMAGE_FOLDER_ID、GOOGLE_CLOUD_VISION_API_KEY、OCR_DAILY_LIMITを使います。破壊的setupはALLOW_DESTRUCTIVE_SETUPへ関数名と当日の日付を一度だけ設定します。

## セットアップ

setup1_createSheets、setup2_registerMe、対象を明示したsetup3_*、setup4_checkAllの順で実行します。全setupの戻り値1行目でENVIRONMENTとbook名を確認します。

## token更新

新tokenは最小権限で発行し、GitHub secretと本番GASのGITHUB_TOKENを管理者が同一作業で更新します。値を文書・ログ・チャットへ貼りません。rehearsalにはGITHUB_TOKENを設定しません。

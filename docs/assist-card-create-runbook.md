# アシストカード新規登録・初回画像公開（P12-19 / P12-20）管理者手順書

最終更新: 2026-08-31

対象: `_cms/gas/20_assist.gs` の `api_asstCreateCard(payload)` と
`api_asstSaveCard(payload)`、`_cms/gas/30_publish.gs` の `api_asstPublish()`、
`_cms/gas/ui_assist.html` の「＋ 新規カード」。

本番影響: GAS同期・deploymentは🟡。アシスト公開を実行すると🟡🔴で、3DB・画像・生成ページが
`cms/assist-publish`を経てmainへ反映される。

Codex・Claudeは Apps Script エディタ、スプレッドシート、Drive、deployment、公開を
操作しない。以下はすべて管理者の手作業である。

## 0. 前提

- 反映対象はリポジトリの `_cms/gas/20_assist.gs` と `_cms/gas/ui_assist.html` の2ファイルだけ。
  リポジトリが正、GASエディタはデプロイ先（`_cms/gas/README.md`）
- 反映前に `git checkout main && git pull` で最新の `main` を取得する
- 大改修時は本番bookのコピーと `ENVIRONMENT=rehearsal` の一時プロジェクトで先に通す
  （設計B-1のリハーサル）。本番bookで直接試さない
- 追加専用APIである。既存カードの更新・削除・並べ替え・`asstRewriteSheet_()` による
  全体書換えは行わない

## 1. 反映手順

1. 最新 `main` の `_cms/gas/20_assist.gs` を、GASの同名ファイルへ全文貼り替えて保存する
2. 同じく `_cms/gas/ui_assist.html` を貼り替えて保存する
3. 必要なら本番bookのコピー＋`ENVIRONMENT=rehearsal` の一時プロジェクトで第2章を通す
4. 問題なければ本番プロジェクトを再deployする（新しいバージョンを作成して差し替える）
5. リハーサル用のコピーと一時プロジェクトを捨てる

Script Properties、`GITHUB_TOKEN` などの秘密値はコード・ログ・PR・チャットへ書かない。

## 2. 実機確認項目

反映後、CMSを開いて次を順に確認する。

1. bootstrap完了前は「＋ 新規カード」が無効、完了後に有効になる
2. ローカルプレビューではボタンが無効で、登録できない案内が表示される
3. 本番bookのコピーを使う場合、`ENVIRONMENT=rehearsal` と `members!A1` の環境マーカーが
   リハーサル側を指している
4. 「＋ 新規カード」から未使用cardIdと必須属性を入力すると、確認ダイアログに
   cardId・カード名・レアリティ・未公開の案内が出る
5. 登録後に一覧件数が1件増え、作成カードの既存編集画面が開き、画像追加の案内が出る
6. `cards` シート末尾に1行だけ追加され、`sourceOrder` が従来最大値+1、`version` が1、
   画像・イベント2・実装日・解説が空欄、`accessoryStatus` が unknown、
   `stats` / `formations` が空配列、`limitBreak` / `ratings` / `sapoRef` が null である
7. `assist_log` に `create-card / PASS / <cardId> sourceOrder=<値>` が1件ある
8. ページ再読み込み後も作成カードが一覧に現れ、cardIdが編集画面で変更不可である
9. 重複cardId、および同じ「カード名 + レアリティ」が拒否される

確認用の行を本番へ増やさない。実運用で登録する1件をそのまま確認に使う。

## 3. cardId の規則

```
^[a-z][a-z0-9]*-(MR|SSR)-[a-z0-9]+$    64文字以内
```

- 自動採番しない。管理者入力をtrimしたうえでサーバー側が検査する
- cardId内のrarityと入力rarityの一致を要求する
- 既存91件の実測最大長は24文字

## 4. 失敗したときの扱い

- 「登録済みとして扱い、再実行しないでください」と表示された場合は、**同じ入力を再送しない**。
  行追加は開始済みで、検算またはログ記録だけが失敗している
- `cards` のcardIdと `assist_log` を突き合わせ、実際に追加されているかを確認する
- 曖昧な条件で行を削除しない。並べ替え・再採番もしない
- 判断がつかない場合は操作を止めて進捗管理側へ報告する

## 5. 新規登録操作だけでは行わないこと

- 公開（`main` への反映）、GitHub送信、静的カードページの生成
- 画像の取得・Driveアップロード（新規カードは画像未登録のdraft相当）
- 既存カード・効果・能力の更新

画像アップロード後の保存と公開は、P12-20の反映後に第6章の手順で行う。

## 6. P12-20 初回画像公開の反映・復旧手順

P12-19の新規登録後、Driveへ画像をアップロードしたカードは、画像がまだmainにない。
P12-20は、検査済み画像が指定Driveにあればカード保存を許可し、アシスト公開コミットへ
同じ画像バイト列を含める。mainにもDriveにも画像がない場合、形式不一致、2MB超過、同名重複は
従来どおり停止する。

### 6-1. GAS反映

1. P12-20のPRをmainへマージし、管理者環境で最新mainを取得する
2. `_cms/gas/20_assist.gs` と `_cms/gas/30_publish.gs` を、本番GASの同名ファイルへ全文貼り替える
3. 保存し、新しいversionで本番deploymentを更新する
4. Script Properties、Sheet、Driveのファイルを手で変更しない

### 6-2. `aab-MR-julia` の再開

このカードは新規登録と `aab-MR-julia.jpg` のDriveアップロードまで完了している。
同じcardIdの再登録、行削除、画像の再アップロードは行わない。

1. CMSを再読み込みし、`aab-MR-julia`を開く
2. Driveアップロード後のversionが維持され、画像欄が
   `assist-cards/aab-MR-julia.jpg`であることを確認する
3. 必要項目を入力して「カードを保存」する。main未公開でも指定Driveの検査済み画像で保存できる
4. 公開前検査を確認し、管理者判断でアシスト公開を実行する
5. `assist_publish_log`、GitHub Actions、main上の画像、生成カードページを順に確認する
6. `assist.html`の末尾にジュリアが1件だけ追加され、カード名・画像・詳細リンクが正しいことを確認する

### 6-3. 異常時

- 「mainまたは指定Driveに存在しません」: 画像パスとDriveの完全一致名を確認し、再登録しない
- 「同名画像が複数」: 公開を止め、対象ファイルIDを特定してから管理者が復旧方法を判断する
- 「拡張子と画像データが一致しません」または2MB超過: 公開を止め、元画像を確認する
- GitHub送信後の後処理失敗: 再実行せず、表示されたコミットSHAと公開ログを確認する

# アシストカード新規登録（P12-19）管理者手順書

最終更新: 2026-08-30

対象: `_cms/gas/20_assist.gs` の `api_asstCreateCard(payload)` と
`_cms/gas/ui_assist.html` の「＋ 新規カード」。

本番影響: GAS同期・deploymentは🟡。この操作だけでは公開・GitHub送信・静的ページ生成を
行わないため🔴には至らない。

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

## 5. この操作が行わないこと

- 公開（`main` への反映）、GitHub送信、静的カードページの生成
- 画像の取得・Driveアップロード（新規カードは画像未登録のdraft相当）
- 既存カード・効果・能力の更新

画像を含む保存・公開経路はP12-20として分離しており、別承認まで開始しない。

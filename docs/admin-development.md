# 管理者向け Claude 開発・公開手順

最終更新: 2026-08-22

この文書は、開発知識が少なくても、Claudeへ依頼して通常ページの変更を安全に
作業ブランチ、検証、PR、mainへのマージまで進めるための手順である。

モンスターの新規登録・属性・解説・編成・画像はこの手順の対象外で、GAS版ライ徹CMSだけを使う。

## 1. 初回だけ確認する環境

Windows TerminalまたはClaudeがコマンドを実行できる画面で、次を1行ずつ確認する。

```powershell
git --version
node --version
claude --version
```

判定:

- Git: バージョン番号が表示される
- Node.js: `v20.x`を推奨。少なくともNode 18以上
- Claude: バージョン番号が表示される、またはClaudeから対象フォルダを開ける
- GitHub: ブラウザで対象リポジトリを開き、`Actions`と`Pull requests`を閲覧できる
- リポジトリ: 対象フォルダで次が成功する

```powershell
git remote -v
git status --short
node scripts/verify.js
```

`origin`が対象GitHubリポジトリを指し、verifyの最後が`FAIL 0`なら準備完了。
`git status --short`に何か表示された場合は進めず、その全文をClaudeへ渡す。

pushできるかは、実際の作業ブランチを作った後にClaudeが確認する。GitHubのトークンや
パスワードをチャット、コード、文書へ貼らない。

## 2. 変更してよい場所を判定する

| 変更したいもの | 方法 |
|---|---|
| モンスターの新規登録・属性・解説・編成・画像 | GAS版ライ徹CMS |
| カード、日記、トップ、通常記事 | Claudeと通常の作業ブランチ |
| 自動生成されたモンスターページ・sitemapの生成部分 | 入力を正しい管理元で変更し、`build.js`で生成 |
| ルール・計画・管理者手順 | Claudeと文書用作業ブランチ |

判断できない場合は、ファイルを触る前に「これはGAS版CMSとClaudeのどちらで更新しますか」と
Claudeへ聞く。モンスター関連ファイルをリポジトリ側で直接直さない。

## 3. Claudeへ最初に渡す依頼

次のテンプレートを使う。ブランチ名は進捗管理チャットが提示したものをそのまま入れる。

```text
line-monster-farm リポジトリで次の作業をしてください。

目的:
  {変更したい内容}
作業ブランチ:
  {提示されたブランチ名}
本番影響:
  {⚪ / 🔴 / 🟡}

最初にAGENTS.mdと関連文書を読み、git status --shortを確認してください。
未保存変更があれば破棄・退避せず停止して報告してください。
問題がなければmainを最新化し、作業ブランチを作ってください。
編集前に変更予定ファイルを宣言してください。
実装後は必要に応じてnode build.jsを実行し、必ずnode scripts/verify.jsでFAIL 0を確認してください。
差分を提示してください。私が明示するまでcommit・push・PR作成・mergeはしないでください。
```

Claudeは画面や端末に出た文言をそのまま説明できる。エラー時は要約せず、表示された全文を渡す。

## 4. 作業開始の固定手順

Claudeが次の順で実行したことを確認する。

1. `AGENTS.md`を最後まで読む
2. `docs/dormant-files.md`と作業に関係する文書を読む
3. `git status --short`を実行する
4. 出力が空でなければ停止する
5. 出力が空なら次を実行する

```bash
git switch main
git pull --ff-only origin main
git switch -c <提示されたブランチ名>
```

6. 編集前に「変更予定ファイル」と`docs/production-impact.md`の区分を宣言する

未保存変更を見つけた場合、管理者が内容を確認するまで`reset`、`checkout`、削除、退避をしない。
CMS公開がmainを自動更新するため、毎回必ず最新mainから始める。

## 5. 実装と検証

通常ページの変更は次を満たす。

- 指示した範囲だけを変更する
- 公開コンテンツを変えたら`index.html`の更新履歴の先頭へ1行追記する
- 日記追加では、インデックス対象の日記を増やす場合だけ`build.js`の
  `existingBlocks.length !== 24`を新しい既存URL数へ更新する
- noindexの日記を増やす場合は、その定数とsitemapを変更しない
- 生成入力または公開ページに関係する作業は次の順で確認する

```bash
node build.js
node scripts/verify.js
git status --short
git diff --check
git diff
```

完了条件は`node scripts/verify.js`の最終結果が`FAIL 0`であること。
文書だけの作業でもverifyは省略しない。buildを実行した場合、意図しない生成物が差分へ
混ざっていないことも確認する。

2026-08-22時点では、CMS末尾追加後の配列ロックと既知の平文パスワードについてWARNが出る。
`FAIL 0`でもWARN全文をClaudeに説明させ、既知2件以外が増えていたら作業を止める。

## 6. レビュー後にcommit・push・PRを依頼する

差分と検証結果に納得したら、Claudeへ明示的に次のように依頼する。

```text
この差分をコミットし、作業ブランチをpushして、main向けのPRを作成してください。
PR URLとチェック状況を教えてください。まだマージしないでください。
```

Claudeは通常、次を行う。

1. 変更ファイルを再確認する
2. コミットを作る
3. 作業ブランチを`origin`へpushする
4. `main`向けPRを作る
5. PR URL、差分、チェック状況を報告する

GitHub CLIを使えない場合は、push後にGitHub画面へ進む。

1. リポジトリ上部の`Compare & pull request`を押す
2. `base: main`、`compare: <作業ブランチ>`を確認する
3. タイトルと説明を確認する
4. `Create pull request`を押す

## 7. mainへマージして公開する

GitHub Pagesはmainを直接配信しているため、`Merge pull request`は公開ボタンと同じ意味を持つ。
🔴の変更は公開してよい時刻になってから行う。

1. PRの`Files changed`で対象外ファイルが無いことを確認する
2. `Checks`またはPR下部で必要なチェックが成功していることを確認する
3. Claudeへ「このPRをmainへマージしてください」と明示するか、GitHub画面で
   `Merge pull request`を押す
4. 表示された内容を確認し、`Confirm merge`を押す
5. `Pull request successfully merged and closed`を確認する
6. マージ済みブランチは`Delete branch`で削除する
7. 公開ページをPC幅とスマートフォン幅で目視確認する

マージ方法の選択肢が表示された場合は、リポジトリの通常設定に従う。分からなければ押さずに
画面文言をClaudeへ渡す。

## 8. CMS公開は別経路

モンスターはGAS管理画面で保存し、adminが「公開」を押す。

```text
GAS → cms/publish → generate-ids.js → verify-cms-ids.js
    → build.js → verify.js → 許可差分確認 → main → 即公開
```

管理画面の「公開成功」とGitHub Actionsの`Verify CMS predicted IDs`成功を確認する。
失敗した場合はmainが更新されない。シートA列、`BLOOD_ORDER`、予測IDを自己判断で直さず、
「公開結果を確認」と`publish_log`の全文を共有する。

## 9. ブランチ保護を今は有効化しない

CMS公開Workflowはmainへ直接pushする。CMS用の迂回設定を確認せずにmainのブランチ保護を
有効化すると、通常PRは守れてもCMS公開が止まる可能性がある。

GitHubの`Settings` → `Branches`または`Rules`を閲覧しても、次が揃うまでは保存しない。

- CMSが保護を迂回する正規の主体と権限
- テスト用ブランチでの公開成功
- 失敗時の復旧方法
- 通常PRとCMS公開の両方を通す確認項目

## 10. 小さな非公開影響変更で一連の手順を試す

第2段階では、公開HTMLやCMSデータを変えない文書1行の変更で練習する。

推奨タスク:

- ブランチ: `chore/p10-2-admin-smoke-test`
- 変更: `docs/admin-development.md`の「動作確認日」を1行更新
- 区分: ⚪
- 禁止: 公開HTML、CMS管理データ、自動生成物の編集

確認する流れ:

1. 未保存変更が無いことを確認
2. 最新mainを取得
3. 作業ブランチ作成
4. 1行だけ変更
5. `node build.js` → `node scripts/verify.js`でFAIL 0
6. 差分が文書1ファイルだけか確認
7. commit・push・PR作成
8. GitHub画面の文言に沿ってチェック確認
9. mainへマージ
10. ブランチ削除とローカルmainの再取得

この練習でサイト表示は変わらないが、GitHub上のmainには文書変更が反映される。

## 11. 止まってClaudeへ報告する条件

- `git status --short`に開始前から変更がある
- `git pull --ff-only`が失敗する
- `node build.js`またはverifyがFAILになる
- 意図しない公開HTML、CMS管理データ、自動生成物が差分に出る
- GitHubのチェックが赤い、または保留のまま
- mergeボタンが無い、またはブランチ保護の設定変更を求められる
- CMSのID検算が不一致になる

同じ方法で2回失敗したら、追加操作をせず、コマンド、画面文言、現在のブランチ名を共有する。

# 管理者向け Claude 開発・公開手順

最終更新: 2026-08-23

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

2026-08-23時点では、P11-6で公開クライアントの平文パスワードを撤去済みである。
配列ロックは351体へ更新済みで、通常結果はWARN 0。`FAIL 0`でもWARNが出た場合は
既知扱いにせず、全文を確認して作業を止める。

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

CMS公開Workflowはbuild前に`Verify CMS source commit`を実行し、次を検査する。

- GAS元コミットが単一親で、その親が実行時点のmainと一致する
- 件名がGASの`CMS publish YYYY-MM-DD HH:mm:ss`形式である
- 変更が`monsters-data.js`、CMS用JSON 2件、規則どおりの`monster/`画像だけである
- CMS入力の削除、rename、規則外画像、許可外ファイルが無い

build後は`Confirm generated-file scope`で生成差分を別に検査する。どちらかが失敗した場合、
mainは更新されない。`GAS元コミットの親が現在のmainではありません`なら、実行中のWorkflowが
終わってからGAS管理画面で最新mainを基にもう一度公開する。許可外変更、複数親、画像不一致なら
再公開を繰り返さず、失敗stepと`publish_log`の全文を共有する。ゲートを無効化して通さない。

## 9. ブランチ保護を今は有効化しない

CMS公開Workflowはmainへ直接pushする。CMS用の迂回設定を確認せずにmainのブランチ保護を
有効化すると、通常PRは守れてもCMS公開が止まる可能性がある。

GitHubの`Settings` → `Branches`または`Rules`を閲覧しても、次が揃うまでは保存しない。

- CMSが保護を迂回する正規の主体と権限
- テスト用ブランチでの公開成功
- 失敗時の復旧方法
- 通常PRとCMS公開の両方を通す確認項目

### P11-7: test用branchだけでPR経路を確認する

mainのRulesetを作る前に、`cms/protected-test`だけを対象に次を確認する。
`.github/workflows/cms-protected-test.yml`は手動実行専用で、本番の
`CMS_PUBLISH_TOKEN`、`cms/publish`、main、Pagesを更新しない。

#### 事前設定

1. P11-7のリポジトリ変更をmainへマージする
2. GitHubの`Code` → branch選択 → `View all branches` → `New branch`で、
   最新mainから`cms/protected-test`を作る
3. GitHub右上のプロフィール → `Settings` → `Developer settings` →
   `Personal access tokens` → `Fine-grained tokens` → `Generate new token`
4. 対象repositoryは`line-monster-farm`だけ、Repository permissionsは
   `Contents: Read and write`、`Pull requests: Read and write`、
   `Metadata: Read-only`とし、短い有効期限を設定する
5. 値を文書やチャットへ貼らず、repositoryの`Settings` →
   `Secrets and variables` → `Actions` → `New repository secret`で、
   名前`CMS_PROTECTED_TEST_TOKEN`として保存する
6. `Settings` → `Rules` → `Rulesets` → `New ruleset` →
   `New branch ruleset`を開く
7. Ruleset名は`P11-7 protected test`、Enforcement statusは`Active`、
   Bypass listは空、Target branchesは`Include by pattern`で
   `cms/protected-test`だけにする
8. `Require a pull request before merging`、`Require status checks to pass`
   の`verify`、`Block force pushes`、`Restrict deletions`を選び、対象が
   mainでないことを再確認して`Create`を押す

`Actions` → `General`の`Workflow permissions`は読み取り確認だけ行う。
このtestは専用PATを使うため、`Read and write permissions`や
`Allow GitHub Actions to create and approve pull requests`へ変更しない。

#### 実行順

`Actions` → `CMS protected PR test` → `Run workflow`で、次を順に実行する。

1. `direct-push-rejection`: runが成功し、summaryに直接push拒否のPASSが出る
2. `normal-pr`: 作成されたPRのbaseが`cms/protected-test`で、
   `verify`成功後に通常mergeできる
3. `cms-pr`: 許可されたCMS入力、ID生成・検算、build、verify、生成差分検査が成功し、
   base `cms/protected-test`のPRが作成される
4. `revert-pr`: 直前にmergeしたPRの40文字merge SHAを`merge_sha`へ入力し、
   revert PRの`verify`成功後にmergeできる

PRは自動mergeしない。各PRの`Files changed`、base、Checksを管理者が確認してからmergeする。
test branchのbuild済みtree確認をPages相当の試験とし、Pagesの配信元はmainから変更しない。

#### 失敗時と後片付け

- PR作成前の失敗ではtest targetは不変。作成済みPRを閉じ、`p11-7/*`branchを削除する
- 直接pushが成功してrunがFAILした場合はRuleset設定不備。mainへ進まず、
  Rulesetを`Disabled`にして`cms/protected-test`を最新mainから作り直す
- merge後の問題は`revert-pr`で戻す。戻せなければtest Rulesetを無効化し、
  test branchを削除して最新mainから再作成する
- 全シナリオの証跡を記録後、`p11-7/*`、`cms/protected-test`、
  `CMS_PROTECTED_TEST_TOKEN`、test Rulesetを削除し、fine-grained tokenを失効する
- testが完了するまでmainのRuleset、本番token、GAS、Pages設定を変更しない

## 10. 第2段階のCMS・セキュリティ監査へ引き継ぐ

文書1行だけの人工的な通し稽古は保留する。Git、Node.js、GitHubのPR・マージ経路は
P10-1で動作を確認できた。次は通常ページ更新ではなく、第2段階「CMSとセキュリティの仕上げ」を行う。

次回は`docs/claude-next-session.md`をClaudeへ渡し、P11-1としてCMS公開経路、既知WARN、
GitHub・GAS・Firestoreの権限境界を読み取り監査する。監査中は公開HTML、CMS管理データ、
自動生成物、外部設定を変更しない。実装は監査結果を基に別タスクへ分ける。

mainのブランチ保護、Secrets、Firestoreルールなどの外部設定は、画面文言と現在値を確認しても
保存しない。変更が必要な場合は、本番影響、CMSの迂回経路、テスト方法、復旧方法を先に示し、
管理者の明示承認を受けてから行う。秘密値そのものはチャットや文書へ貼らない。

## 11. 止まってClaudeへ報告する条件

- `git status --short`に開始前から変更がある
- `git pull --ff-only`が失敗する
- `node build.js`またはverifyがFAILになる
- 意図しない公開HTML、CMS管理データ、自動生成物が差分に出る
- GitHubのチェックが赤い、または保留のまま
- mergeボタンが無い、またはブランチ保護の設定変更を求められる
- CMSのID検算が不一致になる

同じ方法で2回失敗したら、追加操作をせず、コマンド、画面文言、現在のブランチ名を共有する。

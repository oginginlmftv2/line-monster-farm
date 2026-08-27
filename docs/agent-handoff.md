# エージェント引き継ぎ書

このファイルは**作業の型**を扱う。現在地・完了状況・保留は`docs/PROGRESS.md`が正。
二重管理を避けるため、ここに進捗の数値を書かない。

---

## 1. 体制

| 役割 | 担当 | やること |
|---|---|---|
| 進捗管理 | Claude（チャット） | 検証、プロンプト設計、設計判断。**実装しない** |
| 実装 | Codex | ブランチを切り、実装し、PRを作る。**マージしない** |
| マージ・外部操作 | 管理者 | PRマージ、GAS操作、Google Drive、GitHub設定 |

進捗管理が不在でも作業を続けられるよう、この文書に型を残す。

### 権限の前提（P11-10で確定。再検討しない）

リポジトリは依頼主の個人アカウントにあり、利用者はcollaborator（write）のみ。
**admin権限は原理的に付与できない。**
Rulesets・Workflow permissions・branch protectionを前提にした設計は採れない。

公開ゲートは`scripts/verify-cms-source.js`と`verify-assist-source.js`として
Workflow内に実装されており、ブランチ保護が無くても機能する。

---

## 2. 絶対に守る制約

```
リポジトリはpublic。秘密情報を絶対にコミットしない
  GitHubトークン / スプレッドシートID / DriveフォルダID
    → GAS Script Properties と GitHub Secrets のみ
  メールアドレス → membersシートのみ。コード・JSON・HTML・文書に書かない
  検出したトークン文字列をverifyの出力やログへ出さない（file:line だけ）

Firestoreのセキュリティルールを緩めない
公開クライアントの書き込みAPI、平文パスワードを復活させない
Claudeは認証情報を扱わない。token発行・secret更新は管理者が行う
verify-cms-source.js と verify-assist-source.js の許可リストを1本化しない
```

**GitHub Pagesが`main`を直接配信している。マージ＝即公開。**

---

## 3. 検証の型

報告を信じない。必ず自分で確かめる。方針ではなく、実際に何度も欠陥を捕まえた作法である。

```bash
# 1. originから独立に確認する（ブランチを作らない）
git fetch origin --prune
git checkout --detach origin/<branch>

# 2. 完了条件を実測で照合する
node build.js && node scripts/verify.js
node scripts/test-verify-assist-cms.js
node scripts/test-verify-cms-source.js
node scripts/test-assist-effect-ocr.js
git diff --stat origin/main..HEAD
git status --porcelain          # build後に0であること

# 3. 禁止対象が本当に無変更か
git diff --name-only origin/main..HEAD -- <禁止パス...> | wc -l
```

**追加された検査は、自分で壊して発火させる。**
`/tmp`にコピーし、検査ごとに1件以上FAILを出す。
**開発ツールの破壊テスト報告を信じない。自分で再現する。**
指定した項目に加え、**退行方向**（元の実装へ戻す）も試す。

UIの変更はヘッドレスブラウザで実測する。修正前と修正後で同じ測定をして並べる。
片方だけでは証明にならない。

```bash
cd /tmp && mkdir -p dom && cd dom && npm i playwright-core --silent
# Chromium は /opt/pw-browsers/chromium-*/chrome-linux/chrome
```

---

## 4. 🔴 期待値は必ず実測から作る

**このプロジェクトで最も繰り返した失敗である。**
完了条件に数値を書く前に、必ず実際に測ること。

### PASS件数の数え方

```
検査7（ブランチ名）    main では WARN、規則に合う作業ブランチでは PASS
                      → 同じ状態でも main と作業ブランチで件数が1違う
                      → 「PASS N / WARN 0」は矛盾した指定になりうる

verify-assist-cms.js / verify-assist-source.js の中の規則
                      → verify.js の1つの ok() へ集約される
                      → 規則を何個足しても PASS件数は動かない

件数が動くのは verify.js に head() / ok() を直接足したときだけ
```

確認方法。

```bash
git checkout -q -B <実際に使うブランチ名> origin/main
node scripts/verify.js | tail -2
```

### データを変えるPRは生成物も含む

`cards/*.html`・`sitemap.xml`・`monsters/**` はリポジトリにコミットされている生成物。
GitHub Pagesが`main`を直接配信しているため、**データを変えたら生成物も同じPRへ入れる。**
入れないとCIが落ち、「sitemapに載らないのにindex扱い」等の矛盾が公開される。

```
手順: データ修正 → node build.js → 生成物ごとコミット
生成物を手で編集しない
```

---

## 5. ブランチ名

**進捗管理が提示する。開発ツールも管理者も自分で考えない。**
`docs/branch-naming.md`が正。

```
<type>/<タスクID>-<slug>
type は feat / fix / chore / content / refactor の5つだけ
```

**`docs` というtypeは存在しない。** 実施記録・調査報告・引き継ぎのPRも`chore`を使う。
`docs/...`を使うと検査7がWARNを出す。過去4本がこの誤りで警告を出していた。

---

## 6. プロンプトの型

```
リポジトリ: oginginlmftv2/line-monster-farm
作業前に必ずAGENTS.mdを最後まで読むこと（+ 関連docsを名指し）

タスクID / ブランチ名 / 基点SHA / 本番影響（⚪🟡🔴）
「管理者の承認は取得済み。着手してよい。」

## 経緯        なぜ要るのか。差し戻しでないなら「差し戻しではない」と明言する
## 着手手順    git checkout main → pull → log で基点SHAを確認 → ブランチを切る
## やること    是正ごとに節を分け、現状のコードを引用し、直し方を書く
## 破壊テスト  追加した検査ごとに1件以上FAILを出させる（必須。報告に書かせる）
## 制約        変更してよいファイルを列挙し、それ以外を具体名で禁止する
## 完了条件    実測値で書く。PASS件数まで指定する
## 報告に書くこと
## 完了後      PR作成まで。マージは管理者
```

効いた工夫。

```
期待値を実測から書く。合わないときは「データを歪めず停止して報告」と明記する
禁止事項を「触らない」ではなく具体的なファイル名で書く
破壊テストの対象ファイルを名指しする
「判断に迷ったら実装せず報告する（AGENTS.md 第8章）」を毎回入れる
1タスク1PR。複数段階を1つにまとめない
検査の追加は実装と同じPRに入れる。後回しにするとその隙間に不整合が入る
```

---

## 7. 過去に犯した誤り（同じ轍を踏まないために）

| # | 誤り | 教訓 |
|---|---|---|
| 1 | 「リポジトリは利用者のもの」と決めつけた | 権限の前提は一次情報で確認する |
| 2 | 期待値 57/91 を誤って提示した | 実測から期待値を作る |
| 3 | 「凸解放内容は効果DBに無い」と断言した | DBを作ってから確認する |
| 4 | 検査を段階2から段階4へ繰り延べた | 検査を後回しにすると隙間に不整合が入る |
| 5 | 「mainのSHAが変わらないこと」を判定基準にした | 正しくは「treeが変わらないこと」 |
| 6 | 手順の前後関係を依存関係から検証しなかった | 手順は依存で並べる |
| 7 | 「戻り値は実行ログに出る」と書いた | GASエディタは戻り値を表示しない。Logger.log が要る |
| 8 | 期待値「要確認: なし」が誤り（membersは6列→7列） | 旧実装と新実装の定義を突き合わせる |
| 9 | `generatedFrom` 更新の順序を決めなかった | 公開Workflowは途中で verify.js を回す。期待値は公開の**前**に更新する |
| 10 | PASS 76 / WARN 0 という矛盾した完了条件を3回書いた | 4章のとおり実測する |
| 11 | OCR正規化の対象を`scripts/`だけに絞った | **実運用の経路を一次情報で特定する。** 同じロジックが2箇所に複製されていた |
| 12 | データPRの変更ファイルを4つに絞った | 生成物もコミット対象である（4章） |

**開発ツールの停止判断は正しかったことが多い。** 矛盾を指摘されたら、
まず自分の指定を疑うこと。

---

## 8. 同じロジックが2箇所にある箇所（片方だけ直す事故に注意）

```
OCRの正規化    scripts/assist-effect-ocr.js（参照実装・テスト用）
               _cms/gas/ui_assist.html（★実運用。ブラウザ側JS）
               GASはNodeモジュールをrequireできないため手で複製されている

公開ログ       30_publish.gs の publishLog_ ほかをモンスター・アシストで共用
               （設計B-3。1実装で共用する形にしてある）
```

**`_cms/gas/` を変更したら、GASプロジェクトへ貼り直して再deployしないと本番は変わらない。**
GASへ貼るのは10ファイル（`manifest.json`と`README.md`は貼らない）。

---

## 9. CMS管理下のデータを直すとき

3DB（`assist-cards.json` / `assist-effects.json` / `assist-abilities.json`）と
モンスターのデータはCMS管理下にある。
**リポジトリのJSONだけ直しても、次のCMS公開でシートの内容に戻される。**

```
1. PRで正規化 → node build.js → 生成物ごとコミット → マージ
2. 本番CMSでアシスト公開を1回（未公開の編集を出し切る）
   ★ 飛ばすと次の手順で未公開編集が消える
3. setup3_importAssistFromMain を実行（ALLOW_DESTRUCTIVE_SETUP が要る）
4. アシスト公開を1回。mainとの差分がゼロなら同期完了
```

`ALLOW_DESTRUCTIVE_SETUP` は `<関数名> <当日の日付(JST)>` の形式で、実行後に自動で消える。
**失敗した場合も消費されるので、再実行には再設定が必要。**

---

## 10. 公開の経路

```
モンスター  GAS api_monPublish  → cms/publish        → verify-cms-source.js    → main
アシスト    GAS api_asstPublish → cms/assist-publish → verify-assist-source.js → main

ゲートが見るもの（両方同一）
  単一親 / 親が実行時点のorigin/main / 件名の形式 / 許可外パスの拒否 /
  100644 blob以外の拒否 / 画像のマジックバイトと2MB上限 / build後の生成差分が許可範囲だけ

件名  'CMS publish <JST>' / 'CMS assist publish <JST>'   yyyy-MM-dd HH:mm:ss
```

**公開は「押した瞬間の差分」ではなく「前回公開以降の全編集」を出す。**
公開前に`exportedAt`と最終公開日を突き合わせ、未公開分の有無を確認する。

**`api_asstPublish`はDriveフォルダを走査し、カードDBから参照されている画像を
無条件に公開へ含める。** フォルダへ置いた時点で次の公開に載る。

---

## 11. ノイズに見えて正当なもの（消さない）

```
効果の重複81件            凸の再適用
未リンク能力512件          ツールは全カード192種の能力DB。ライ徹は91枚だけを使う
重複候補44件
フレリアの共有画像4件
SAPO候補3件
未参照画像11件
cards/SSR-hori.html       旧URLからの誘導用。noindex + canonical + meta refresh
```

---

## 12. 参照すべきドキュメント

```
AGENTS.md                          エージェントの行動規約。第7章=報告形式 / 第8章=停止規約
CLAUDE.md                          コンテンツ運用（ガチャ更新・日記・カード追加）
docs/PROGRESS.md                   ★現在地・次の作業・保留・差し戻し履歴
docs/branch-naming.md              ブランチ命名規則
docs/cms-integration-design.md     CMS統合の設計のrecord
                                   A-3構成 / B-1book方針 / B-3シート構成 / B-6cardStatus
                                   C-2環境マーカー / C-5公開の局在 / D-2命名規約
                                   F-1送信範囲 / F-3許可リスト / G-1token仕様
                                   H-2検査の移設 / H-3検査一覧 / I-2各段階の手順
docs/assist-data-audit.md          アシスト3DBの監査と段階3〜8の実施記録
docs/production-impact.md          本番影響の分類
_cms/gas/README.md                 GASのScript Propertiesとセットアップ手順
```

---

## 13. 押さえておくべき設計判断（再検討しない）

```
A-1  Apps Scriptプロジェクトは1つに統合する
B-1  アシストのシートを本番bookへ同居させる。SPREADSHEET_IDは1つ
     常設のtest環境は作らない。大改修のたびに本番bookのコピーでリハーサルする
B-3  assist_log は操作履歴、assist_publish_log は公開履歴。役割が違う
     公開状態のポーリングはシート名を引数にした1実装で共用する
C-2  環境マーカー = ENVIRONMENT（production / rehearsal）
     + membersシートA1のメモ「LMF CMS <env>」
     両方揃わないと book_() が開かない。本番bookとコピーを取り違えたときの唯一の安全網
C-5  公開タブは production かつ admin のときだけ出る
F-3  許可リストは2本のまま。互いに素であることを検査6・7で機械照合する
     Workflowのconcurrency groupは共通（cms-publish）で直列化する

詳細ページは全件生成し、noindexで制御する
  ゲートは「生成するか」ではなく「インデックスするか」を決める
  モンスター: 可視本文800字以上
  アシストカード: 可視本文800字以上 かつ 解説50字以上
  noindexページにAdSenseスクリプトを出力しない

robots.txt に Disallow を書かない
  noindexを持つページをDisallowすると、クローラーがnoindexを読めず
  インデックスから消えなくなる

モン類の表示順は公式順（創造→幻霊→魔族→獣族→怪物→無機）
血統順（BLOOD_ORDER 34件）はIDの根拠。絶対に並べ替えない
既存モンスターの名前を変えない。確定IDと公開URLの根拠である
```

---

## 14. OCRテキスト正規化ルール

正と実装状況は`scripts/assist-effect-ocr.js`の冒頭コメントにある。
**実運用の経路は`_cms/gas/ui_assist.html`**（8章）。

```
1  | → Ⅱ の誤読補正
2  MAX↑ の除去
3  行頭 •（U+2022）の除去。★ ・（U+30FB 中黒）は削除しない
   「赤・青」のように本文中で正当に使われるため
4  括弧を全角へ統一
5  読点後の半角スペース削除
6  + の前後  見出し（name）は + の前に半角スペース1つ
             説明文（description）は前後ともスペースなし
```

**NFKCは全角を半角へ潰す。** `Ⅱ`→`II`、`（）`→`()`。
保護対象を一時退避してからNFKCを掛け、あとで戻すこと。
NFKC自体は全角英数の半角化など望ましい効果があるので丸ごと外さない。

---

## 15. 外部の能力DB（lMfDB）

```
大元    futsalife24-bot/lMfDB の ux/index.html 内の ABILITIES 配列
        1ファイル完結・ビルド工程なし・add_ability.py 経由でのみ編集
        更新頻度が高い（3日で98件増えた実績あり）
ライ徹  src/data/assist-abilities.json は、その断面を取り込んだもの
```

連携前に決める必要があること。

```
🔴 能力データの正をどちらにするか
   推奨: ツール ABILITIES を正、ライ徹CMSは取り込み専用
🟡 source=伝授 の扱い
   ツールの source は イベント/閃き/EXトレ/伝授 の4値
   ライ徹の許可値は3値（伝授が無い）。そのまま取り込むと source不正 で FAIL する
   該当は12件。ライ徹側を4値へ広げるのが推奨
   場所: _cms/gas/20_assist.gs の ASST_ABILITY_SOURCES
        scripts/verify-assist-cms.js の ALLOWED.abilitySource
```

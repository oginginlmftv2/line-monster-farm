# 本番影響とマージ方針

最終更新: 2026-08-22

作業開始前に、変更がどこへ届くかを必ず区分する。

| 記号 | 意味 | 判断 |
|---|---|---|
| 🔴 | 公開サイトが変わる | `main`反映＝即公開。実行タイミングを管理者が決める |
| 🟡 | 本番データが変わる | GAS・シート・Drive・Firestore。失敗時に復旧が必要 |
| ⚪ | 公開サイトと本番データに影響しない | 文書・検証・ローカル調査など、リポジトリ内で完結 |

## 現在の公開構成

GitHub Pagesは`main`を直接配信しており、ステージングは無い。

```text
通常更新: 作業ブランチ → PR → mainへマージ → 即公開
CMS更新:  GAS → cms/publish → ID生成・検算 → build → verify → mainへpush → 即公開
```

`gh-pages`へ切り替える旧P5-4案は実施していない。Cloudflare AccessとWorkerでCMSを作る
旧P8案も、GAS版ライ徹CMSへ置き換わった。現行構成は`.github/workflows/cms-publish.yml`と
`CLAUDE.md`を根拠に判断する。

## mainのブランチ保護

CMS公開Workflowは検証完了後に`git push origin HEAD:main`を実行する。
したがって、迂回設定なしで`main`への直接pushを禁止するとCMS公開が止まる。

- CMS用の迂回設定、GitHub App、またはPR経由の新しい公開経路を設計するまでは有効化しない
- 設定を変える場合は、先にテスト用経路でCMS公開が最後まで通ることを確認する
- 「一般ユーザーの直接pushを禁止したい」という理由だけで即時に有効化しない
- 現在の保護状態はリポジトリだけでは確認できない。GitHub画面で確認しても変更はしない

## 作業別の区分

| 作業 | 区分 | 理由・注意 |
|---|---|---|
| ルール・計画・管理者手順の文書 | ⚪ | サイト表示とCMSデータは変わらない |
| `scripts/verify.js`など検証だけの変更 | ⚪ | 公開HTMLを変更しない場合 |
| カード・日記・トップ・通常記事 | 🔴 | PRのmainマージが即公開 |
| `build.js`入力または生成規則 | 🔴 | 生成HTML・sitemap・一覧へ波及する |
| GAS管理画面でモンスターを保存 | 🟡 | シート・Driveの本番データを変更 |
| GAS管理画面の「公開」 | 🟡🔴 | CMSデータ変更に加え、成功時はmainを直接更新して即公開 |
| Firestoreルール変更 | 🟡🔴 | 読取を閉じると既存表示が壊れうる |
| robots・canonical・noindex・sitemap | 🔴 | 検索エンジンの対象が変わる |
| 公開HTMLの移動・リネーム | 実施禁止 | URLと被リンクを失うため |

## 通常ページのマージ方針

1タスク1ブランチを原則とし、`docs/branch-naming.md`に従う。

1. 未保存変更が無いことを確認する
2. 最新`main`から作業ブランチを作る
3. 変更範囲と本番影響を宣言する
4. 必要なら`node build.js`、必ず`node scripts/verify.js`を実行する
5. 公開コンテンツを変えた場合は`index.html`の更新履歴へ1行追記する
6. 差分を確認してからpush・PRを行う
7. 🔴は管理者が公開タイミングを決め、GitHubのチェック成功後にmainへマージする

詳細な画面操作は`docs/admin-development.md`を参照する。

## CMS公開の安全条件

`.github/workflows/cms-publish.yml`は次をすべて満たした場合だけmainを更新する。

1. `CMS_PUBLISH_TOKEN`が設定されている
2. `cms/publish`の親が実行時点の`origin/main`と一致する
3. `node generate-ids.js`が成功する
4. `node scripts/verify-cms-ids.js`が名前・4桁ID・arrayIndexを全件照合する
5. `node build.js`が成功する
6. `node scripts/verify.js`がFAIL 0になる
7. 差分が許可されたCMS入力・生成物の範囲だけである

どれか1つでも失敗した場合はmainを更新しない。管理画面の「公開結果を確認」と
`publish_log`、GitHub Actionsの失敗ステップを確認し、自己判断でデータを直さない。

## Firestoreのセキュリティルール

現在の運用方針は読み取り許可・書き込み全面禁止である。

```text
allow read: if true;
allow write: if false;
```

公開ページが認証なしでFirestoreを読む箇所があるため、`allow read: if false`へ変更しない。
書き込み全面禁止により、コメント投稿と旧管理ツールの保存も停止している。

- `monster-match.html`
- `ability-match.html`
- `assist-effect-input.html`

これらを使うためにルールを自己判断で緩めない。必要になった場合は作業を止め、対象、時間、
バックアップ、復旧手順を決めてから管理者が判断する。

## robots.txtとnoindex

`noindex`を持つページを`Disallow`してはいけない。クローラーがページを取得できず、
`noindex`を認識できなくなるためである。検索結果から外すURLはクロールを許可し、
ページ側の`noindex`を読ませる。`scripts/verify.js`がこの矛盾を検出する。

## 本番反映後の確認

🔴または🟡🔴の変更では、次を管理者が確認する。

- GitHub Actionsの必要なチェックが成功している
- 対象ページをスマートフォン幅とPC幅で開ける
- 画像、内部リンク、canonical、更新履歴が意図どおりである
- CMS公開では管理画面が「公開成功」で、ID検算ステップがPASSしている
- 問題があれば追加修正を重ねず、該当PRまたは公開単位を特定して差し戻しを判断する

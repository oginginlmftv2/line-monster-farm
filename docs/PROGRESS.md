# 進捗

最終更新: 2026-08-18（P0-4 レビュー待ち。P3-1 完了）

状態: `未着手` / `進行中` / `レビュー待ち` / `完了` / `保留`

> **完了にするのは進捗管理チャットの判断。開発ツールの自己申告では完了にしない。**
> 完了条件は `claude/ライ徹_開発計画.md` 第3章を参照。

## P0 保全（最優先）

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P0-1 | Firestoreルールの確認 | 人 | – | **完了** | 2026-08-16 | **12コレクション全てが `allow read, write: if true`。期限付きルールではない** |
| P0-2 | Firestoreバックアップ取得 | 人 | – | **完了** | 2026-08-16 | ブラウザから全12コレクションをJSONダンプ。monsters93(コメント76) / cards90(コメント35) / assistEffects74 / bbs_posts62 / game2048 784 / gameRunner97 / friends8 / monsterImages1 / cardAbilities1 / abilityVotes2 / reports1 / tips0 |
| P0-3 | Search Console 基準値の記録 | 人 | – | **保留** | | プロパティ確認直後で「データを処理しています」表示。**2026-08-19以降に再確認**。P1以降をブロックしない |
| P0-4 | コメント機能の停止表示 | Claude Code | `fix/p0-4-comment-suspend` | **レビュー待ち** | | 🔴本番影響。P0-5の前提 |
| **P0-5** | **Firestoreルールの封鎖（write全面禁止）** | 人 | – | 未着手 | | 🔴本番影響。**P0-4完了後に実施** |

### P0-1 の確認結果（記録）

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /cards/{cardId=**}            { allow read, write: if true; }
    match /monsterImages/{document=**}  { allow read, write: if true; }
    match /cardAbilities/{document=**}  { allow read, write: if true; }
    match /abilityVotes/{document=**}   { allow read, write: if true; }
    match /monsters/{document=**}       { allow read, write: if true; }
    match /tips/{document=**}           { allow read, write: if true; }
    match /friends/{document=**}        { allow read, write: if true; }
    match /reports/{document=**}        { allow read, write: if true; }
    match /bbs_posts/{document=**}      { allow read, write: if true; }
    match /game2048/{document=**}       { allow read, write: if true; }
    match /assistEffects/{document=**}  { allow read, write: if true; }
    match /gameRunner/{document=**}     { allow read, write: if true; }
  }
}
```

**65,658字の解説が第三者に書き換え・削除可能な状態。** P0-4→P0-5 で封鎖する。

## P1 基盤整備

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P1-1 | ルール文書の配置 | Claude Code | `chore/p1-agent-rules` | **完了** | 2026-08-18 | 検証済み。配布物とバイト単位で一致 |
| P1-2 | verify.js＋Actions＋ロック | Claude Code | `chore/p1-agent-rules` | **完了** | 2026-08-18 | lock hash=4036c84b2ffff6a7 で一致。初回CIは既知FAILで赤 |
| P1-3 | モン種・血統slug確定 | 人 | `chore/p1-3-slug-policy` | **完了** | 2026-08-18 | 検証済み。獣=kemono。血統34種も確定 |
| P1-4 | monster-ids.json 生成 | Claude Code | `chore/p1-agent-rules` | **完了** | 2026-08-18 | 348件・新規38件・ID重複0 |
| P1-5 | 新規38体をシートに反映 | 人 | – | 未着手 | | |

## P2 データ移行

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P2-1 | Firestoreエクスポータ作成 | Claude Code | `chore/p2-firestore-export` | **レビュー待ち** | | 既定はドライラン。--write で生成 |
| P2-2 | monsters-editorial.json 生成 | Claude Code | `chore/p2-firestore-export` | **レビュー待ち** | | |
| P2-3 | cards-editorial.json 生成 | Claude Code | `chore/p2-firestore-export` | **レビュー待ち** | | |
| P2-4 | 字数分布→ゲート閾値決定 | Claude | chore/p2-4-gate-threshold | 未着手 | | |

## P3 クリーンアップ（独立・並行可）

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P3-1 | robots/sitemap矛盾解消 | Claude Code | `fix/p3-1-robots-sitemap` | **完了** | 2026-08-18 | 検証済み。sitemap 38→37件。CIが緑になった |
| P3-2 | noindex漏れ2件の修正 | Codex | fix/p3-2-noindex-stubs | 未着手 | | |
| P3-3 | canonical欠落6件の補完 | Codex | fix/p3-3-canonical | 未着手 | | |
| P3-4 | tools/ img/site/ への移動 | Codex | `chore/p3-4-move-tools` | 未着手 | | **★`google59378bd79752d094.html` を動かさないこと**（Search Console所有権） |
| P3-5 | 薄い日記11本の統合 | Claude | content/p3-5-diary-merge | 未着手 | | |
| P3-6 | 重複記事の統合・役割分担 | Claude | content/p3-6-dedupe-guides | 未着手 | | |

## P4 画像整理

> **★計画変更（ズレ区分C）** P0-2のバックアップで、Firestoreの `monsterImages/assignments` に
> **332件の画像割り当てが既に保存されている**ことが判明した。
> 当初「414枚の手作業マッチング」を想定していたが、**マッチングは実質完了済み**で、
> 必要なのはエクスポートとリネームだけになった。

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P4-1 | monsterImages/assignments のエクスポート | Claude Code | `chore/p2-firestore-export` | **レビュー待ち** | | P2-1のエクスポータに含めた |
| P4-2 | 332件をIDでリネームし `img/monster/<ID>.jpg` へ配置 | Codex | `chore/p4-2-image-rename` | 未着手 | | |
| P4-3 | 割り当ての無い16体を個別に対応 | 人 | – | 未着手 | | 348−332。P6をブロックしない |

`match_monsters.py` は**不要になった可能性が高い。** P4-1で332件の中身を見てから判断する。

## P5 ビルド基盤

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P5-1 | build-spec.md 作成（設計のみ） | Claude | chore/p5-1-build-spec | 未着手 | | ★最重要。ここに投資 |
| P5-2 | HTMLテンプレート初版 | Claude | feat/p5-2-templates | 未着手 | | |
| P5-3 | build.js 実装 | Codex | feat/p5-3-build-script | 未着手 | | |
| P5-4 | Actions→gh-pages デプロイ | Codex | feat/p5-4-deploy-actions | 未着手 | | |

## P6 ページ生成

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P6-1 | 詳細93件の生成 | Codex | feat/p6-1-monster-detail-pages | 未着手 | | |
| P6-2 | 導入文40本の執筆 | Claude | content/p6-2-taxonomy-intro | 未着手 | | ★品質の分かれ目 |
| P6-3 | 集約ページ40件の生成 | Codex | feat/p6-3-taxonomy-pages | 未着手 | | |
| P6-4 | monsters.html 刷新・旧URL誘導 | Codex | feat/p6-4-monster-index | 未着手 | | |
| P6-5 | sitemap.xml 自動生成 | Codex | feat/p6-5-sitemap | 未着手 | | |

## P7 カード活用

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P7-1 | reroll.html 刷新 | Claude | content/p7-1-reroll-ranking | 未着手 | | |
| P7-2 | テーマ別まとめ2〜3本 | Claude | content/p7-2-card-articles | 未着手 | | |

## P8 CMS

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P8-1 | admin/ 隔離 | Codex | chore/p8-1-admin-isolation | 未着手 | | |
| P8-2 | Cloudflare Access 設定 | 人 | – | 未着手 | | |
| P8-3 | 管理画面UI設計 | Claude | chore/p8-3-cms-spec | 未着手 | | |
| P8-4 | Worker＋GitHub API | Codex | feat/p8-4-cms-worker | 未着手 | | |
| P8-5 | mf2024 撤去 | Codex | fix/p8-5-remove-password | 未着手 | | verify.js「8.」がPASSになる |
| P8-6 | 日記投稿機能 | Codex | feat/p8-6-diary-posting | 未着手 | | |

## P9 再申請

| ID | タスク | 担当 | ブランチ | 状態 | 完了日 | 備考 |
|---|---|---|---|---|---|---|
| P9-1 | インデックス反映の確認 | 人 | – | 未着手 | | ★これを待たずに申請しない |
| P9-2 | AdSense再申請 | 人 | – | 未着手 | | |

---

## 未決事項

| # | 内容 | 状態 |
|---|---|---|
| 1 | `獣` のローマ字 | **決定: `kemono`**（2026-08-16） |
| 2 | 血統34種のslug | 未決 |
| 3 | レアモンの新規採番順（現在gwImg昇順） | 未決 |
| 4 | Firestoreのセキュリティルールの現状 | 未確認 |
| 5 | AdSense 6回目の不合格通知の日付 | 未確認 |

## 差し戻し履歴

| 日付 | タスクID | 内容 | 対応 |
|---|---|---|---|
| | | | |

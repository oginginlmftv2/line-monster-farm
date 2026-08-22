# 次回Claude作業 引き継ぎ

最終更新: 2026-08-23

この文書の「管理者からClaudeへ渡す文面」を、そのまま次回のClaudeへ渡す。

## 管理者からClaudeへ渡す文面

```text
line-monster-farm リポジトリでP12-3「アシストカードデータ監査と読取export」を行ってください。

作業ブランチ: chore/p12-3-assist-data-audit
本番影響: ⚪

最初にAGENTS.mdを最後まで読み、docs/dormant-files.md、
docs/assist-card-cms-progress.md、docs/PROGRESS.md、docs/ライ徹_開発計画.md、
docs/build-spec.md、CLAUDE.mdの関連箇所を読んでください。

git status --shortを確認し、未保存変更があれば破棄・退避せず停止してください。
問題がなければgit switch main、git pull --ff-only origin mainを行い、
chore/p12-3-assist-data-auditを作成してください。
編集前に変更予定ファイルと本番影響区分を宣言してください。

このタスクでは公開HTML、カードデータの値、画像、自動生成物、GAS、Sheets、Drive、
Firestore rules・document、GitHub設定を変更しません。

休止中ファイルを直接読まないでください。100KB超のファイルは内容を展開せず、
Nodeスクリプトで件数、SHA-256、項目名、型、重複、参照関係、不一致だけを抽出してください。

次を推測せず監査してください。

1. cards/cards-data.jsの現行cardId、基本属性、カード画像の一致
2. src/data/cards-editorial.jsonとFirestore cards collectionの差
3. assist-effect-data.jsのカード別効果件数、項目、未登録カード
4. lMfDB_abilities.jsonと旧lmfdb_abilities_data.jsonの差、重複、source、tags
5. 能力の表示名・rarityから現行cardIdへ対応できる件、候補、未解決
6. Firestore cardAbilities/assignmentsとassist-abilities画像の対応、未参照・欠落
7. 旧assistEffects collectionまたはcards.assistEffectsが残る場合の読取状態

Firestoreの値が必要な場合は読取exportだけを行い、保存・削除・rules変更をしないでください。
Claudeから外部状態を確認できない場合は完了扱いにせず、管理者が画面で確認する手順を示してください。

成果物には次を含めてください。

- 入力ファイルごとのSHA-256と件数
- 現行91カードをcardId基準にした対応表
- 自動確定、候補、未解決の区分と理由
- P12-4カードDB、P12-5効果DB、P12-6能力DBが独立して変換できる入力一覧
- 移行前バックアップと復旧方法
- docs/assist-card-cms-progress.mdとdocs/PROGRESS.mdの同期

node scripts/verify.jsでFAIL 0、git diff --check、差分確認を行ってください。
commit・push・PR・mergeは、管理者が明示するまで行わないでください。

最後はAGENTS.md第7章の形式で、確認できた事実、確認できなかった外部状態、
管理者確認項目、次の作業1件を報告してください。
```

## 現在地

- P12-1リセマラ記事刷新はPR #30でmain反映・Pages公開済み
- P12-2でアシストカードの3DB、静的詳細、OCRレビュー、専用CMSを設計
- P11-7〜9はGitHub管理権限待ちで保留。main Rulesetを先に有効化しない
- AdSense再申請は更新利用規約への管理者同意待ちで保留
- Firestoreはread許可・write全面禁止を維持し、P12-3では読取だけを行う
- 詳細設計と実施順はdocs/assist-card-cms-progress.mdを正とする

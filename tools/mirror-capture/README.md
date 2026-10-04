# iPhoneミラーリング撮影ツール

MacのiPhoneミラーリングに映したゲーム画面を、ショートカット1つで撮る。
**撮影モード**で保存先を作業ごとに分け、別の作業の画像が混ざらないようにする。

| 物 | 役割 |
|---|---|
| `shot.sh` | ミラーリング窓だけを、今のモードの保存先へ撮る。撮るたびに通知とログ |
| `lmf-mode.sh` | モードの確認・切り替え。Claude・LMFMode.app・手入力のどれもこれを通る |
| `mirror-winid.swift` | ミラーリング窓のウィンドウIDを出す |
| `launcher-main.swift` | LMFShot.app / LMFMode.app の本体（スクリプトを呼ぶだけ） |
| `install.sh` | 上を `~/Pictures/lmf-capture/` へ入れ、`~/Applications/LMFMode.app` を作る |

正はこのフォルダ。実行時はworktreeが消えても動くよう、`install.sh` がリポジトリの外へコピーする。
**ここを直したら `install.sh` を実行し直す。**

## 置き場所（リポジトリの外）

```text
~/Pictures/lmf-capture/
  bin/          lmf-mode・shot.sh・mirror-winid（install.sh が入れる）
  modes.conf    モード一覧（モード<TAB>表示名<TAB>保存先）。行を足せばモードが増える
  mode          今のモード（1行）
  mode.log      モードを変えた記録（日時・新・旧・誰が）
  shot.log      撮影の記録（日時・結果・モード・保存先）
  basics/       基礎データ（スキル monster-basics-capture が読む）
  unsorted/     モードが未設定・不明のときの保存先
```

秘伝調査（`hiden`）の保存先は `~/claude/lmf-aisho/shots/`。調査側の自動撮影（`lmf-aisho/bin/snap.sh`）が
そのまま動くよう、従来の場所にしている。画像も観測データも公開リポジトリには入れない。

## モードの切り替え

どこから変えても、`mode.log` に誰が変えたかが残り、Macに通知が出る。

| どこから | 操作 |
|---|---|
| Claude | `~/Pictures/lmf-capture/bin/lmf-mode basics --by claude` |
| アプリ | **LMFMode.app** を開く → 一覧から選ぶ（今のモードが選ばれた状態で出る）。ショートカットを割り当てると速い |
| ターミナル | `~/Pictures/lmf-capture/bin/lmf-mode hiden` |

今のモードの確認は `lmf-mode`（引数なし）。保存先・枚数・最後に誰がいつ変えたかが出る。

## 取り違えを防ぐ仕組み

- **撮るたびに「基礎データ に保存（3枚目）」と通知が出る。**モードの切り忘れにその場で気づける
- **どこからモードを変えても通知が出る。**Claudeが変えたことも、アプリで変えたことも見える
- **モードが未設定・不明なら `unsorted/` へ撮る。**作業フォルダへ推測で入れない
- 知らないモード名への切り替えは拒否する（`modes.conf` に無い名前）
- 秘伝調査の自動撮影は「`shots/` に新しい画像が増えたか」で成功を判定するので、
  モードが `hiden` 以外だと「撮影失敗」と今のモードを出して止まる
- ミラーリング窓が見つからず画面全体を撮ったときは、通知と `shot.log`（`win=none`）に出る
- Claudeは作業が終わってもモードを勝手に戻さず、戻すか聞く（撮影の途中かもしれないため）

## ショートカット

- **LMFShot（撮影）**：既存の `~/claude/lmf-aisho/LMFShot.app` と ⌃⇧⌘R をそのまま使う。
  中の `lmf-aisho/bin/shot.sh` がこのツールの `shot.sh` を呼ぶ（2026-10-05から）。
  画面収録の許可はこのアプリに付いているので、アプリを作り直すと許可を付け直す必要がある
- **LMFMode（モード切り替え）**：`~/Applications/LMFMode.app`。LMFShotと同じやり方でショートカット
  （例 ⌃⇧⌘M）を割り当てる。画面収録の許可は不要
- 新しいMacで使い始めるときは `install.sh --shot-app` で `~/Applications/LMFShot.app` も作る

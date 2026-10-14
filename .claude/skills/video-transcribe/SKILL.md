---
name: video-transcribe
description: ローカルにある動画・音声ファイル（ガチャ解説動画・配信の録画など）を、Mac上のwhisper.cppで文字起こしし、ゲーム用語の誤変換を直して要点・ガチャ更新テンプレート・管理人ぎんの文体の文章にまとめる。「動画を文字起こしして」「この動画の音声を起こして」「動画からガチャ情報をまとめて」と言われたとき、または .mp4/.mov/.m4a などのパスを渡されて内容をまとめるよう頼まれたときに使う。Geminiが動画を読めないときの代わり。
---

# 動画の文字起こし

音声は外部へ送らず、Macの中だけで文字に起こす。**起こした全文は作業用。**サイトにそのまま載せない。

## 道具（2026-10-14 導入）

| 物 | 場所 |
|---|---|
| whisper.cpp（v1.7.1をCPUだけでビルド） | `~/tools/whisper.cpp/main` |
| モデル（small・日本語対応・465MB） | `~/whisper-models/ggml-small.bin` |
| 音声の取り出し | macOS標準の `afconvert`（ffmpegは無い） |

このMacはIntel（x86_64）＋macOS 15で、Homebrewがビルド済みパッケージを配っていない（2026-09にサポート終了）。
**`brew install ffmpeg` などは依存24個のソースビルドになり失敗するので使わない。**

`main` が無くなっていたら作り直す（Makefileがあるv1.7.1を使う。Metalは古いSDKで通らないので外す）：

```bash
mkdir -p ~/tools && cd ~/tools && git clone --depth 1 --branch v1.7.1 https://github.com/ggerganov/whisper.cpp.git
cd ~/tools/whisper.cpp && GGML_NO_METAL=1 make -j8 main
```

モデルが無ければ：

```bash
mkdir -p ~/whisper-models && curl -L --fail -o ~/whisper-models/ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

## 手順

作業ファイルは scratchpad の `tr/` に置く（リポジトリに入れない）。

```bash
S=<scratchpad>/tr; mkdir -p $S
afconvert -f WAVE -d LEI16@16000 -c 1 "<動画のパス>" $S/audio.wav
afinfo $S/audio.wav | grep duration          # 長さ。処理時間は長さの半分〜同じくらい（4分半で約2分20秒）
~/tools/whisper.cpp/main -m ~/whisper-models/ggml-small.bin -f $S/audio.wav -l ja -t 8 -otxt -of $S/out \
  --prompt "LINEモンスターファーム、ガチャ、アシストカード、モン類、オーラ、血統、MR、SSR" 2>$S/log.txt
```

- 10分を超える動画は `run_in_background` で回し、終わるのを待つ
- `--prompt` に、そのガチャのモンスター名・カード名・技名を足すと固有名詞の誤変換が減る
- 出力は `$S/out.txt`。Read で全文を読む

## 誤変換を直す

固有名詞は**既存DBの名前と照らして**直す（`src/data/monster-ids.json`・`src/data/assist-cards.json`・
`src/data/monster-skills.json`・`src/data/assist-abilities.json`）。2026-10-14 の実例：

| 起こし | 正 |
|---|---|
| 想像 | 創造 |
| 原例・原霊 | 幻霊 |
| ユーリー | 有利 |
| 中性度 | 忠誠度 |
| トレ高価 | トレ効果 |
| クリリス | クリ率 |
| かしこさせて | かしこさステ |
| シンデンサイ・新伝祭 | 神殿祭 |
| 魔法兵・魔法瓶 | マホウビン |
| 寸刑 | すんけい |
| 6大会見 | 六大開拳 |
| 総長中 | そうちょうちゅう |
| 単連 | 鍛錬 |

- 直せない語（候補が決まらない）は**推測で埋めず**、「〇〇（どの技か不明）」と報告する
- **数値はスクショ・DBが正。**音声の数値と食い違ったら、両方を示して音声側を採らない

## まとめ方（頼まれた形で出す）

1. **要点**：モンスター・カードごとに箇条書き。評価・注目点を短く
2. **ガチャ更新テンプレート**：`CLAUDE.md` の「ガチャ更新テンプレート」の形。オーラ・モン類・血統はDBで確かめ、
   分からないものは `？`。ピックアップ文は1行20文字以内
3. **管理人ぎんの文体の文章**：次の節

全文をチャットに貼り直さない（長い・誤変換だらけ）。必要なら scratchpad のパスを伝える。

## 管理人ぎんの文体で整える

動画・配信の話し手は管理人ぎん本人（ギギTV）。文体の正は `diary-writer` スキルの「文体」と
「配信の文字起こしを使うとき」。書く前にそこと見本記事を読む。要点：

- です・ます調の口語。一人称は「俺」
- 結論を先に。1段落3〜5文
- 口癖を自然に：「正直」「めちゃくちゃ」「なんやかんや」「〜と思います」「〜んですよね」
- 「動画でこう言っていました」と報告しない。その場で話している地の文にする
- 口語の強さはマイルドに（「ハチャメチャに」→「めちゃくちゃ」程度に、断定は和らげる）
- 挨拶・チャンネル登録のお願い・ガチャを回した実況などの脱線は入れない（頼まれたら入れる）
- 事実（数値・名前）は発言・スクショ・DBにあるものだけ

どこに載せる文章か（ピックアップ文・ガチャページ・日記・モンスター解説）を最初に聞く。長さと語り口がそれで決まる。
モンスター解説はCMS管理なので、文章を渡すところまで。リポジトリの `monsters-editorial.json` は書かない。

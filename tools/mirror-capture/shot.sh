#!/bin/bash
# iPhoneミラーリングのウィンドウだけを、今の撮影モードの保存先へ撮る。
# モードが未設定・不明なら unsorted/ へ撮る（作業フォルダへ推測で入れない）。
# ウィンドウが見つからないときは画面全体を撮る（撮り逃しを防ぐため）。
# 撮るたびに shot.log へ1行残し、保存先を通知で出す（モードの切り忘れにその場で気づくため）。
CAP="${LMF_CAPTURE_HOME:-$HOME/Pictures/lmf-capture}"
BIN="$(cd "$(dirname "$0")" && pwd)"
LOG="$CAP/shot.log"
MODE=$(tr -d ' \n' 2>/dev/null < "$CAP/mode")
if DIR=$("$BIN/lmf-mode" dir "$MODE" 2>/dev/null) && [ -n "$DIR" ]; then
  LABEL=$(awk -F'\t' -v m="$MODE" '!/^#/ && $1==m {print $2; exit}' "$CAP/modes.conf")
else
  DIR="$CAP/unsorted"; LABEL="未設定（unsorted）"; MODE="${MODE:-none}!"
fi
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d-%H%M%S); FILE="$DIR/$STAMP.png"; n=2
while [ -e "$FILE" ]; do FILE="$DIR/$STAMP-$n.png"; n=$((n+1)); done
if ID=$("$BIN/mirror-winid"); then
  ERR=$(/usr/sbin/screencapture -o -l"$ID" "$FILE" 2>&1); RC=$?
else
  ID=none
  ERR=$(/usr/sbin/screencapture "$FILE" 2>&1); RC=$?
fi
echo "$(date '+%F %T') rc=$RC mode=$MODE win=$ID file=$FILE err=$ERR" >> "$LOG"
if [ $RC -eq 0 ]; then
  N=$(find "$DIR" -maxdepth 1 -type f -iname '*.png' | wc -l | tr -d ' ')
  MSG="$LABEL に保存（${N}枚目）"; [ "$ID" = none ] && MSG="$MSG ※ミラーリング窓が無く画面全体"
else
  MSG="撮影失敗：$ERR"
fi
osascript -e "display notification \"$MSG\" with title \"LMF撮影\"" >/dev/null 2>&1 || true
exit $RC

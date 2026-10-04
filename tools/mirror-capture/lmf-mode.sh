#!/bin/bash
# 撮影モードの確認と切り替え。Claude・LMFMode.app・手打ちのどこから変えても、この1本を通る。
#
#   lmf-mode                 今のモード・保存先・誰がいつ変えたか・保存先の枚数
#   lmf-mode <モード> [--by 変更者]   切り替える（例: lmf-mode basics --by claude）
#   lmf-mode --pick          ダイアログで選ぶ（LMFMode.app から呼ばれる）
#   lmf-mode list            選べるモードの一覧
#   lmf-mode dir [モード]    保存先フォルダを出す（shot.sh から呼ばれる）
#
# 変えるたびに mode.log へ1行残し、Macの通知を出す。どこから変えても入力者に見えるようにするため。
set -u
CAP="${LMF_CAPTURE_HOME:-$HOME/Pictures/lmf-capture}"
CONF="$CAP/modes.conf"
MODE_FILE="$CAP/mode"
LOG="$CAP/mode.log"

die() { echo "lmf-mode: $*" >&2; exit 1; }
[ -f "$CONF" ] || die "$CONF がありません。tools/mirror-capture/install.sh を実行してください"

# modes.conf の1行 = モード<TAB>表示名<TAB>保存先（# で始まる行は注釈）
field() { awk -F'\t' -v m="$1" -v f="$2" '!/^#/ && $1==m {print $f; exit}' "$CONF"; }
expand() { case "$1" in "~"*) echo "$HOME${1#\~}";; *) echo "$1";; esac; }
current() { tr -d ' \n' 2>/dev/null < "$MODE_FILE"; }
notify() { osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true; }
count() { find "$1" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' \) 2>/dev/null | wc -l | tr -d ' '; }

set_mode() {
  local m="$1" by="$2" prev label
  label=$(field "$m" 2) ; [ -n "$label" ] || die "モード「$m」は modes.conf にありません（lmf-mode list で確認）"
  prev=$(current)
  mkdir -p "$(expand "$(field "$m" 3)")"
  printf '%s\n' "$m" > "$MODE_FILE.tmp" && mv "$MODE_FILE.tmp" "$MODE_FILE"
  printf '%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$m" "${prev:-なし}" "$by" >> "$LOG"
  notify "撮影モード：$label" "${prev:-なし} → $m（${by}が変更）"
  echo "撮影モード: $m（$label）← ${prev:-なし}  保存先: $(expand "$(field "$m" 3)")"
}

case "${1:-}" in
  ""|status)
    m=$(current)
    if [ -z "$m" ] || [ -z "$(field "$m" 2)" ]; then
      echo "撮影モード: 未設定（撮った画像は $CAP/unsorted/ に入ります）"; exit 0
    fi
    d=$(expand "$(field "$m" 3)")
    echo "撮影モード: $m（$(field "$m" 2)）"
    echo "保存先: $d（画像 $(count "$d") 枚）"
    [ -f "$LOG" ] && tail -1 "$LOG" | awk -F'\t' '{print "最後の変更: " $1 "  " $3 " → " $2 "（" $4 "）"}'
    ;;
  list)  awk -F'\t' '!/^#/ && NF>=3 {printf "%-8s %s  %s\n", $1, $2, $3}' "$CONF" ;;
  dir)
    m="${2:-$(current)}"; d=$(field "$m" 3)
    [ -n "$m" ] && [ -n "$d" ] || exit 1
    expand "$d" ;;
  --pick)
    m=$(current)
    items=$(awk -F'\t' '!/^#/ && NF>=3 {printf "%s\"%s：%s\"", (n++?",":""), $1, $2}' "$CONF")
    def=$(awk -F'\t' -v m="$m" '!/^#/ && $1==m {printf "\"%s：%s\"", $1, $2}' "$CONF")
    pick=$(osascript -e "choose from list {$items} with title \"LMF撮影モード\" with prompt \"今のモード：${m:-未設定}\n撮る作業を選んでください\" ${def:+default items {$def}}" 2>/dev/null) || exit 0
    [ "$pick" = "false" ] && exit 0
    set_mode "${pick%%：*}" "アプリ" ;;
  -*) die "知らないオプション: $1" ;;
  *)
    by="手入力"; [ "${2:-}" = "--by" ] && by="${3:-手入力}"
    set_mode "$1" "$by" ;;
esac

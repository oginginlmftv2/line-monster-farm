#!/bin/bash
# 撮影ツールを ~/Pictures/lmf-capture/ へ入れる。何度実行してもよい（設定・モード・画像は消さない）。
#
#   tools/mirror-capture/install.sh              スクリプト・mirror-winid・LMFMode.app を入れる
#   tools/mirror-capture/install.sh --shot-app   LMFShot.app も ~/Applications に作る（新しいMacで使い始めるとき）
#
# リポジトリのworktreeは消えるので、実行時の置き場所はリポジトリの外にコピーする。正はこのフォルダ。
set -eu
SRC="$(cd "$(dirname "$0")" && pwd)"
CAP="${LMF_CAPTURE_HOME:-$HOME/Pictures/lmf-capture}"
APPS="$HOME/Applications"
mkdir -p "$CAP/bin" "$APPS"

install -m 755 "$SRC/lmf-mode.sh" "$CAP/bin/lmf-mode"
install -m 755 "$SRC/shot.sh" "$CAP/bin/shot.sh"
swiftc -O -o "$CAP/bin/mirror-winid" "$SRC/mirror-winid.swift"

if [ ! -f "$CAP/modes.conf" ]; then
  HIDEN="~/Pictures/lmf-capture/hiden"
  [ -d "$HOME/claude/lmf-aisho/shots" ] && HIDEN="~/claude/lmf-aisho/shots"
  printf '# モード\t表示名\t保存先（~ はホーム）。行を足せばモードが増える\nbasics\t基礎データ\t~/Pictures/lmf-capture/basics\nskills\t技\t~/Pictures/lmf-capture/skills\nhiden\t秘伝調査\t%s\n' "$HIDEN" > "$CAP/modes.conf"
  echo "modes.conf を作りました: $CAP/modes.conf"
fi
# あとから増えたモードを既存の modes.conf にも足す（利用者が書き換えた行には触らない）
grep -q "^skills	" "$CAP/modes.conf" || printf 'skills\t技\t~/Pictures/lmf-capture/skills\n' >> "$CAP/modes.conf"
# 今まで撮影は秘伝調査にしか使っていないので、未設定なら秘伝調査から始める
[ -s "$CAP/mode" ] || "$CAP/bin/lmf-mode" hiden --by install >/dev/null

build_app() { # 名前 スクリプト 引数
  local app="$APPS/$1.app" tmp
  tmp=$(mktemp -d)
  sed -e "s|__SCRIPT__|$2|" -e "s|__ARG__|$3|" "$SRC/launcher-main.swift" > "$tmp/main.swift"
  mkdir -p "$app/Contents/MacOS"
  swiftc -O -o "$app/Contents/MacOS/$1" "$tmp/main.swift"
  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>$1</string>
<key>CFBundleIdentifier</key><string>local.lmfcapture.$(echo "$1" | tr 'A-Z' 'a-z')</string>
<key>CFBundleName</key><string>$1</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
  codesign -f -s - "$app" >/dev/null 2>&1 || true
  rm -rf "$tmp"
  echo "作成: $app"
}
build_app LMFMode "$CAP/bin/lmf-mode" --pick
[ "${1:-}" = "--shot-app" ] && build_app LMFShot "$CAP/bin/shot.sh" ""

"$CAP/bin/lmf-mode"

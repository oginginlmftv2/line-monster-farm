// LMFShot.app / LMFMode.app の本体。決まったスクリプトを実行して終わるだけ。
// アプリにするのは、画面収録の許可とキーボードショートカットをアプリ単位で持たせるため。
// __SCRIPT__ と __ARG__ は install.sh がビルド時に埋める。
import Foundation
let p = Process()
p.executableURL = URL(fileURLWithPath: "__SCRIPT__")
p.arguments = ["__ARG__"].filter { !$0.isEmpty }
try? p.run()
p.waitUntilExit()
exit(p.terminationStatus)

// iPhoneミラーリングのウィンドウIDを1行で出力する。見つからなければ終了コード1。
import CoreGraphics
import Foundation

let owners = ["iPhone Mirroring", "iPhoneミラーリング"]
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for w in list {
    guard let owner = w[kCGWindowOwnerName as String] as? String, owners.contains(owner),
          (w[kCGWindowLayer as String] as? Int) == 0,
          let id = w[kCGWindowNumber as String] as? Int else { continue }
    print(id)
    exit(0)
}
exit(1)

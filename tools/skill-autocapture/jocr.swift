// 日本語の文字認識（Vision）。出力は「文字<TAB>中心x<TAB>中心y」（画像px）。
// jocr <画像>       … 1枚読む
// jocr              … 標準入力から画像パスを1行ずつ受け、読むたびに END を出す（常駐用。起動の待ちを省く）
// lmf-aisho の bin/ocr は日本語が化けるため、認識の版を3に固定したものを別に用意した。
import Vision
import AppKit

func recognize(_ path: String) {
  guard let img = NSImage(contentsOfFile: path),
        let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("ERR\tcannot open"); return }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.revision = 3
  req.recognitionLanguages = ["ja-JP"]
  req.usesLanguageCorrection = true
  try? VNImageRequestHandler(cgImage: cg).perform([req])
  let W = Double(cg.width), H = Double(cg.height)
  for o in (req.results ?? []) as [VNRecognizedTextObservation] {
    if let t = o.topCandidates(1).first {
      let b = o.boundingBox
      print("\(t.string)\t\(Int(Double(b.midX) * W))\t\(Int((1 - Double(b.midY)) * H))")
    }
  }
}

if CommandLine.arguments.count > 1 {
  recognize(CommandLine.arguments[1])
} else {
  while let line = readLine() {
    recognize(line)
    print("END")
    fflush(stdout)
  }
}

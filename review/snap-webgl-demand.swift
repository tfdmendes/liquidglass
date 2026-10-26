import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 5, let url = URL(string: args[1]),
      let width = Double(args[3]), let height = Double(args[4]) else {
  print("usage: snap-webgl-demand <url> <out.png> <width> <height> [timeoutSeconds=50]")
  exit(2)
}
let output = URL(fileURLWithPath: args[2])
let timeout = args.count > 5 ? Double(args[5]) ?? 50 : 50
let started = Date()
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                      styleMask: [.borderless], backing: .buffered, defer: false)
// WebKit suspends frames when its window is fully hidden
window.alphaValue = 0.02
window.ignoresMouseEvents = true
let web = WKWebView(frame: window.contentView!.bounds, configuration: WKWebViewConfiguration())
window.contentView = web
window.orderFrontRegardless()
web.load(URLRequest(url: url))

func finish(_ record: [String: Any], failed: Bool) {
  var evidence = record
  evidence["macOS"] = ProcessInfo.processInfo.operatingSystemVersionString
  evidence["webKitBundleVersion"] = Bundle(path: "/System/Library/Frameworks/WebKit.framework")?.infoDictionary?["CFBundleVersion"]
  evidence["elapsedSeconds"] = Date().timeIntervalSince(started)
  do {
    try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])
      .write(to: output.deletingPathExtension().appendingPathExtension("json"))
  } catch { print("JSON write failed:", error); exit(1) }
  let configuration = WKSnapshotConfiguration()
  configuration.afterScreenUpdates = true
  web.takeSnapshot(with: configuration) { image, error in
    guard let image, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
      print("snapshot failed:", error as Any)
      exit(1)
    }
    do { try png.write(to: output) } catch { print("PNG write failed:", error); exit(1) }
    let result = record["result"] as? [String: Any]
    print("saved", output.path, "assertions:", result?["assertions"] ?? "none", "failed:", failed)
    exit(failed ? 1 : 0)
  }
}

func poll() {
  let probe = """
  JSON.stringify({ready:!!window.reviewReady,result:window.webglResults??null,error:window.reviewError??null,
  status:document.querySelector('#status')?.textContent,ua:navigator.userAgent,dpr:devicePixelRatio,
  fixtures:window.review?.apis.map(a=>({...a.info(),counts:a.counts(),hasPixels:!!a.last()}))})
  """
  web.evaluateJavaScript(probe) { value, error in
    let record = (value as? String)?.data(using: .utf8)
      .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
    if let result = record["result"] as? [String: Any] {
      finish(record, failed: result["error"] != nil)
    } else if record["error"] is String {
      finish(record, failed: true)
    } else if Date().timeIntervalSince(started) >= timeout {
      var failure = record
      failure["timeout"] = true
      failure["probeError"] = error?.localizedDescription
      finish(failure, failed: true)
    } else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { poll() } }
  }
}
DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { poll() }
app.run()

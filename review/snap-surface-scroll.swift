import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 3, let url = URL(string: args[1]) else {
  print("usage: snap-surface-scroll <url> <out.png> [width=1280] [height=800]")
  exit(2)
}
let width = CGFloat(Double(args.count > 3 ? args[3] : "1280") ?? 1280)
let height = CGFloat(Double(args.count > 4 ? args[4] : "800") ?? 800)
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
  styleMask: [.borderless], backing: .buffered, defer: false)
// WebKit pauses animation frames when the view is off screen
window.alphaValue = 0.02
window.ignoresMouseEvents = true
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: WKWebViewConfiguration())
window.contentView = web
window.orderFrontRegardless()
web.load(URLRequest(url: url))
let deadline = Date().addingTimeInterval(25)

func poll() {
  web.evaluateJavaScript("window.nativeResult ? JSON.stringify(window.nativeResult) : null") { result, error in
    guard let json = result as? String else {
      if Date() < deadline {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: poll)
      } else {
        web.evaluateJavaScript("JSON.stringify({url:location.href,state:document.readyState,fixture:!!window.fixture,ready:window.fixtureReady,stage:window.nativeStage,scrollY,result:window.nativeResult})") { state, _ in
          print("comparison timed out:", state ?? "not loaded", error.map { "\($0)" } ?? "")
          exit(1)
        }
      }
      return
    }
    print("probe:", json)
    let config = WKSnapshotConfiguration()
    config.afterScreenUpdates = true
    web.takeSnapshot(with: config) { image, error in
      guard let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:]) else {
        print("snapshot failed:", error.map { "\($0)" } ?? "unknown")
        exit(1)
      }
      do { try png.write(to: URL(fileURLWithPath: args[2])) }
      catch { print("write failed:", error); exit(1) }
      print("saved", args[2], rep.pixelsWide, "x", rep.pixelsHigh)
      exit(0)
    }
  }
}
DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: poll)
app.run()

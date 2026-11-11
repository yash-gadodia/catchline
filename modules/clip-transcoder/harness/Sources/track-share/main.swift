import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(2)
}

var args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 6, ["video", "image"].contains(args[0]) else { fail("usage: track-share video|image <clip> --spec <spec.json> --out <file>") }
let command = args.removeFirst()
let clip = URL(fileURLWithPath: args.removeFirst())
var opts: [String: String] = [:]
while args.count >= 2 { opts[args.removeFirst()] = args.removeFirst() }
guard let specPath = opts["--spec"], let outPath = opts["--out"] else { fail("--spec and --out are required") }
let out = URL(fileURLWithPath: outPath)
try? FileManager.default.removeItem(at: out)

let done = DispatchSemaphore(value: 0)
Task {
  do {
    let spec = try decodeTrackSpec(String(contentsOfFile: specPath, encoding: .utf8))
    if command == "video" {
      let r = try await renderTrackVideo(source: clip, to: out, spec: spec) { _ in }
      print("video \(r.width)x\(r.height) frames=\(r.frames) durationS=\(r.durationS)")
    } else {
      let r = try await renderTrackImage(source: clip, to: out, spec: spec)
      print("image \(r.width)x\(r.height)")
    }
  } catch {
    fail("failed: \(error.localizedDescription)")
  }
  done.signal()
}
done.wait()

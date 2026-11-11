import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(2)
}

var args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 6, ["video", "image", "crops"].contains(args[0]) else { fail("usage: track-share video|image|crops <clip> --spec <spec.json> --out <file or folder>") }
let command = args.removeFirst()
let clip = URL(fileURLWithPath: args.removeFirst())
var opts: [String: String] = [:]
while args.count >= 2 { opts[args.removeFirst()] = args.removeFirst() }
guard let specPath = opts["--spec"], let outPath = opts["--out"] else { fail("--spec and --out are required") }
let out = URL(fileURLWithPath: outPath)
if command != "crops" { try? FileManager.default.removeItem(at: out) }

let done = DispatchSemaphore(value: 0)
Task {
  do {
    if command == "crops" {
      try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
      let wanted = try JSONDecoder().decode([FrameCrop].self, from: Data(contentsOf: URL(fileURLWithPath: specPath)))
      for r in try await cropFrames(source: clip, crops: wanted, into: out) { print("crop \(r["id"] ?? "") frame=\(r["frame"] ?? "") px=\(r["px"] ?? "")") }
      done.signal()
      return
    }
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

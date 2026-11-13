import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(2)
}

func printJSON(_ value: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { fail("result is not JSON") }
  print(String(decoding: data, as: UTF8.self))
}

let usage = "usage: track-share probe <clip> | transcode <clip> --opts <json> --out <file> | video|image <clip> --spec <spec.json> --out <file>"
var args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2, ["probe", "transcode", "video", "image"].contains(args[0]) else { fail(usage) }
let command = args.removeFirst()
let clip = URL(fileURLWithPath: args.removeFirst())
var opts: [String: String] = [:]
while args.count >= 2 { opts[args.removeFirst()] = args.removeFirst() }

// The app's own module functions (ClipTranscoderModule.swift), called as src/data/prepare.ts calls them.
let functions = ClipTranscoderModule().definition().functions

let done = DispatchSemaphore(value: 0)
Task {
  do {
    switch command {
    case "probe":
      guard let probe = functions["probe"] as? (String) async throws -> [String: Any] else { fail("no probe function") }
      printJSON(try await probe(clip.path))
    case "transcode":
      guard let json = opts["--opts"], let outPath = opts["--out"] else { fail("--opts and --out are required") }
      guard let transcode = functions["transcode"] as? (TranscodeOptions) async throws -> [String: Any] else { fail("no transcode function") }
      guard let o = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] else { fail("--opts is not an object") }
      func num(_ k: String) -> Double {
        guard let v = (o[k] as? NSNumber)?.doubleValue else { fail("--opts.\(k) is missing") }
        return v
      }
      var t = TranscodeOptions()
      t.uri = clip.path
      t.startS = num("startS")
      t.endS = num("endS")
      t.width = Int(num("width"))
      t.height = Int(num("height"))
      t.fps = num("fps")
      t.dropToFps = (o["dropToFps"] as? Bool) ?? false
      t.bitrate = Int(num("bitrate"))
      var r = try await transcode(t)
      guard let made = (r["uri"] as? String).flatMap(URL.init(string:)) else { fail("transcode returned no file") }
      let out = URL(fileURLWithPath: outPath)
      try? FileManager.default.removeItem(at: out)
      try FileManager.default.moveItem(at: made, to: out)
      r["uri"] = out.path
      printJSON(r)
    default:
      guard let specPath = opts["--spec"], let outPath = opts["--out"] else { fail("--spec and --out are required") }
      let out = URL(fileURLWithPath: outPath)
      try? FileManager.default.removeItem(at: out)
      let spec = try decodeTrackSpec(String(contentsOfFile: specPath, encoding: .utf8))
      if command == "video" {
        let r = try await renderTrackVideo(source: clip, to: out, spec: spec) { _ in }
        print("video \(r.width)x\(r.height) frames=\(r.frames) durationS=\(r.durationS)")
      } else {
        let r = try await renderTrackImage(source: clip, to: out, spec: spec)
        print("image \(r.width)x\(r.height)")
      }
    }
  } catch {
    fail("failed: \(error.localizedDescription)")
  }
  done.signal()
}
done.wait()

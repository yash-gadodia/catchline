import Foundation

// catchline-harness pose    <clip> --models <dir> --out <trace.json.gz> [--movement snatch] [--no-camera] [--all-people] [--pose-json <path>]
// catchline-harness analyse <clip> --models <dir> --plan <plan.json> --out <trace.json.gz> [--stills <dir>] [--movement snatch]
//
// pose: the first analyseOnDevice call (pose + lifter + camera path). analyse: the same, then the pixel
// stages on the frames the plan names (the plan is what src/analysis/device planFromMisses writes).
// --no-camera skips track.py camera_path (until CameraMotion.swift lands) so the lifter can be compared alone.
// --all-people poses every detection (the app poses only the lifter's candidates after the first second).

func usage() -> Never {
  FileHandle.standardError.write(Data("usage: catchline-harness pose|analyse <clip> --models <dir> --out <trace.json.gz> [--plan <plan.json>] [--stills <dir>] [--movement <m>] [--no-camera] [--all-people] [--pose-json <path>]\n".utf8))
  exit(2)
}

var args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2 else { usage() }
let command = args.removeFirst()
let clip = URL(fileURLWithPath: args.removeFirst())
var opts: [String: String] = [:]
var flags: Set<String> = []
while !args.isEmpty {
  let a = args.removeFirst()
  if a == "--no-camera" || a == "--all-people" { flags.insert(a); continue }
  guard a.hasPrefix("--"), !args.isEmpty else { usage() }
  opts[a] = args.removeFirst()
}
guard ["pose", "analyse"].contains(command), let modelsDir = opts["--models"], let out = opts["--out"] else { usage() }
let movement = opts["--movement"] ?? "snatch"

func log(_ s: String) { FileHandle.standardError.write(Data((s + "\n").utf8)) }

let t0 = Date()
let models = try PoseModels(directory: URL(fileURLWithPath: modelsDir))
log("models loaded in \(String(format: "%.1f", Date().timeIntervalSince(t0))) s")

var plan: AnalysePlan?
if command == "analyse" {
  guard let path = opts["--plan"] else { usage() }
  let json = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as? [String: Any] ?? [:]
  plan = try AnalysePlan(json: json)
}
let stillsDir = URL(fileURLWithPath: opts["--stills"] ?? FileManager.default.temporaryDirectory.appendingPathComponent("catchline-harness-stills").path)

let analyser = DeviceAnalyser(models: models)
analyser.poseEveryone = flags.contains("--all-people")
let sem = DispatchSemaphore(value: 0)
var failure: Error?
var lastStage = ""
Task {
  do {
    let t1 = Date()
    if let path = opts["--run-in"] { analyser.run = try loadRun(URL(fileURLWithPath: path), clip: clip); log("pose pass loaded from \(path)") }
    let (trace, stills) = try await analyser.analyse(url: clip, movement: movement, plan: plan, stillsDir: stillsDir,
                                                     cameraPath: !flags.contains("--no-camera")) { stage, f in
      if stage != lastStage { lastStage = stage; log("stage \(stage)") }
      if f >= 1 && lastStage != "" { lastStage = ""; log("stage \(stage) done at \(String(format: "%.1f", Date().timeIntervalSince(t1))) s") }
    }
    let tm = analyser.timing
    if tm.frames > 0 {
      let ms = { (s: Double) in String(format: "%.0f", s * 1000 / Double(tm.frames)) }
      let c = coreTiming
      log("  detect: pre \(ms(c.detectPre)) infer \(ms(c.detectInfer)) post \(ms(c.detectPost));  pose (posed people): pre \(ms(c.posePre)) infer \(ms(c.poseInfer)) post \(ms(c.posePost))")
      log("pose pass ms/frame: decode \(ms(tm.decode))  upright \(ms(tm.upright))  detect \(ms(tm.detect))  pose \(ms(tm.pose)) (\(String(format: "%.1f", Double(tm.posed) / Double(tm.frames))) posed of \(String(format: "%.1f", Double(tm.people) / Double(tm.frames))) people/frame)  camera \(ms(tm.camera))")
    }
    try writeTrace(trace, to: URL(fileURLWithPath: out))
    let n = (trace["meta"] as? [String: Any])?["frameCount"] ?? 0
    log("trace \(out): \(n) frames, calls \((trace["calls"] as? [String: Any])?.keys.sorted() ?? []), stills \(stills.count), \(String(format: "%.1f", Date().timeIntervalSince(t1))) s")
    if let path = opts["--pose-json"], let run = analyser.run {
      try Data(poseJSON(run).utf8).write(to: URL(fileURLWithPath: path))
      log("pose json \(path)")
    }
    if let path = opts["--run-out"], let run = analyser.run {
      try saveRun(run, to: URL(fileURLWithPath: path))
      log("pose run \(path)")
    }
  } catch {
    failure = error
  }
  sem.signal()
}
sem.wait()
if let failure {
  log("error: \(failure)")
  exit(1)
}

// The analyzePose upload object (external_pose.py's input), rounded as PoseCoreMLCore does it
func poseJSON(_ run: PoseRun) -> String {
  let head: Set<Int> = [0, 1, 2, 3, 4, 17]
  let fps = (run.meta["fps"] as? Double) ?? 30
  var frames: [[String: Any]] = []
  for (f, row) in run.people.enumerated() {
    var people: [[String: Any]] = []
    for p in row {
      var kp: [Any] = []
      for j in 0 ..< 26 {
        if head.contains(j) { kp.append(NSNull()); continue }
        kp.append([(Double(p.kpts[j * 2]) * 10).rounded() / 10, (Double(p.kpts[j * 2 + 1]) * 10).rounded() / 10, (Double(p.scores[j]) * 1000).rounded() / 1000])
      }
      people.append(["box": p.box.map { (Double($0) * 10).rounded() / 10 }, "kp": kp])
    }
    var frame: [String: Any] = ["t": (Double(f) / fps * 10000).rounded() / 10000, "people": people]
    if let i = run.people[f].indices.first(where: { run.lifter.boxes[f][0] == Double(run.people[f][$0].box[0]) && run.lifter.boxes[f][1] == Double(run.people[f][$0].box[1]) }) {
      frame["lifter"] = i
    }
    frames.append(frame)
  }
  return pyJSON(["source": "rtmpose-coreml", "fps": fps, "width": run.outW, "height": poseInferHeight, "frames": frames])
}

// The pose pass as a sidecar the eval loop caches: everything pixelPass reads (people boxes, the lifter, the camera
// path, meta), NaN as null. The trace calls are rebuilt from it exactly as posePass records them.
func saveRun(_ run: PoseRun, to url: URL) throws {
  let n = run.people.count
  let num = { (d: Double) -> Any in d.isNaN ? NSNull() : d }
  var k: [Any] = [], ks: [Any] = [], boxes: [Any] = []
  k.reserveCapacity(n * 52)
  for f in 0 ..< n {
    for j in 0 ..< 26 { k.append(num(run.lifter.kpts[f][j].x)); k.append(num(run.lifter.kpts[f][j].y)) }
    ks += run.lifter.scores[f].map(num)
    boxes += run.lifter.boxes[f].map(num)
  }
  let obj: [String: Any] = [
    "poseKey": run.poseKey, "hanging": run.hanging, "outW": run.outW, "meta": run.meta,
    "people": run.people.map { $0.map { $0.box.map { Double($0) } } },
    "lifterK": k, "lifterS": ks, "lifterB": boxes,
    "camera": run.cameraPath.map { $0.map(num) },
  ]
  try JSONSerialization.data(withJSONObject: obj).write(to: url, options: .atomic)
}

func loadRun(_ url: URL, clip: URL) throws -> PoseRun {
  guard let o = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any],
        let poseKey = o["poseKey"] as? String, let hanging = o["hanging"] as? Bool, let outW = o["outW"] as? Int,
        let meta = o["meta"] as? [String: Any], let peopleBoxes = o["people"] as? [[[Double]]],
        let lk = o["lifterK"] as? [Any], let ls = o["lifterS"] as? [Any], let lb = o["lifterB"] as? [Any],
        let cam = o["camera"] as? [[Any]] else { throw StageError.invalid("run file \(url.path)") }
  let num = { (a: Any) -> Double in (a as? Double) ?? .nan }
  let n = peopleBoxes.count
  let people = peopleBoxes.map { $0.map { PosePerson(box: $0.map { Float($0) }, kpts: [], scores: []) } }
  var kpts: [[Point]] = [], scores: [[Double]] = [], boxes: [Box] = []
  var k: [Double] = [], ks: [Double] = [], b: [Double] = []
  for f in 0 ..< n {
    kpts.append((0 ..< 26).map { Point(num(lk[f * 52 + $0 * 2]), num(lk[f * 52 + $0 * 2 + 1])) })
    scores.append((0 ..< 26).map { num(ls[f * 26 + $0]) })
    boxes.append((0 ..< 4).map { num(lb[f * 4 + $0]) })
    for j in 0 ..< 26 { k.append(kpts[f][j].x); k.append(kpts[f][j].y) }
    ks += scores[f]
    b += boxes[f]
  }
  let path = cam.map { $0.map(num) }
  var calls: [String: [String: [Any]]] = [
    "select_lifter": ["\(poseKey):\(hanging ? "True" : "False")": [tup([nd([n, 26, 2], k), nd([n, 26], ks), nd([n, 4], b)])]],
  ]
  if !path.isEmpty { calls["camera_path"] = [poseKey: [path.map { nd([2, 3], $0) }]] }
  return PoseRun(url: clip, poseKey: poseKey, hanging: hanging, outW: outW, people: people,
                 lifter: LifterTrack(kpts: kpts, scores: scores, boxes: boxes), cameraPath: path, calls: calls, meta: meta)
}

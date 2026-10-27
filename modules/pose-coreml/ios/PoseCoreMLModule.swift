import CoreML
import ExpoModulesCore

final class PoseFailedException: GenericException<String> {
  override var reason: String { "Could not read body pose: \(param)" }
}

final class AnalyseFailedException: GenericException<String> {
  override var reason: String { "Could not analyse on device: \(param)" }
}

private func fileURL(_ uri: String) -> URL {
  if let url = URL(string: uri), url.scheme != nil { return url }
  return URL(fileURLWithPath: uri)
}

// 3.1 bundles the models in the binary (scripts/fetch-pose-models.sh fills ios/models, the podspec
// ships it as PoseCoreMLModels.bundle). nil in a build made without them.
private let bundledModelsDir: URL? = {
  guard let url = Bundle.main.url(forResource: "PoseCoreMLModels", withExtension: "bundle")
    ?? Bundle(for: PoseCoreMLModule.self).url(forResource: "PoseCoreMLModels", withExtension: "bundle") else { return nil }
  let all = ["YoloxHuman", "RTMPoseHalpe26"].allSatisfy {
    FileManager.default.fileExists(atPath: url.appendingPathComponent("\($0).mlmodelc").path)
  }
  return all ? url : nil
}()

private let bundledStatus: [String: Any] = ["status": "ready", "fraction": 1.0, "bundled": true]

public class PoseCoreMLModule: Module {
  private var models: PoseModels?
  private var analyser: DeviceAnalyser?

  // The bundled models; without them (kept for one release, design 3.1 section 6.2) the
  // PoseModelStore download, whose progress is the 'models' stage.
  private func loadModels(progress: @escaping (String, Double) -> Void) async throws -> PoseModels {
    if let m = models { return m }
    let dir: URL
    if let bundled = bundledModelsDir {
      dir = bundled
    } else {
      dir = try await PoseModelStore.shared.waitUntilReady { f in progress("models", f) }
    }
    let m = try PoseModels(directory: dir)
    models = m
    return m
  }

  public func definition() -> ModuleDefinition {
    Name("PoseCoreML")

    Events("onProgress", "onAnalyseProgress")

    AsyncFunction("ensureModels") { () async -> [String: Any] in
      if bundledModelsDir != nil { return bundledStatus }
      return await PoseModelStore.shared.ensure()
    }

    AsyncFunction("modelsStatus") { () async -> [String: Any] in
      if bundledModelsDir != nil { return bundledStatus }
      return await PoseModelStore.shared.status()
    }

    AsyncFunction("analyzePose") { (uri: String) async throws -> [String: Any] in
      do {
        let models = try await self.loadModels { _, _ in }
        return try await analyzePoseCoreML(url: fileURL(uri), models: models) { p in
          self.sendEvent("onProgress", ["progress": p])
        }
      } catch {
        throw PoseFailedException(String(describing: error))
      }
    }

    // The clip read on the phone as a trace.py trace (gzipped JSON at tracePath) plus the keyframe
    // stills the plan asked for. Without a plan: pose, lifter and camera path only (see AnalyseOnDevice.swift).
    // Rejects with "Could not analyse on device: <code>: <detail>", code one of no_video_track, clip_unreadable,
    // models_unavailable, stage_missing, plan_invalid, interrupted (anything else is a file system error). Lift
    // failures such as no_person or no_reps are the TS pipeline's, read from the trace; native never decides them.
    // banner (title, subtitle, from, to): on iOS 26 the run continues after the lifter leaves under a continued
    // processing task with these words and this call's share of the whole analysis's progress (ContinuedRun.swift).
    AsyncFunction("analyseOnDevice") { (uri: String, movement: String, plan: [String: Any]?, banner: [String: Any]?) async throws -> [String: Any] in
      do {
        if let banner, let title = banner["title"] as? String {
          ContinuedRun.shared.begin(title: title, subtitle: banner["subtitle"] as? String ?? "")
        }
        let from = (banner?["from"] as? NSNumber)?.doubleValue ?? 0, to = (banner?["to"] as? NSNumber)?.doubleValue ?? 1
        let progress = { (stage: String, fraction: Double) in
          self.sendEvent("onAnalyseProgress", ["stage": stage, "fraction": fraction])
          ContinuedRun.shared.report(from + fraction * (to - from))
        }
        let models = try await self.loadModels(progress: progress)
        if self.analyser == nil {
          self.analyser = DeviceAnalyser(models: models)
          self.analyser!.shouldStop = { ContinuedRun.shared.interrupted }
        }
        let url = fileURL(uri)
        let dir = FileManager.default.temporaryDirectory
          .appendingPathComponent("catchline-analysis", isDirectory: true)
          .appendingPathComponent(url.deletingPathExtension().lastPathComponent, isDirectory: true)
        let (trace, stills) = try await self.analyser!.analyse(url: url, movement: movement, plan: plan.map { try AnalysePlan(json: $0) },
                                                              stillsDir: dir, progress: progress)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let tracePath = dir.appendingPathComponent("trace.json.gz")
        try writeTrace(trace, to: tracePath)
        return ["tracePath": tracePath.path, "stills": stills.mapValues { $0.path }]
      } catch {
        throw AnalyseFailedException(String(describing: error))
      }
    }

    // The JS loop is done with this clip (every pass, or it gave up): the continued processing task ends
    AsyncFunction("endBackgroundRun") { (success: Bool) in
      ContinuedRun.shared.end(success: success)
    }
  }
}

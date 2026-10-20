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

public class PoseCoreMLModule: Module {
  private var models: PoseModels?
  private var analyser: DeviceAnalyser?

  // The models are downloaded on first use (PoseModelStore); the stage events say how far along.
  private func loadModels(progress: @escaping (String, Double) -> Void) async throws -> PoseModels {
    if let m = models { return m }
    let dir = try await PoseModelStore.shared.waitUntilReady { f in progress("models", f) }
    let m = try PoseModels(directory: dir)
    models = m
    return m
  }

  public func definition() -> ModuleDefinition {
    Name("PoseCoreML")

    Events("onProgress", "onAnalyseProgress")

    AsyncFunction("ensureModels") { () async -> [String: Any] in
      await PoseModelStore.shared.ensure()
    }

    AsyncFunction("modelsStatus") { () async -> [String: Any] in
      await PoseModelStore.shared.status()
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
    // models_unavailable, stage_missing, plan_invalid (anything else is a file system error). Lift failures such
    // as no_person or no_reps are the TS pipeline's, read from the trace; native never decides them.
    AsyncFunction("analyseOnDevice") { (uri: String, movement: String, plan: [String: Any]?) async throws -> [String: Any] in
      do {
        let progress = { (stage: String, fraction: Double) in
          self.sendEvent("onAnalyseProgress", ["stage": stage, "fraction": fraction])
        }
        let models = try await self.loadModels(progress: progress)
        if self.analyser == nil { self.analyser = DeviceAnalyser(models: models) }
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
  }
}

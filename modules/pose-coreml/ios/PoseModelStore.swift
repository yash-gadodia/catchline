import AppleArchive
import CryptoKit
import Foundation
import System

// 3.1 bundles the models (PoseCoreMLModule.bundledModelsDir); this download is the fallback for a build
// made without them, kept for one release (design 3.1 section 6.2), then deleted. Keep the tag and
// SHA-256s below equal to modules/pose-coreml/models.lock.
// The compiled models were too big to bundle (~150 MB FP32), so they were fetched once from the
// GitHub release below, checked against these SHA-256s, unpacked into Application Support
// (excluded from backup) and loaded from there. Built by cv/scripts/export_coreml.py, packed with
// `aa archive -d models -subdir <name>.mlmodelc -o <name>.mlmodelc.aar` (see scripts/publish-pose-models.sh).
// New weights = new tag, new SHAs here.
let poseModelReleaseTag = "models-pose-v1"
private let releaseURL = "https://github.com/yash-gadodia/catchline/releases/download/\(poseModelReleaseTag)/"
private let poseModelArchives: [(name: String, sha256: String, bytes: Int64)] = [
  ("YoloxHuman", "382107dac9f4a54fd729b4932c4abe7b4954a72c2e0f3087863bfd36f838da93", 99_422_167),
  ("RTMPoseHalpe26", "0d314d60ca23c936f7df5345a873a99fe01bab5b19e9c02c462fc6ad352cb1ba", 55_470_256),
]

actor PoseModelStore {
  static let shared = PoseModelStore()

  private let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("PoseModels", isDirectory: true)
  private var directory: URL { root.appendingPathComponent(poseModelReleaseTag, isDirectory: true) }
  private var task: Task<Void, Never>?
  private var lastError: String?
  private var received: Int64 = 0
  private let total = poseModelArchives.reduce(0) { $0 + $1.bytes }

  var readyDirectory: URL? {
    FileManager.default.fileExists(atPath: directory.path) ? directory : nil
  }

  // Download progress, 0...1, for the stage events
  var fraction: Double { readyDirectory != nil ? 1 : Double(received) / Double(total) }

  func status() -> [String: Any] {
    let state = readyDirectory != nil ? "ready" : task != nil ? "downloading" : lastError != nil ? "failed" : "absent"
    return ["status": state, "error": lastError as Any, "fraction": fraction]
  }

  // Starts the download unless the models are there or already on their way; a failed one is retried.
  func ensure() -> [String: Any] {
    if readyDirectory == nil && task == nil {
      lastError = nil
      received = 0
      task = Task { await self.run() }
    }
    return status()
  }

  // The model directory once the download is done, starting it if needed; throws the download error.
  func waitUntilReady(progress: @Sendable (Double) -> Void) async throws -> URL {
    _ = ensure()
    while let t = task {
      progress(fraction)
      try? await Task.sleep(nanoseconds: 300_000_000)
      if t.isCancelled { break }
    }
    if let dir = readyDirectory { return dir }
    throw PoseCoreMLError.model(lastError ?? "models missing")
  }

  private func run() async {
    do {
      try await install()
    } catch {
      lastError = String(describing: error)
      NSLog("[PoseCoreML] model download failed: %@", lastError!)
    }
    task = nil
  }

  private func add(bytes: Int64) { received += bytes }

  // Everything lands in a staging folder first and is renamed into place only when every
  // archive checked out, so an interrupted run leaves nothing that looks ready.
  private func install() async throws {
    let fm = FileManager.default
    try fm.createDirectory(at: root, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var rootURL = root
    try rootURL.setResourceValues(values)

    let staging = root.appendingPathComponent("staging", isDirectory: true)
    try? fm.removeItem(at: staging)
    try fm.createDirectory(at: staging, withIntermediateDirectories: true)

    let cfg = URLSessionConfiguration.default
    cfg.allowsConstrainedNetworkAccess = false
    let downloader = Downloader { [weak self] n in Task { await self?.add(bytes: n) } }
    let session = URLSession(configuration: cfg, delegate: downloader, delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }

    for m in poseModelArchives {
      let tmp = try await downloader.download(URL(string: "\(releaseURL)\(m.name).mlmodelc.aar")!, session: session)
      defer { try? fm.removeItem(at: tmp) }
      let sum = try sha256(tmp)
      guard sum == m.sha256 else { throw PoseCoreMLError.model("\(m.name): checksum \(sum)") }
      NSLog("[PoseCoreML] %@ sha256 ok", m.name)
      try extract(tmp, to: staging)
    }
    try fm.moveItem(at: staging, to: directory)
    // older weights are never read again
    for old in (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
    where old.lastPathComponent != poseModelReleaseTag {
      try? fm.removeItem(at: old)
    }
    NSLog("[PoseCoreML] models ready at %@", directory.path)
  }
}

// One download at a time, moved out of URLSession's temporary file inside the delegate callback
// (the file is gone once it returns), bytes reported as they arrive.
private final class Downloader: NSObject, URLSessionDownloadDelegate {
  private let onBytes: (Int64) -> Void
  private var continuation: CheckedContinuation<URL, Error>?
  private var dest: URL?

  init(onBytes: @escaping (Int64) -> Void) { self.onBytes = onBytes }

  func download(_ url: URL, session: URLSession) async throws -> URL {
    dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    return try await withCheckedThrowingContinuation { c in
      continuation = c
      session.downloadTask(with: url).resume()
    }
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    onBytes(bytesWritten)
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    let code = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
    guard code == 200 else {
      continuation?.resume(throwing: PoseCoreMLError.model("\(downloadTask.originalRequest?.url?.lastPathComponent ?? "model"): HTTP \(code)"))
      continuation = nil
      return
    }
    do {
      try FileManager.default.moveItem(at: location, to: dest!)
      continuation?.resume(returning: dest!)
    } catch {
      continuation?.resume(throwing: error)
    }
    continuation = nil
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error, let c = continuation {
      c.resume(throwing: error)
      continuation = nil
    }
  }
}

private func sha256(_ url: URL) throws -> String {
  let handle = try FileHandle(forReadingFrom: url)
  defer { try? handle.close() }
  var hasher = SHA256()
  while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
  return hasher.finalize().map { String(format: "%02x", $0) }.joined()
}

private func extract(_ archive: URL, to dest: URL) throws {
  guard
    let file = ArchiveByteStream.fileStream(path: FilePath(archive.path), mode: .readOnly, options: [], permissions: FilePermissions(rawValue: 0o644)),
    let decompress = ArchiveByteStream.decompressionStream(readingFrom: file),
    let decode = ArchiveStream.decodeStream(readingFrom: decompress),
    let out = ArchiveStream.extractStream(extractingTo: FilePath(dest.path), flags: [.ignoreOperationNotPermitted])
  else { throw PoseCoreMLError.model("cannot open \(archive.lastPathComponent)") }
  defer {
    try? out.close()
    try? decode.close()
    try? decompress.close()
    try? file.close()
  }
  _ = try ArchiveStream.process(readingFrom: decode, writingTo: out)
}

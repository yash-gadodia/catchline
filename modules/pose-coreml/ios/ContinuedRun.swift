#if os(iOS)
import BackgroundTasks
import Foundation

// iOS 26's continued processing task around one analysis: submitted when analyseOnDevice starts (the app is in the
// foreground, the lifter just tapped), so the run goes on after they leave, with its progress in the system's Live
// Activity, until the JS loop ends it. The lifter can cancel it there and the system can end it under pressure: both
// expire the task, the running pass throws interrupted and the JS side reruns it when the app returns. Older iOS has
// no task and keeps that rerun alone. No GPU is asked for (that needs the Background GPU Access capability on the
// App ID): a Core ML segment that needs the GPU fails in the background, and the rerun covers that too.
final class ContinuedRun {
  static let shared = ContinuedRun()
  static let identifier = (Bundle.main.bundleIdentifier ?? "com.yashgadodia.parallax") + ".analyse"

  private let lock = NSLock()
  private var registered = false
  private var submitted = false
  private var task: BGTask?
  private var expired = false

  var interrupted: Bool {
    lock.lock(); defer { lock.unlock() }
    return expired
  }

  func begin(title: String, subtitle: String) {
    guard #available(iOS 26.0, *) else { return }
    lock.lock(); defer { lock.unlock() }
    if submitted { return }
    submitted = true
    expired = false
    if !registered {
      registered = BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.identifier, using: nil) { [weak self] task in
        self?.started(task)
      }
    }
    let request = BGContinuedProcessingTaskRequest(identifier: Self.identifier, title: title, subtitle: subtitle)
    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      submitted = false
      NSLog("PoseCoreML: continued processing task not submitted: %@", String(describing: error))
    }
  }

  private func started(_ task: BGTask) {
    lock.lock(); defer { lock.unlock() }
    // Queued by the system and started after the run ended: nothing left to do
    guard submitted else { task.setTaskCompleted(success: true); return }
    self.task = task
    if #available(iOS 26.0, *), let t = task as? BGContinuedProcessingTask { t.progress.totalUnitCount = 100 }
    task.expirationHandler = { [weak self] in self?.expire() }
  }

  private func expire() {
    lock.lock(); defer { lock.unlock() }
    expired = true
    task?.setTaskCompleted(success: false)
    task = nil
    submitted = false
  }

  // fraction of the whole analysis (the JS loop's passes already weighted)
  func report(_ fraction: Double) {
    lock.lock(); defer { lock.unlock() }
    guard #available(iOS 26.0, *), let t = task as? BGContinuedProcessingTask else { return }
    t.progress.completedUnitCount = max(t.progress.completedUnitCount, Int64((fraction * 100).rounded(.down)))
  }

  func end(success: Bool) {
    lock.lock(); defer { lock.unlock() }
    task?.setTaskCompleted(success: success)
    task = nil
    submitted = false
  }
}
#endif

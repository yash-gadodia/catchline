import AVFoundation
import ExpoModulesCore
import UIKit

func backCamera() -> AVCaptureDevice? {
  AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
}

private func maxRate(_ f: AVCaptureDevice.Format) -> Double {
  f.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0
}

// The camera's 8-bit 1080p format that reaches 60 fps (the plain 60 fps one before a binned 120/240), if it has one.
func format60(_ device: AVCaptureDevice) -> AVCaptureDevice.Format? {
  device.formats
    .filter { f in
      let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
      let sub = CMFormatDescriptionGetMediaSubType(f.formatDescription)
      return d.width == 1920 && d.height == 1080
        && (sub == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange || sub == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange)
        && maxRate(f) >= 60
    }
    .min { maxRate($0) < maxRate($1) }
}

public class LiftCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiftCamera")

    // What record() films at on this phone: 60 where the back camera has a 1080p60 format, else 30.
    Constant("recordFps") { () -> Int in
      backCamera().flatMap(format60) != nil ? 60 : 30
    }

    View(LiftCameraView.self) {
      Prop("active") { (view: LiftCameraView, active: Bool) in
        view.setActive(active)
      }

      // The file uri of the recording, or null if nothing was recorded. Ends on stop() or at maxDurationS.
      AsyncFunction("record") { (view: LiftCameraView, maxDurationS: Double, promise: Promise) in
        view.record(maxDurationS, promise)
      }

      AsyncFunction("stop") { (view: LiftCameraView) in
        view.stop()
      }
    }
  }
}

// Back camera preview and a silent movie recording at 1080p: 60 fps when format60 finds a format, else the 1080p
// preset (30 fps). The video is turned to how the phone is held, since the app itself stays portrait.
final class LiftCameraView: ExpoView, AVCaptureFileOutputRecordingDelegate {
  private let session = AVCaptureSession()
  private let output = AVCaptureMovieFileOutput()
  private let queue = DispatchQueue(label: "catchline.lift-camera")
  private let preview: AVCaptureVideoPreviewLayer
  private var rotation: NSObject?
  private var configured = false
  private var active = false
  private var pending: Promise?

  required init(appContext: AppContext? = nil) {
    preview = AVCaptureVideoPreviewLayer(session: session)
    super.init(appContext: appContext)
    backgroundColor = .black
    preview.videoGravity = .resizeAspectFill
    layer.addSublayer(preview)
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
  }

  deinit {
    UIDevice.current.endGeneratingDeviceOrientationNotifications()
    let session = self.session
    queue.async { if session.isRunning { session.stopRunning() } }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    preview.frame = bounds
  }

  func setActive(_ on: Bool) {
    active = on
    queue.async {
      if on {
        self.configure()
        if self.configured && !self.session.isRunning { self.session.startRunning() }
      } else if self.session.isRunning {
        self.session.stopRunning()
      }
    }
  }

  private func configure() {
    if configured { return }
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized, let device = backCamera(),
      let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input), session.canAddOutput(output)
    else { return }
    session.beginConfiguration()
    session.addInput(input)
    session.addOutput(output)
    var fast = false
    if let format = format60(device), (try? device.lockForConfiguration()) != nil {
      device.activeFormat = format
      device.activeVideoMinFrameDuration = CMTime(value: 1, timescale: 60)
      device.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: 60)
      device.unlockForConfiguration()
      fast = true
    }
    if !fast && session.canSetSessionPreset(.hd1920x1080) { session.sessionPreset = .hd1920x1080 }
    session.commitConfiguration()
    configured = true
    DispatchQueue.main.async {
      if #available(iOS 17.0, *) {
        let coordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: self.preview)
        self.rotation = coordinator
        self.preview.connection?.videoRotationAngle = coordinator.videoRotationAngleForHorizonLevelPreview
      } else {
        self.preview.connection?.videoOrientation = .portrait
      }
    }
  }

  private func turnToHowThePhoneIsHeld() {
    guard let connection = output.connection(with: .video) else { return }
    if #available(iOS 17.0, *) {
      if let angle = (rotation as? AVCaptureDevice.RotationCoordinator)?.videoRotationAngleForHorizonLevelCapture,
        connection.isVideoRotationAngleSupported(angle) {
        connection.videoRotationAngle = angle
      }
    } else {
      switch UIDevice.current.orientation {
      case .landscapeLeft: connection.videoOrientation = .landscapeRight
      case .landscapeRight: connection.videoOrientation = .landscapeLeft
      case .portraitUpsideDown: connection.videoOrientation = .portraitUpsideDown
      default: connection.videoOrientation = .portrait
      }
    }
  }

  func record(_ maxDurationS: Double, _ promise: Promise) {
    queue.async {
      guard self.configured, self.session.isRunning, !self.output.isRecording else {
        promise.resolve(nil)
        return
      }
      self.turnToHowThePhoneIsHeld()
      self.output.maxRecordedDuration = CMTime(seconds: maxDurationS, preferredTimescale: 600)
      let dir = FileManager.default.temporaryDirectory.appendingPathComponent("lift-camera", isDirectory: true)
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      self.pending = promise
      self.output.startRecording(to: dir.appendingPathComponent("\(UUID().uuidString).mov"), recordingDelegate: self)
    }
  }

  func stop() {
    queue.async {
      if self.output.isRecording { self.output.stopRecording() }
    }
  }

  func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
    // Reaching maxRecordedDuration arrives as an error that says the file is complete.
    let complete = error == nil || ((error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool ?? false)
    queue.async {
      self.pending?.resolve(complete ? url.absoluteString : nil)
      self.pending = nil
    }
  }
}

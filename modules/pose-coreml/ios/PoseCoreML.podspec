Pod::Spec.new do |s|
  s.name           = 'PoseCoreML'
  s.version        = '1.0.0'
  s.summary        = 'On-device RTMPose + YOLOX (Core ML) for a lift clip'
  s.author         = 'Catchline'
  s.homepage       = 'https://github.com/yashgadodia/parallax'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "*.swift", "Stages/*.swift"
  # Compiled Core ML models from cv/scripts/export_coreml.py (gitignored, ~60 MB)
  s.resource_bundles = { 'PoseCoreMLModels' => ['models/*.mlmodelc'] }
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

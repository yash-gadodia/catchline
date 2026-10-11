Pod::Spec.new do |s|
  s.name           = 'ClipTranscoder'
  s.version        = '1.0.0'
  s.summary        = 'Trims and re-encodes a lift clip to H.264 before upload'
  s.author         = 'Catchline'
  s.homepage       = 'https://github.com/yashgadodia/parallax'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

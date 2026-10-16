-- Server switch for on-device pose (feature_flags is client-readable, service-role writable).
-- Off by default: the app also needs EXPO_PUBLIC_ON_DEVICE_POSE=1 at build time.
insert into public.feature_flags (key, enabled, note)
values ('on_device_pose', false, 'Phone runs RTMPose/YOLOX via Core ML before upload. Off = every lift uses server pose.')
on conflict (key) do nothing;

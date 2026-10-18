// What changed in the native surface since the store build. An OTA update reaches every binary
// with the same runtimeVersion ("appVersion" policy: expo.version), so JS that expects native code
// the binary lacks crashes on launch, and App Store review never sees it.
export type Lock = { packages?: Record<string, { version?: string }> };

export const NATIVE_DIRS = ['modules/', 'targets/', 'plugins/', 'patches/', 'ios/', 'android/'];

export function nativeChanges(input: {
  changedPaths: string[];
  oldLock: Lock;
  newLock: Lock;
  isNative: (lockPath: string) => boolean;
  oldApp: unknown;
  newApp: unknown;
}): string[] {
  const out: string[] = [];
  for (const p of input.changedPaths) {
    if (NATIVE_DIRS.some((d) => p.startsWith(d)) || /^app\.config\.[jt]s$/.test(p)) out.push(`${p} changed`);
  }
  if (JSON.stringify(input.oldApp) !== JSON.stringify(input.newApp)) out.push('app.json changed');
  const oldPkgs = input.oldLock.packages ?? {};
  const newPkgs = input.newLock.packages ?? {};
  for (const [path, entry] of Object.entries(newPkgs)) {
    if (!path.startsWith('node_modules/') || !input.isNative(path)) continue;
    const before = oldPkgs[path]?.version;
    if (before === entry.version) continue;
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    out.push(before ? `${name} ${before} -> ${entry.version}` : `${name} ${entry.version} added`);
  }
  return out;
}

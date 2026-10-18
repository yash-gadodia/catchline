// No native change may ride an OTA to the store build (Volty's check-deploy-mutex, for a phone).
//   npx tsx scripts/check-native-surface.ts   diff the tree against scripts/store-build.json's commit
// Passes when expo.version differs from the store build's: that change ships in a new binary.
// After a new store build, record its build number, version and commit in scripts/store-build.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nativeChanges, type Lock } from './native-surface';

const ROOT = resolve(__dirname, '..');
if (process.argv.length > 2) process.exit(0);

const store = JSON.parse(readFileSync(join(ROOT, 'scripts/store-build.json'), 'utf8')) as {
  build: number;
  version: string;
  sha: string;
};
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const at = (path: string) => JSON.parse(git('show', `${store.sha}:${path}`));

try {
  git('cat-file', '-e', `${store.sha}^{commit}`);
} catch {
  console.error(`check-native-surface: store build commit ${store.sha} is not in this clone (shallow? fetch-depth: 0).`);
  process.exit(1);
}

const newApp = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
if (newApp.expo?.version !== store.version) {
  console.log(`check-native-surface: expo.version ${newApp.expo?.version} is a new runtime (store build is ${store.version}).`);
  process.exit(0);
}

function isNative(lockPath: string): boolean {
  const dir = join(ROOT, lockPath);
  if (!existsSync(dir)) return false;
  if (['ios', 'apple', 'expo-module.config.json'].some((f) => existsSync(join(dir, f)))) return true;
  return readdirSync(dir).some((f) => f.endsWith('.podspec'));
}

const changes = nativeChanges({
  changedPaths: git('diff', '--name-only', store.sha).split('\n').filter(Boolean),
  oldLock: at('package-lock.json') as Lock,
  newLock: JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as Lock,
  isNative,
  oldApp: at('app.json'),
  newApp,
});

if (changes.length > 0) {
  console.error(`check-native-surface: native changes since store build ${store.build} (${store.sha.slice(0, 7)}):`);
  for (const c of changes) console.error(`  ${c}`);
  console.error(
    `An OTA to runtime ${store.version} would ship JS that build ${store.build} cannot run. Revert these, or bump ` +
      'expo.version in app.json so they ship in a new store build, then record that build in scripts/store-build.json.',
  );
  process.exit(1);
}

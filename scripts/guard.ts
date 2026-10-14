// Shared line scanner for the scripts/check-*.ts guards.
//   npx tsx scripts/check-<name>.ts            scan src/ and app/
//   npx tsx scripts/check-<name>.ts <file>...  check only those files (edit hook)
// Exit 0 = clean, 1 = violations (printed as path:line: message).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

type Guard = {
  name: string;
  applies: (rel: string) => boolean;
  pattern: RegExp;
  message: string;
  allowFiles?: Record<string, string>;
};

function sourceFiles(): string[] {
  return ['src', 'app'].flatMap((dir) =>
    (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => join(dir, f)),
  );
}

export function runGuard(guard: Guard): void {
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args.map((f) => relative(ROOT, resolve(f))) : sourceFiles();
  const hits: string[] = [];
  for (const rel of files) {
    if (!/\.tsx?$/.test(rel) || !guard.applies(rel) || guard.allowFiles?.[rel]) continue;
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (guard.pattern.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
  }
  if (hits.length === 0) return;
  console.error(`${guard.name}: ${guard.message}`);
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

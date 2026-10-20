import { Directory, File, Paths } from 'expo-file-system';
import { parseAnalysis } from '../analysis/parse';
import type { Analysis } from '../analysis/types';

// 3.1: the analysis, the trace and the stills of every lift live on the phone, in
// Documents/lifts/<lift id>/ (backed up with the device; nothing goes to the server).
//   analysis.json   the Analysis, keyframe images as file URIs into stills/
//   trace.json.gz   the gzipped trace (re-analysis after an app update, later)
//   stills/<name>   the keyframes the analysis names
export const LIFTS_DIR = 'lifts';
const ANALYSIS_FILE = 'analysis.json';
const TRACE_FILE = 'trace.json.gz';
const STILLS_DIR = 'stills';

export function liftDir(liftId: string): Directory {
  return new Directory(Paths.document, LIFTS_DIR, liftId);
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

// The analysis with each keyframe pointing at its still inside the lift folder.
export function withLocalStills(analysis: Analysis, stills: Directory): Analysis {
  return {
    ...analysis,
    reps: analysis.reps.map((r) => ({
      ...r,
      keyFrames: r.keyFrames.map((k) => (k.image ? { ...k, image: new File(stills, baseName(k.image)).uri } : k)),
    })),
  };
}

// Moves the trace and the stills (name -> file written by the native side or a
// download) into the lift folder and writes the analysis. Returns what was written.
export function saveLocalLift(liftId: string, analysis: Analysis, tracePath: string | null, stills: Record<string, string>): Analysis {
  const dir = liftDir(liftId);
  dir.create({ intermediates: true, idempotent: true });
  const stillsDir = new Directory(dir, STILLS_DIR);
  stillsDir.create({ idempotent: true });
  for (const [name, uri] of Object.entries(stills)) {
    const dest = new File(stillsDir, baseName(name));
    if (dest.exists) dest.delete();
    new File(uri).move(dest);
  }
  if (tracePath) {
    const dest = new File(dir, TRACE_FILE);
    if (dest.exists) dest.delete();
    new File(tracePath).move(dest);
  }
  const local = withLocalStills(analysis, stillsDir);
  const file = new File(dir, ANALYSIS_FILE);
  file.create({ overwrite: true });
  file.write(JSON.stringify(local));
  return local;
}

export async function readLocalAnalysis(liftId: string): Promise<Analysis | null> {
  const file = new File(liftDir(liftId), ANALYSIS_FILE);
  if (!file.exists) return null;
  return parseAnalysis(JSON.parse(await file.text()));
}

export function hasLocalLift(liftId: string): boolean {
  return new File(liftDir(liftId), ANALYSIS_FILE).exists;
}

export function localTraceUri(liftId: string): string | null {
  const file = new File(liftDir(liftId), TRACE_FILE);
  return file.exists ? file.uri : null;
}

export async function listLocalAnalyses(): Promise<{ liftId: string; analysis: Analysis }[]> {
  const root = new Directory(Paths.document, LIFTS_DIR);
  if (!root.exists) return [];
  const out: { liftId: string; analysis: Analysis }[] = [];
  for (const entry of root.list()) {
    if (!(entry instanceof Directory)) continue;
    const analysis = await readLocalAnalysis(entry.name);
    if (analysis) out.push({ liftId: entry.name, analysis });
  }
  return out;
}

export function deleteLocalLift(liftId: string): void {
  const dir = liftDir(liftId);
  if (dir.exists) dir.delete();
}

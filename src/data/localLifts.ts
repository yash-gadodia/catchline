import { Directory, File, Paths } from 'expo-file-system';
import { parseAnalysis } from '../analysis/parse';
import type { Analysis } from '../analysis/types';
import type { Body } from '../analysis/device/tracking';

// 3.1: the analysis, the trace and the stills of every lift live on the phone, in
// Documents/lifts/<lift id>/ (backed up with the device; nothing goes to the server).
//   analysis.json   the Analysis, keyframe images as file URIs into stills/
//   trace.json.gz   the gzipped trace (re-analysis after an app update, later)
//   body.json       the joints on every frame (4.0), read by the player only
//   clip.mp4        the trimmed clip (4.0: every lift; before, a failed lift's only)
//   stills/<name>   the keyframes the analysis names
export const LIFTS_DIR = 'lifts';
const ANALYSIS_FILE = 'analysis.json';
const TRACE_FILE = 'trace.json.gz';
const STILLS_DIR = 'stills';
const BODY_FILE = 'body.json';

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
export function saveLocalLift(liftId: string, analysis: Analysis, tracePath: string | null, stills: Record<string, string>, body: Body | null = null): Analysis {
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
  if (body) {
    const dest = new File(dir, BODY_FILE);
    dest.create({ overwrite: true });
    dest.write(JSON.stringify(body));
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

export async function readLocalBody(liftId: string): Promise<Body | null> {
  const file = new File(liftDir(liftId), BODY_FILE);
  if (!file.exists) return null;
  const body = JSON.parse(await file.text()) as Body;
  return body.version === 1 && Array.isArray(body.frames) ? body : null;
}

// The trimmed clip the lift was tracked on, frame for frame. It goes with the lift folder.
const CLIP_FILE = 'clip.mp4';

export function keepClip(liftId: string, uri: string): void {
  const dir = liftDir(liftId);
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, CLIP_FILE);
  if (dest.exists) dest.delete();
  new File(uri).move(dest);
}

export function localClipUri(liftId: string): string | null {
  const file = new File(liftDir(liftId), CLIP_FILE);
  return file.exists ? file.uri : null;
}

export function deleteLocalLift(liftId: string): void {
  const dir = liftDir(liftId);
  if (dir.exists) dir.delete();
}

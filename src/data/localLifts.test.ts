import { snatchMock } from '../analysis/fixtures';
import { hasLocalLift, listLocalAnalyses, readLocalAnalysis, saveLocalLift, withLocalStills } from './localLifts';

// An in-memory file system with the slice of the expo-file-system API the store uses.
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const join = (parts: (string | { uri: string })[]) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      const parts = this.uri.split('/');
      for (let i = 4; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
    delete() {
      dirs.delete(this.uri);
      for (const k of [...files.keys()]) if (k.startsWith(this.uri + '/')) files.delete(k);
    }
    list() {
      const out: (Directory | File)[] = [];
      for (const d of dirs) if (d.startsWith(this.uri + '/') && !d.slice(this.uri.length + 1).includes('/')) out.push(new Directory(d));
      for (const f of files.keys()) if (f.startsWith(this.uri + '/') && !f.slice(this.uri.length + 1).includes('/')) out.push(new File(f));
      return out;
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      files.set(this.uri, '');
    }
    write(s: string) {
      files.set(this.uri, s);
    }
    async text() {
      return files.get(this.uri) ?? '';
    }
    delete() {
      files.delete(this.uri);
    }
    move(dest: File) {
      files.set(dest.uri, files.get(this.uri) ?? '');
      files.delete(this.uri);
    }
  }
  return {
    __esModule: true,
    Directory,
    File,
    Paths: { document: new Directory('file:///Documents') },
    __files: files,
  };
});

const fs = jest.requireMock('expo-file-system') as { __files: Map<string, string>; File: new (...p: string[]) => { write: (s: string) => void; create: () => void } };

beforeEach(() => {
  fs.__files.clear();
  const still = new fs.File('file:///tmp/r1-1-setup.jpg');
  still.create();
  still.write('jpeg');
  const trace = new fs.File('file:///tmp/trace.json.gz');
  trace.create();
  trace.write('gz');
});

const analysis = {
  ...snatchMock,
  id: 'lift-1',
  reps: [{ ...snatchMock.reps[0], keyFrames: [{ ...snatchMock.reps[0].keyFrames[0], image: 'u1/lift-1/r1-1-setup.jpg' }] }],
};

describe('saveLocalLift', () => {
  it('moves the trace and stills into Documents/lifts/<id> and writes the analysis pointing at them', async () => {
    const saved = saveLocalLift('lift-1', analysis, 'file:///tmp/trace.json.gz', { 'r1-1-setup.jpg': 'file:///tmp/r1-1-setup.jpg' });
    expect(saved.reps[0].keyFrames[0].image).toBe('file:///Documents/lifts/lift-1/stills/r1-1-setup.jpg');
    expect(fs.__files.get('file:///Documents/lifts/lift-1/stills/r1-1-setup.jpg')).toBe('jpeg');
    expect(fs.__files.get('file:///Documents/lifts/lift-1/trace.json.gz')).toBe('gz');
    expect(fs.__files.has('file:///tmp/r1-1-setup.jpg')).toBe(false);
    expect(hasLocalLift('lift-1')).toBe(true);
    expect(await readLocalAnalysis('lift-1')).toEqual(saved);
  });

  it('writes an analysis without a trace or stills, leaving keyframes that name a still pointing into the folder', async () => {
    const saved = saveLocalLift('lift-2', analysis, null, {});
    expect(saved.reps[0].keyFrames[0].image).toBe('file:///Documents/lifts/lift-2/stills/r1-1-setup.jpg');
    expect(fs.__files.has('file:///Documents/lifts/lift-2/trace.json.gz')).toBe(false);
    expect(await readLocalAnalysis('lift-2')).toEqual(saved);
  });
});

describe('reading back', () => {
  it('returns null for a lift not on this phone', async () => {
    expect(await readLocalAnalysis('nope')).toBeNull();
    expect(hasLocalLift('nope')).toBe(false);
  });

  it('lists every lift folder with an analysis, keyed by lift id', async () => {
    saveLocalLift('lift-1', analysis, null, {});
    saveLocalLift('lift-2', { ...analysis, id: 'lift-2' }, null, {});
    const all = await listLocalAnalyses();
    expect(all.map((r) => r.liftId).sort()).toEqual(['lift-1', 'lift-2']);
    expect(all.find((r) => r.liftId === 'lift-2')?.analysis.id).toBe('lift-2');
  });

  it('lists nothing before the first lift', async () => {
    expect(await listLocalAnalyses()).toEqual([]);
  });
});

describe('withLocalStills', () => {
  it('keeps keyframes without an image as they are', () => {
    const a = { ...analysis, reps: [{ ...analysis.reps[0], keyFrames: [{ phase: 'setup', frame: 1 }] }] } as typeof analysis;
    const stills = new (jest.requireMock('expo-file-system').Directory)('file:///x');
    expect(withLocalStills(a, stills).reps[0].keyFrames[0]).toEqual({ phase: 'setup', frame: 1 });
  });
});

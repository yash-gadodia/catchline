import { readFileSync } from 'fs';
import { gunzipSync } from 'fflate';
import { join } from 'path';
import { clipFps, trackTrace } from './analyseTrace';
import { Trace, parseTraceJson } from './trace';

const TRACES = join(__dirname, '..', '..', '..', 'cv', 'tests', 'fixtures', 'traces');
const trace = () => parseTraceJson(Buffer.from(gunzipSync(readFileSync(join(TRACES, '2026-10-05_21B27BAF.mov.trace.json.gz')))).toString()) as Trace;
const code = (t: Trace, fps?: number) => (trackTrace(t, fps ? { fps } : {}).analysis as { failure?: { code?: string } }).failure?.code;

describe("the clip's frame rate", () => {
  it('keeps the trace rate when it is a rate a phone films at', () => {
    expect(clipFps(59.94, 60.2)).toBe(59.94);
    expect(clipFps(30, 30.000002)).toBe(30);
    expect(clipFps(240, 240)).toBe(240);
    expect(clipFps(600)).toBe(600);
  });

  it('takes the transcoder rate when the trace says 600 (one one-tick frame in a 60 fps clip)', () => {
    expect(clipFps(600, 60.2)).toBe(60.2);
    expect(clipFps(120, 30)).toBe(30);
  });

  it('a clear lift read at 600 fps is no longer "no person"', () => {
    const real = trace();
    const fps = real.meta.fps;
    expect(code(real)).not.toBe('no_person');
    const glitched = { ...real, meta: { ...real.meta, fps: 600 } };
    expect(code(glitched)).toBe('no_person');
    expect(code(glitched, fps)).not.toBe('no_person');
  });
});

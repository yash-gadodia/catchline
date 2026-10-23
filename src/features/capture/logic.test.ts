import { router } from 'expo-router';
import { checkHint, failing, firstHint, fixedChecker, parseChecks } from './checks';
import { demoClip } from './demo';
import { clock, isTooLong, reduce, type Session } from './session';
import { repOptions, setStrip, DEMO_SETS } from './sets';
import { bytesPerSecond, secondsLeft } from './storage';
import { activeTrim, withTrim } from './store';
import { parseWeight, submitClip, toSubmission } from './submit';
import { loopTime, moveHandle, nudgeHandle, slideTrim, timeToX, trimClock, trimProblem, xToTime } from './trim';

jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { availableDiskSpace: 0 } }));

describe('record session', () => {
  const idle: Session = { kind: 'idle' };

  it('counts down 5 to 1, then records', () => {
    let s = reduce(idle, { type: 'press', secondsLeft: 600 });
    expect(s).toEqual({ kind: 'countdown', n: 5 });
    for (let i = 0; i < 4; i++) s = reduce(s, { type: 'tick' });
    expect(s).toEqual({ kind: 'countdown', n: 1 });
    expect(reduce(s, { type: 'tick' })).toEqual({ kind: 'recording', elapsed: 0 });
  });

  it('asks first when storage is low, then records anyway on request', () => {
    const s = reduce(idle, { type: 'press', secondsLeft: 40 });
    expect(s).toEqual({ kind: 'storage', secondsLeft: 40 });
    expect(reduce(s, { type: 'recordAnyway' })).toEqual({ kind: 'countdown', n: 5 });
    expect(reduce(s, { type: 'dismissStorage' })).toEqual({ kind: 'idle' });
  });

  it('cancels a countdown and stops a recording on press', () => {
    expect(reduce({ kind: 'countdown', n: 3 }, { type: 'press', secondsLeft: 600 })).toEqual({ kind: 'idle' });
    expect(reduce({ kind: 'recording', elapsed: 7 }, { type: 'press', secondsLeft: 600 })).toEqual({ kind: 'stopping', elapsed: 7 });
  });

  it('warns past 30 s and stops itself at the 120 s cap', () => {
    expect(isTooLong({ kind: 'recording', elapsed: 30 })).toBe(false);
    expect(isTooLong({ kind: 'recording', elapsed: 31 })).toBe(true);
    expect(reduce({ kind: 'recording', elapsed: 119 }, { type: 'tick' })).toEqual({ kind: 'stopping', elapsed: 120 });
  });

  it('formats the timer', () => {
    expect(clock(6)).toBe('00:06');
    expect(clock(102)).toBe('01:42');
  });
});

describe('framing checks', () => {
  it('reports the configured failures and the first hint', () => {
    let results: ReturnType<typeof failing> = [];
    let hint: string | null = null;
    fixedChecker(['light', 'whole_body']).start('snatch', (r) => {
      results = failing(r);
      hint = firstHint(r);
    });
    expect(results).toEqual(['whole_body', 'light']);
    expect(hint).toBe(checkHint('whole_body'));
  });

  it('treats an unknown result (no real check yet) as neither failing nor a hint', () => {
    const results = [
      { id: 'whole_body' as const, pass: null },
      { id: 'side_on' as const, pass: null },
      { id: 'light' as const, pass: false },
    ];
    expect(failing(results)).toEqual(['light']);
    expect(firstHint(results)).toBe(checkHint('light'));
    expect(failing(results.map((r) => ({ ...r, pass: null })))).toEqual([]);
    expect(firstHint(results.map((r) => ({ ...r, pass: null })))).toBeNull();
  });

  it('parses dev check params and drops unknown ids', () => {
    expect(parseChecks('side_on,nope,light')).toEqual(['side_on', 'light']);
    expect(parseChecks(undefined)).toEqual([]);
  });
});

describe('trim', () => {
  it('keeps the handles inside the clip and at least 1 s apart', () => {
    const t = { start: 1.4, end: 7.6 };
    expect(moveHandle(t, 'start', -2, 8)).toEqual({ start: 0, end: 7.6 });
    expect(moveHandle(t, 'start', 7.5, 8)).toEqual({ start: 6.6, end: 7.6 });
    expect(moveHandle(t, 'end', 20, 8)).toEqual({ start: 1.4, end: 8 });
    expect(moveHandle(t, 'end', 1, 8)).toEqual({ start: 1.4, end: 2.4 });
  });

  it('slides the whole selection, keeping its length, inside the clip', () => {
    const t = { start: 1.4, end: 7.6 };
    expect(slideTrim(t, 1, 10)).toEqual({ start: 2.4, end: 8.6 });
    expect(slideTrim(t, 5, 10)).toEqual({ start: 3.8, end: 10 });
    expect(slideTrim(t, -3, 10)).toEqual({ start: 0, end: 6.2 });
  });

  it('nudges a handle a tenth of a second, still 1 s apart and inside the clip', () => {
    const t = { start: 1.4, end: 7.6 };
    expect(nudgeHandle(t, 'start', 1, 8)).toEqual({ start: 1.5, end: 7.6 });
    expect(nudgeHandle(t, 'end', -1, 8)).toEqual({ start: 1.4, end: 7.5 });
    expect(nudgeHandle({ start: 0, end: 8 }, 'start', -1, 8)).toEqual({ start: 0, end: 8 });
    expect(nudgeHandle({ start: 6.95, end: 8 }, 'start', 1, 8)).toEqual({ start: 7, end: 8 });
  });

  it('flags a trim longer than one lift, and one too long to analyse', () => {
    expect(trimProblem({ start: 0, end: 12 }, 86)).toBeNull();
    expect(trimProblem({ start: 0, end: 25 }, 86)).toBe('long');
    expect(trimProblem({ start: 0, end: 90 }, 86)).toBe('too_long');
  });

  it('loops playback inside the trim', () => {
    const t = { start: 1.4, end: 7.6 };
    expect(loopTime(3, t)).toBe(3);
    expect(loopTime(7.6, t)).toBe(1.4);
    expect(loopTime(0.2, t)).toBe(1.4);
  });

  it('maps between time and track position', () => {
    expect(timeToX(2, 8, 342)).toBe(85.5);
    expect(xToTime(85.5, 8, 342)).toBe(2);
    expect(xToTime(400, 8, 342)).toBe(8);
  });

  it('formats handle times to the tenth', () => {
    expect(trimClock(1.4)).toBe('00:01.4');
    expect(trimClock(67.65)).toBe('01:07.7');
  });
});

describe('sets in a long import', () => {
  it('lays sets and the gaps between them on the strip', () => {
    expect(setStrip(DEMO_SETS, 102)).toEqual([
      { kind: 'gap', seconds: 3 },
      { kind: 'set', seconds: 5, index: 0 },
      { kind: 'gap', seconds: 6 },
      { kind: 'set', seconds: 18, index: 1 },
      { kind: 'gap', seconds: 9 },
      { kind: 'set', seconds: 18, index: 2 },
      { kind: 'gap', seconds: 7 },
      { kind: 'set', seconds: 15, index: 3 },
      { kind: 'gap', seconds: 21 },
    ]);
  });

  it('offers one button per rep, or 1-5 when the count is unknown', () => {
    expect(repOptions(3)).toEqual([1, 2, 3]);
    expect(repOptions(null)).toEqual([1, 2, 3, 4, 5]);
  });

  it('uses the picked set as the trim, and trimming edits that set', () => {
    const clip = demoClip('import');
    expect(activeTrim(clip)).toEqual({ start: 14, end: 32 });
    const trimmed = withTrim(clip, { start: 15, end: 30 });
    expect(trimmed.sets[1]).toEqual({ start: 15, end: 30, reps: 5 });
    expect(trimmed.sets[0]).toEqual(DEMO_SETS[0]);
  });
});

describe('storage', () => {
  it('estimates seconds of video left', () => {
    expect(bytesPerSecond(30)).toBe(3_000_000);
    expect(bytesPerSecond(60)).toBe(6_000_000);
    expect(secondsLeft(60, 240_000_000)).toBe(40);
  });
});

describe('submit', () => {
  it('parses weight in kg and converts lb', () => {
    expect(parseWeight('62.5', 'kg')).toBe(62.5);
    expect(parseWeight('62,5', 'kg')).toBe(62.5);
    expect(parseWeight('135', 'lb')).toBe(61.2);
    expect(parseWeight('', 'kg')).toBeNull();
    expect(parseWeight('0', 'kg')).toBeNull();
  });

  it('packs the draft into a submission', () => {
    expect(toSubmission(demoClip('override'), '62.5', 'kg')).toEqual({
      uri: null,
      movement: 'snatch',
      loadKg: 62.5,
      trim: { start: 0, end: 8 },
      rep: 'all',
      source: 'camera',
      fps: 30,
      overridden: ['whole_body'],
    });
  });

  it('sends the bundled sample clip (no uri) to the sample analysis and counts it', async () => {
    await submitClip(toSubmission(demoClip('ok'), '', 'kg'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/analysis/processing', params: { fixture: 'snatch-mock', count: '1' } });
  });
});

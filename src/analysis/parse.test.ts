import { isPartial, noCueCode, parseAnalysis } from './parse';
import mock from './fixtures/snatch-mock.json';

describe('parseAnalysis', () => {
  it('accepts the mock fixture', () => {
    expect(parseAnalysis(mock).id).toBe('snatch-mock');
  });

  it('rejects pixel coordinates in the trace', () => {
    const bad = JSON.parse(JSON.stringify(mock));
    bad.reps[0].path[0].x = 412;
    expect(() => parseAnalysis(bad)).toThrow('Invalid Analysis: rep 1 path not normalised');
  });

  it('rejects an unknown version', () => {
    expect(() => parseAnalysis({ ...mock, version: 2 })).toThrow('Invalid Analysis: version 2');
  });

  it('accepts the optional detection fields and rejects a detection it cannot name', () => {
    const a = parseAnalysis({ ...mock, detectedMovement: { movement: 'clean', confidence: 0.9 }, movementUsed: 'clean' });
    expect([a.detectedMovement, a.movementUsed]).toEqual([{ movement: 'clean', confidence: 0.9 }, 'clean']);
    expect(parseAnalysis({ ...mock, detectedMovement: { movement: 'unknown', confidence: 0 } }).detectedMovement?.movement).toBe('unknown');
    expect(() => parseAnalysis({ ...mock, detectedMovement: { movement: 'deadlift', confidence: 0.9 } })).toThrow(
      'Invalid Analysis: detectedMovement deadlift'
    );
    expect(() => parseAnalysis({ ...mock, movementUsed: 'deadlift' })).toThrow('Invalid Analysis: movementUsed deadlift');
  });

  it('accepts sub-notes, and an analysis from before they existed', () => {
    const note = { faultId: 'hips_rise_early', text: 'Push the floor down, chest comes up.', why: 'w', severity: 1.5, reps: 2 };
    expect(parseAnalysis({ ...mock, notes: [note] }).notes).toEqual([note]);
    expect(parseAnalysis(mock).notes).toBeUndefined();
    expect(() => parseAnalysis({ ...mock, notes: 'x' })).toThrow('Invalid Analysis: notes');
  });

  it('accepts the analysis version, and an analysis from before it was stamped', () => {
    const a = parseAnalysis({ ...mock, analysisVersion: 'cv-2026.10.16', analysisRevision: '807270d' });
    expect([a.analysisVersion, a.analysisRevision]).toEqual(['cv-2026.10.16', '807270d']);
    expect(parseAnalysis(mock).analysisVersion).toBeUndefined();
    expect(() => parseAnalysis({ ...mock, analysisVersion: 3 })).toThrow('Invalid Analysis: analysisVersion');
    expect(() => parseAnalysis({ ...mock, analysisVersion: '' })).toThrow('Invalid Analysis: analysisVersion');
    expect(parseAnalysis({ ...mock, reanalysedAt: '2026-10-16T08:30:00Z' }).reanalysedAt).toBe('2026-10-16T08:30:00Z');
    expect(() => parseAnalysis({ ...mock, reanalysedAt: 'soon' })).toThrow('Invalid Analysis: reanalysedAt');
  });

  it('accepts a partial result, and reads its reason', () => {
    const partial = { ...mock, cue: null, noCueReason: { code: 'off_side_on', offSideDeg: 34 } };
    const a = parseAnalysis(partial);
    expect(a.noCueReason).toEqual({ code: 'off_side_on', offSideDeg: 34 });
    expect([isPartial(a), noCueCode(a)]).toEqual([true, 'off_side_on']);
    expect(noCueCode(parseAnalysis({ ...partial, noCueReason: { code: 'plate_hidden' } }))).toBe('plate_hidden');
  });

  it('reads a reason code from a newer worker as low confidence', () => {
    expect(noCueCode(parseAnalysis({ ...mock, cue: null, noCueReason: { code: 'glare' } }))).toBe('low_confidence');
  });

  it('treats old analyses and no-fault analyses as not partial', () => {
    const old = parseAnalysis(mock);
    expect([old.noCueReason, isPartial(old), noCueCode(old)]).toEqual([undefined, false, null]);
    const clean = parseAnalysis({ ...mock, cue: null, noCueReason: null });
    expect([isPartial(clean), noCueCode(clean)]).toEqual([false, null]);
  });

  it('keeps the specific refusal code on a failure', () => {
    const a = parseAnalysis({ ...mock, reps: [], cue: null, failure: { reason: 'unsupported_movement', code: 'no_reps', message: 'm' } });
    expect(a.failure).toEqual({ reason: 'unsupported_movement', code: 'no_reps', message: 'm' });
  });

  it('rejects a malformed reason', () => {
    expect(() => parseAnalysis({ ...mock, cue: null, noCueReason: 'off_side_on' })).toThrow('Invalid Analysis: noCueReason');
    expect(() => parseAnalysis({ ...mock, cue: null, noCueReason: { code: 'off_side_on', offSideDeg: '34' } })).toThrow(
      'Invalid Analysis: noCueReason.offSideDeg'
    );
  });
});

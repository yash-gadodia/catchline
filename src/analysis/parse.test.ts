import { parseAnalysis } from './parse';
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
});

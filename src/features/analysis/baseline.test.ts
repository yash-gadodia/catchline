import { snatchMock } from '../../analysis/fixtures';
import { seededLibrary } from '../library/seed';
import type { Session } from '../library/types';
import { baselineSentence } from './baseline';

const snatch = (date: string, drift: number): Session => ({ id: date, movement: 'snatch', date, values: { bar_drift_hip: drift } });

describe('baselineSentence', () => {
  it("quotes today against the lifter's best and last five, leaving out today's own session", () => {
    const lib = seededLibrary();
    expect(baselineSentence(snatchMock, lib.lifts, lib.sessions)).toBe(
      '6 cm today. Your best is 2 cm (18 Sep) and your last five average 7.6 cm.'
    );
  });

  it('calls a new best a best', () => {
    expect(baselineSentence(snatchMock, [], [snatch('2026-10-01', 8), snatch('2026-10-03', 7)])).toBe(
      '6 cm today, your best yet. Before this, your last two average 7.5 cm.'
    );
  });

  it("falls back to the analysis's own best with no history, and to nothing without one", () => {
    expect(baselineSentence(snatchMock, [], [])).toBe('6 cm today. Your best is 2 cm.');
    const noBest = { ...snatchMock, measurements: snatchMock.measurements.map((m) => ({ ...m, best: undefined })) };
    expect(baselineSentence(noBest, [], [])).toBeNull();
  });
});

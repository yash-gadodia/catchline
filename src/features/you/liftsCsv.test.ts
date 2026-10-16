import { Platform, Share } from 'react-native';
import { File } from 'expo-file-system';
import type { Analysis, Measurement } from '../../analysis/types';
import { loadLibrary } from '../library/repository';
import type { Lift } from '../library/types';
import { setLanguage } from '../../i18n';
import { exportMyLifts, liftsCsv, shareLiftsCsv } from './liftsCsv';

jest.mock('expo-file-system', () => {
  const File = jest.fn().mockImplementation(() => ({ uri: 'file:///cache/catchline-lifts.csv', create: jest.fn(), write: jest.fn() }));
  return { File, Paths: { cache: { uri: 'file:///cache/' } } };
});

const lift = (over: Partial<Lift>): Lift => ({ id: 'l1', movement: 'snatch', date: '2026-10-12', status: 'done', ...over });
const m = (id: string, label: string, value: number, unit: Measurement['unit'], status: Measurement['status'] = 'normal'): Measurement => ({
  id,
  label,
  value,
  unit,
  frame: 1,
  status,
  note: '',
});
const analysis = (over: Partial<Analysis>): Analysis =>
  ({ cue: null, measurements: [], analysisVersion: 'cv-2026.10.16', ...over }) as unknown as Analysis;

describe('liftsCsv', () => {
  it('writes one row per measurement, oldest lift first, quoting commas and quotes in the cue', () => {
    const csv = liftsCsv([
      {
        lift: lift({ id: 'l2', date: '2026-10-14', loadKg: 62.5 }),
        analysis: analysis({
          cue: { text: 'Stay over the bar, then "jump"' } as Analysis['cue'],
          measurements: [
            m('jump_forward', 'Jumped forward', 6, 'cm', 'cue'),
            m('turnover_time', 'Turnover time', 0.21, 's'),
            m('bar_speed', 'Peak bar speed', 0, 'm/s', 'not_seen'),
            m('body_line', 'Body line', 172, 'deg'),
          ],
        }),
      },
      { lift: lift({ id: 'l1', movement: 'kipping_pull_up', date: '2026-10-10' }), analysis: analysis({ analysisVersion: undefined, measurements: [m('cycle_time', 'Cycle time', 1.4, 's')] }) },
      { lift: lift({ id: 'l3', movement: 'clean', date: '2026-10-15', loadKg: 80, status: 'failed' }) },
    ]);
    expect(csv).toBe(
      [
        'date,lift_id,movement,load_kg,status,cue,measurement_id,measurement,value,unit,analysis_version',
        '2026-10-10,l1,Kipping pull-up,,done,,cycle_time,Cycle time,1.4,s,',
        '2026-10-14,l2,Snatch,62.5,done,"Stay over the bar, then ""jump""",jump_forward,Jumped forward,6,cm,cv-2026.10.16',
        '2026-10-14,l2,Snatch,62.5,done,"Stay over the bar, then ""jump""",turnover_time,Turnover time,0.21,s,cv-2026.10.16',
        '2026-10-14,l2,Snatch,62.5,done,"Stay over the bar, then ""jump""",body_line,Body line,172,deg,cv-2026.10.16',
        '2026-10-15,l3,Clean,80,failed,,,,,,',
        '',
      ].join('\n')
    );
  });

  it('is just the header with no lifts', () => {
    expect(liftsCsv([])).toBe('date,lift_id,movement,load_kg,status,cue,measurement_id,measurement,value,unit,analysis_version\n');
  });

  it('quotes a line break in a cue', () => {
    const csv = liftsCsv([{ lift: lift({}), analysis: analysis({ cue: { text: 'Push\nthe floor' } as Analysis['cue'] }) }]);
    expect(csv.split('\n').slice(1).join('\n')).toBe('2026-10-12,l1,Snatch,,done,"Push\nthe floor",,,,,cv-2026.10.16\n');
  });

  it('keeps movement names English whatever the app language', () => {
    setLanguage('de');
    const csv = liftsCsv([{ lift: lift({}), analysis: analysis({}) }]);
    setLanguage('en');
    expect(csv.split('\n')[1].split(',')[2]).toBe('Snatch');
  });
});

describe('exportMyLifts', () => {
  it('exports every lift in the library with its analysis', async () => {
    loadLibrary('seeded');
    const send = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
    await exportMyLifts(send);
    const csv = send.mock.calls[0][0];
    const rows = csv.trim().split('\n');
    expect(rows[0]).toBe('date,lift_id,movement,load_kg,status,cue,measurement_id,measurement,value,unit,analysis_version');
    expect(rows.filter((r) => r.includes(',l-snatch-today,'))[0]).toMatch(/^2026-10-11,l-snatch-today,Snatch,62\.5,done,/);
    expect(new Set(rows.slice(1).map((r) => r.split(',')[1]))).toEqual(
      new Set(['l-snatch-today', 'l-clean', 'l-mu', 'l-jerk', 'l-snatch-queued', 'l-snatch-miss', 'l-snatch-real', 'l-snatch-low'])
    );
  });
});

describe('shareLiftsCsv', () => {
  it('writes the CSV to a cache file and opens the share sheet with it on iOS', async () => {
    Platform.OS = 'ios';
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    await shareLiftsCsv('a,b\n');
    const file = (File as unknown as jest.Mock).mock.results[0].value;
    expect((File as unknown as jest.Mock).mock.calls[0][1]).toBe('catchline-lifts.csv');
    expect(file.create).toHaveBeenCalledWith({ overwrite: true });
    expect(file.write).toHaveBeenCalledWith('a,b\n');
    expect(share).toHaveBeenCalledWith({ url: 'file:///cache/catchline-lifts.csv' });
  });
});

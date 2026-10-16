import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { ANALYSES } from '../../analysis/fixtures';
import { movementLabel } from '../../analysis/format';
import { liveAnalysis } from '../../analysis/live';
import type { Analysis } from '../../analysis/types';
import { useLibraryStore } from '../library/store';
import type { Lift } from '../library/types';

export type CsvLift = { lift: Lift; analysis?: Analysis };

const HEADER = ['date', 'lift_id', 'movement', 'load_kg', 'status', 'cue', 'measurement_id', 'measurement', 'value', 'unit', 'analysis_version'];

function cell(v: string | number | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per measurement (a lift with none still gets one row), oldest lift first.
// What the clip could not see is left out, as on Trends.
export function liftsCsv(rows: CsvLift[]): string {
  const lines = [HEADER.join(',')];
  const sorted = [...rows].sort((a, b) => (a.lift.date < b.lift.date ? -1 : a.lift.date > b.lift.date ? 1 : 0));
  for (const { lift, analysis } of sorted) {
    const head = [lift.date, lift.id, movementLabel(lift.movement), lift.loadKg, lift.status, analysis?.cue?.text];
    const seen = (analysis?.measurements ?? []).filter((m) => m.status !== 'not_seen');
    const tails = seen.length > 0 ? seen.map((m) => [m.id, m.label, m.value, m.unit]) : [[undefined, undefined, undefined, undefined]];
    for (const tail of tails) lines.push([...head, ...tail, analysis?.analysisVersion].map(cell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function libraryLifts(): CsvLift[] {
  return useLibraryStore.getState().lifts.map((lift) => ({
    lift,
    analysis: lift.analysisId ? (liveAnalysis(lift.analysisId) ?? ANALYSES[lift.analysisId]) : undefined,
  }));
}

export async function shareLiftsCsv(csv: string): Promise<void> {
  if (Platform.OS !== 'ios') {
    await Share.share({ title: 'catchline-lifts.csv', message: csv });
    return;
  }
  const file = new File(Paths.cache, 'catchline-lifts.csv');
  file.create({ overwrite: true });
  file.write(csv);
  await Share.share({ url: file.uri });
}

export async function exportMyLifts(send: (csv: string) => Promise<void> = shareLiftsCsv): Promise<void> {
  await send(liftsCsv(libraryLifts()));
}

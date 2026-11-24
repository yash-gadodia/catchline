import type { Key } from '../../i18n';

// What's new, newest first. Each version is the app version (app.json expo.version) it shipped in;
// the words live in the i18n catalogues under you.whatsNew.*.
export type ChangelogEntry = { version: string; date?: string; items: Key[] };

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '4.0.9',
    date: '2026-11-24',
    items: ['you.whatsNew.v409.1', 'you.whatsNew.v409.2'],
  },
  {
    version: '4.0.8',
    date: '2026-11-23',
    items: ['you.whatsNew.v408.1', 'you.whatsNew.v408.2', 'you.whatsNew.v408.3', 'you.whatsNew.v408.4'],
  },
  {
    version: '4.0.7',
    date: '2026-11-22',
    items: ['you.whatsNew.v407.1'],
  },
  {
    version: '4.0.6',
    items: ['you.whatsNew.v406.1'],
  },
  {
    version: '4.0.5',
    items: ['you.whatsNew.v405.1'],
  },
  {
    version: '4.0.4',
    items: ['you.whatsNew.v404.1', 'you.whatsNew.v404.2'],
  },
  {
    version: '4.0.3',
    items: ['you.whatsNew.v403.plate', 'you.whatsNew.v403.share', 'you.whatsNew.v403.tools', 'you.whatsNew.v403.notes', 'you.whatsNew.v403.languages'],
  },
  {
    version: '4.0.2',
    date: '2026-11-14',
    items: ['you.whatsNew.v402.reps', 'you.whatsNew.v402.speed', 'you.whatsNew.v402.share', 'you.whatsNew.v402.compare', 'you.whatsNew.v402.csv', 'you.whatsNew.v402.plate', 'you.whatsNew.v402.you'],
  },
  {
    version: '4.0',
    date: '2026-11-13',
    items: ['you.whatsNew.v40.tracker', 'you.whatsNew.v40.private'],
  },
  {
    version: '3.1',
    date: '2026-10-22',
    items: ['you.whatsNew.v31.onDevice', 'you.whatsNew.v31.privacy', 'you.whatsNew.v31.reads', 'you.whatsNew.v31.hips'],
  },
];

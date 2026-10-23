import type { Key } from '../../i18n';

// What's new, newest first. Each version is the app version (app.json expo.version) it shipped in;
// the words live in the i18n catalogues under you.whatsNew.*.
export type ChangelogEntry = { version: string; items: Key[] };

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '3.1',
    items: ['you.whatsNew.v31.onDevice', 'you.whatsNew.v31.privacy', 'you.whatsNew.v31.reads', 'you.whatsNew.v31.hips'],
  },
];

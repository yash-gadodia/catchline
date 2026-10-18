import { readFileSync } from 'fs';
import { join } from 'path';
import { DRILLS, drillFor } from './drills';
import FAULT_IDS from './fault-ids.json';
import { en } from '../../i18n/en';
import { setLanguage } from '../../i18n';

describe('drill content', () => {
  it('the fixture matches the CV RULES dict, so a new fault cannot ship without a drill', () => {
    const rules = JSON.parse(readFileSync(join(__dirname, '../../../cv/catchline_cv/rules.json'), 'utf8'));
    expect(Object.keys(rules.RULES)).toEqual(FAULT_IDS);
  });

  it('every fault the CV can cue has exactly one drill, keyed by its own id', () => {
    expect(Object.keys(DRILLS).sort()).toEqual([...FAULT_IDS].sort());
    for (const id of FAULT_IDS) expect(DRILLS[id].faultId).toBe(id);
  });

  it('every drill has a name, 2 or 3 steps, a dose and a one-line why', () => {
    for (const d of Object.values(DRILLS)) {
      expect(d.name.length).toBeGreaterThan(5);
      expect([2, 3]).toContain(d.steps.length);
      expect(d.dose.length).toBeGreaterThan(2);
      expect(d.why).not.toContain('\n');
      expect(d.why.endsWith('.')).toBe(true);
    }
  });

  it('stays a draft until a coach reviews it', () => {
    expect(Object.values(DRILLS).filter((d) => !d.draft).map((d) => d.faultId)).toEqual([]);
  });

  it('copy avoids medical claims, "heavy", em dashes and verdict words', () => {
    const text = Object.values(DRILLS)
      .flatMap((d) => [d.name, d.dose, d.why, ...d.steps])
      .join('\n');
    expect(text).not.toMatch(/injur|diagnos|rehab|pain|heavy|—|\b(wrong|bad|mistake|fault|error)\b/i);
  });

  it('drillFor returns the drill, and nothing for an unknown or missing id', () => {
    expect(drillFor('jump_forward')?.name).toBe('No-foot snatch or clean');
    expect(drillFor('bar_drift_knee')).toBeUndefined();
    expect(drillFor(undefined)).toBeUndefined();
  });

  it('keeps the English catalogue word for word with DRILLS, so every language translates the reviewed copy', () => {
    for (const d of Object.values(DRILLS)) {
      const id = d.faultId;
      const fields: [string, string][] = [['name', d.name], ['dose', d.dose], ['why', d.why], ...d.steps.map((s, i): [string, string] => [`step${i + 1}`, s])];
      for (const [field, text] of fields) expect(`${id}.${field}: ${en[`drills.${id}.${field}` as keyof typeof en]}`).toBe(`${id}.${field}: ${text}`);
    }
  });

  it('serves the drill in the app language', () => {
    setLanguage('es');
    try {
      expect(drillFor('jump_forward')?.name).toBe('Arranque o cargada sin mover los pies');
      expect(drillFor('jump_forward')?.steps).toHaveLength(3);
    } finally {
      setLanguage('en');
    }
  });
});

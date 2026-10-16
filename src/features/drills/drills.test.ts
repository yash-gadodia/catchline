import { readFileSync } from 'fs';
import { join } from 'path';
import { DRILLS, drillFor } from './drills';
import FAULT_IDS from './fault-ids.json';

describe('drill content', () => {
  it('the fixture matches the CV RULES dict, so a new fault cannot ship without a drill', () => {
    const rules = readFileSync(join(__dirname, '../../../cv/catchline_cv/rules.py'), 'utf8');
    const block = rules.slice(rules.indexOf('RULES = {'), rules.indexOf('\n}\n', rules.indexOf('RULES = {')));
    const ids = [...block.matchAll(/^\s+"([a-z_]+)": \{/gm)].map((m) => m[1]);
    expect(ids).toEqual(FAULT_IDS);
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
});

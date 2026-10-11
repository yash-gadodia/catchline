const coach = require('./coach');
const mock = require('../../src/analysis/fixtures/snatch-mock.json');

describe('coach link page logic', () => {
  it('accepts a bare analysis or an envelope', () => {
    expect(coach.normalise(mock)).toEqual({ athlete: 'Your athlete', sharedAt: null, includeCue: true, analysis: mock });
    const env = coach.normalise({ athlete: 'Alex', sharedAt: '2026-10-11T08:00:00.000Z', includeCue: false, analysis: mock });
    expect([env.athlete, env.includeCue]).toEqual(['Alex', false]);
    expect(() => coach.normalise({ version: 2, reps: [] })).toThrow('Not a Catchline analysis');
  });

  it('decodes a base64url payload from the hash', () => {
    const payload = { athlete: 'Zoë', analysis: { version: 1, reps: [{ index: 1 }] } };
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    expect(coach.decodeHash(`#d=${b64}`)).toEqual(payload);
    expect(coach.decodeHash('')).toBeNull();
  });

  it('resolves bundled frame ids against the asset base', () => {
    expect(coach.resolveImage('asset:snatch/3-hip', '../../assets')).toBe('../../assets/frames/snatch/3-hip.jpg');
    expect(coach.resolveImage('asset:snatch-real/r1-1-setup', '/a')).toBe('/a/analysis/snatch-real/r1-1-setup.jpg');
    expect(coach.resolveImage('https://cdn.example/f.jpg', '/a')).toBe('https://cdn.example/f.jpg');
    expect(coach.resolveImage(undefined, '/a')).toBeNull();
  });

  it('plays the cue rep from setup to the catch', () => {
    const kf = coach.keyframes(mock);
    expect(kf.rep.index).toBe(2);
    expect(kf.frames.map((k) => k.phase)).toEqual(['setup', 'first_pull', 'transition', 'second_pull', 'turnover', 'catch']);
  });

  it('draws the path up to the current frame in stage pixels', () => {
    const path = [
      { frame: 0, x: 0.5, y: 1 },
      { frame: 10, x: 0.5, y: 0.5 },
      { frame: 20, x: 0.6, y: 0 },
    ];
    expect(coach.pathUpTo(path, 15)).toEqual([
      { frame: 0, x: 0.5, y: 1 },
      { frame: 10, x: 0.5, y: 0.5 },
      { frame: 15, x: 0.55, y: 0.25 },
    ]);
    const fit = coach.coverFit({ width: 608, height: 1080 }, { width: 390, height: 360 }, { x: 0.5, y: 0.45 });
    expect(fit.width).toBe(390);
    expect(fit.height).toBeCloseTo(692.76, 2);
    expect(fit.y).toBeCloseTo(-149.74, 2);
    expect(coach.svgPath([{ x: 0, y: 0 }, { x: 1, y: 0.5 }], { x: 0, y: -10, width: 100, height: 200 })).toBe('M0.0 -10.0 L100.0 90.0');
  });

  it('labels the cue as an AI estimate and lists the measurements seen', () => {
    expect(coach.cueLabel(mock.cue)).toBe('Catchline suggested · AI estimate · clear on all 3 reps');
    const rows = coach.measurementRows(mock);
    expect(rows.map((r) => r.id)).toEqual(['hips_rise_early', 'bar_drift_hip', 'jump_forward', 'catch_depth', 'turnover_time', 'pull_time']);
    expect(rows[0]).toEqual({ id: 'hips_rise_early', label: 'Hips rose early', value: '0.12 s', cue: true });
    expect(rows[1].value).toBe('6 cm · best 2');
    expect(coach.title(mock)).toBe('Snatch · 62.5 kg');
    expect(coach.dateLabel('2026-10-11T08:00:00.000Z')).toBe('Sun 11 Oct');
  });

  it('builds the override, note and refilm submissions', () => {
    expect(coach.buildPayload('override', '7f3a', { analysisId: 'snatch-mock', coachName: ' Coach Dani ', text: ' Pull slower off the floor. ' })).toEqual({
      ok: true,
      body: { kind: 'override', linkId: '7f3a', analysisId: 'snatch-mock', coachName: 'Coach Dani', text: 'Pull slower off the floor.' },
    });
    expect(coach.buildPayload('override', '7f3a', { analysisId: 'x', coachName: 'Dani', text: '  ' })).toEqual({
      ok: false,
      error: 'Write the cue you want them to try.',
    });
    expect(coach.buildPayload('note', '7f3a', { analysisId: 'x', coachName: '', text: 'Nice' })).toEqual({
      ok: false,
      error: 'Add your name so they know who it is from.',
    });
    expect(coach.buildPayload('refilm', '7f3a', { analysisId: 'x', coachName: 'Dani', reasons: ['Film side-on'] })).toEqual({
      ok: true,
      body: { kind: 'refilm', linkId: '7f3a', analysisId: 'x', coachName: 'Dani', reasons: ['Film side-on'] },
    });
  });

  it('stubs the submit until the Phase 3 endpoint exists', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    await expect(coach.submit({ kind: 'note' })).resolves.toEqual({ ok: true });
    expect(coach.sent).toEqual([{ kind: 'note' }]);
    info.mockRestore();
  });
});

import { BAR_PHASES, PROCESSING_ART, coverPoint, phaseForStep, processingBarPath } from './barPath';

describe('processing bar path', () => {
  it('measures the plate centre from the backdrop PNG', () => {
    expect(PROCESSING_ART).toEqual({ width: 1179, height: 2556, plate: { x: 315, y: 1227 } });
  });

  it('maps an art pixel through resizeMode cover', () => {
    const p = coverPoint({ x: 315, y: 1227 }, { width: 1179, height: 2556 }, { width: 402, height: 874 });
    expect(p.x).toBeCloseTo(107.1373, 3);
    expect(p.y).toBeCloseTo(419.561, 3);
  });

  it('starts on the plate centre at the iPhone 17 Pro size', () => {
    const path = processingBarPath({ width: 402, height: 874 });
    expect(path.start.x).toBeCloseTo(107.1373, 3);
    expect(path.start.y).toBeCloseTo(419.561, 3);
    expect(path.d.startsWith('M107.14 419.56 C')).toBe(true);
  });

  it('follows the plate on a wider screen where cover crops top and bottom', () => {
    const path = processingBarPath({ width: 440, height: 800 });
    expect(path.start.x).toBeCloseTo(117.5573, 3);
    expect(path.start.y).toBeCloseTo(380.9669, 3);
  });

  it('rises from the plate, loops at the turnover and settles overhead below its peak', () => {
    const { start, ends, reach, total } = processingBarPath({ width: 402, height: 874 });
    const s = 874 / 2556;
    expect(ends).toHaveLength(BAR_PHASES.length);
    expect(ends[0].y - start.y).toBeCloseTo(-150 * s, 3);
    expect(ends[2].y - start.y).toBeCloseTo(-640 * s, 3);
    expect(ends[3].x - start.x).toBeCloseTo(22 * s, 3);
    expect(ends[3].y - start.y).toBeCloseTo(-570 * s, 3);
    expect(reach[3]).toBe(total);
    expect(reach[0]).toBeLessThan(reach[1]);
    expect(reach[1]).toBeLessThan(reach[2]);
    expect(reach[2]).toBeLessThan(reach[3]);
  });

  it('reveals one phase per processing step, then holds on the catch', () => {
    expect([0, 1, 2, 3, 4, 5].map(phaseForStep)).toEqual([0, 1, 2, 3, 3, 3]);
  });
});

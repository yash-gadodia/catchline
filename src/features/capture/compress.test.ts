import { bitrateBudget, maxDurationS, outputSize, planEncode, retryPlan, targetBitrate, UPLOAD_LIMIT_BYTES } from './compress';

const SRC_4K = { width: 3840, height: 2160, fps: 30, durationS: 12.1 };

describe('outputSize', () => {
  it('scales the long edge to 1080 and keeps both sides even', () => {
    expect(outputSize(3840, 2160)).toEqual({ width: 1080, height: 608 });
    expect(outputSize(2160, 3840)).toEqual({ width: 608, height: 1080 });
    expect(outputSize(1920, 1080)).toEqual({ width: 1080, height: 608 });
    expect(outputSize(1440, 1080)).toEqual({ width: 1080, height: 810 });
  });

  it('never upscales a small clip', () => {
    expect(outputSize(720, 1280)).toEqual({ width: 608, height: 1080 });
    expect(outputSize(640, 360)).toEqual({ width: 640, height: 360 });
    expect(outputSize(639, 359)).toEqual({ width: 640, height: 360 });
  });
});

describe('targetBitrate', () => {
  it('rises with frame rate: 8 / 10 / 12 Mbps', () => {
    expect(targetBitrate(29.97)).toBe(8_000_000);
    expect(targetBitrate(30)).toBe(8_000_000);
    expect(targetBitrate(59.94)).toBe(10_000_000);
    expect(targetBitrate(120)).toBe(12_000_000);
  });
});

describe('planEncode', () => {
  it('a 10 s 30 fps clip encodes at 8 Mbps (about 10 MB)', () => {
    expect(planEncode(SRC_4K, { start: 1, end: 11 })).toEqual({
      kind: 'encode',
      startS: 1,
      endS: 11,
      width: 1080,
      height: 608,
      fps: 30,
      dropToFps: false,
      bitrate: 8_000_000,
    });
  });

  it('keeps 60 and 120 fps and gives them more bits', () => {
    const p60 = planEncode({ ...SRC_4K, fps: 59.94 }, { start: 0, end: 10 });
    const p120 = planEncode({ ...SRC_4K, fps: 120 }, { start: 0, end: 10 });
    expect(p60).toMatchObject({ fps: 59.94, dropToFps: false, bitrate: 10_000_000 });
    expect(p120).toMatchObject({ fps: 120, dropToFps: false, bitrate: 12_000_000 });
  });

  it('caps 240 fps slo-mo at 120 by dropping frames', () => {
    expect(planEncode({ width: 1920, height: 1080, fps: 240, durationS: 8 }, { start: 0, end: 8 })).toMatchObject({
      width: 1080,
      height: 608,
      fps: 120,
      dropToFps: true,
      bitrate: 12_000_000,
    });
  });

  it('lowers the bitrate so a long clip still fits under 45 MB', () => {
    const plan = planEncode({ ...SRC_4K, fps: 60, durationS: 60 }, { start: 0, end: 60 });
    expect(plan).toMatchObject({ kind: 'encode', bitrate: 5_788_139 });
    expect(bitrateBudget(60)).toBe(5_788_139);
  });

  it('asks for a shorter trim when even the floor bitrate would not fit', () => {
    expect(maxDurationS()).toBe(86);
    expect(planEncode({ ...SRC_4K, durationS: 120 }, { start: 0, end: 90 })).toEqual({ kind: 'too_long', maxS: 86 });
    expect(planEncode({ ...SRC_4K, durationS: 120 }, { start: 0, end: 86 })).toMatchObject({ kind: 'encode', bitrate: 4_038_236 });
  });

  it('clamps the trim to the real duration and falls back to 30 fps when unknown', () => {
    expect(planEncode({ ...SRC_4K, fps: 0 }, { start: -1, end: 20 })).toMatchObject({ startS: 0, endS: 12.1, fps: 30 });
  });
});

describe('retryPlan', () => {
  const plan = { kind: 'encode' as const, startS: 0, endS: 12, width: 1080, height: 608, fps: 30, dropToFps: false, bitrate: 8_000_000 };

  it('accepts an output under the limit', () => {
    expect(retryPlan(plan, UPLOAD_LIMIT_BYTES)).toBeNull();
    expect(retryPlan(plan, 12_000_000)).toBeNull();
  });

  it('scales the bitrate down to fit when the encoder overshoots', () => {
    expect(retryPlan(plan, 60 * 1024 * 1024)).toEqual({ ...plan, bitrate: 5_520_000 });
  });

  it('gives up when the scaled bitrate would drop below the floor', () => {
    expect(retryPlan(plan, 100 * 1024 * 1024)).toEqual({ kind: 'too_long', maxS: 86 });
  });
});

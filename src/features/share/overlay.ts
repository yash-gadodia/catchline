import type { Analysis, Rep } from '../../analysis/types';
import { coverFit, type Fit, type Size } from '../../analysis/geometry';
import { heroValue } from '../../analysis/format';
import { cueText } from '../../i18n/cues';
import { keyFrameForPhase, liftPath, pointAt, repByIndex } from '../../analysis/timeline';
import { colors } from '../../design/tokens';
import { cueMeasurement } from './model';

export type ShareAspect = '9:16' | '4:5';
export const SHARE_ASPECTS: ShareAspect[] = ['9:16', '4:5'];

// A stretch of the original clip (seconds) played at `rate` (0.5 = half speed).
export type Segment = { startS: number; endS: number; rate: number };
export type TimedPoint = { t: number; x: number; y: number };
export type OverlayText = { text: string; fonts: string[]; size: number; color: string; tracking: number; upper: boolean };

// Everything the native renderer needs, already in output pixels and output
// seconds, so the Swift side only places layers.
export type OverlaySpec = {
  width: number;
  height: number;
  fps: number;
  segments: Segment[];
  durationS: number;
  video: Fit;
  path: TimedPoint[];
  pathColor: string;
  pathWidth: number;
  dots: TimedPoint[];
  dotColor: string;
  dotRadius: number;
  scrimFrom: number;
  // Stacked upward from `bottom`, listed top to bottom.
  stack: { x: number; bottom: number; width: number; gap: number; items: OverlayText[] };
  wordmark: { x: number; y: number; size: number; text: OverlayText } | null;
};

export const OUTPUT: Record<ShareAspect, Size> = { '9:16': { width: 1080, height: 1920 }, '4:5': { width: 1080, height: 1350 } };

// Instagram covers ~250 px at the top of a story (progress bar, avatar), ~340 px
// at the bottom (reply bar) and a ~120 px right rail on reels. Feed posts only
// need a margin.
export const SAFE: Record<ShareAspect, { top: number; bottom: number; left: number; right: number }> = {
  '9:16': { top: 250, bottom: 340, left: 64, right: 120 },
  '4:5': { top: 64, bottom: 72, left: 64, right: 64 },
};

export const MAX_OUTPUT_S = 12;
export const SLOW_RATE = 0.5;
// Half speed of a 30 fps clip plays like 15 fps; only slow clips that can take it.
export const SLOW_MIN_FPS = 50;

const DISPLAY = ['BigShouldersDisplay_700Bold', 'BigShouldersDisplay-Bold'];
const DISPLAY_BLACK = ['BigShouldersDisplay_900Black', 'BigShouldersDisplay-Black'];
const MONO = ['SometypeMono_400Regular', 'SometypeMono-Regular'];

const round = (n: number, d: number) => Number(n.toFixed(d));

// Cover when the shapes are close (a phone clip into 9:16), else fit the whole
// frame on black so the bar never leaves the picture.
export function videoRect(src: Size, box: Size): Fit {
  const a = src.width / src.height;
  const b = box.width / box.height;
  if (Math.abs(a - b) / b <= 0.25) {
    const f = coverFit(src, box);
    return { x: round(f.x, 1), y: round(f.y, 1), width: round(f.width, 1), height: round(f.height, 1) };
  }
  const scale = Math.min(box.width / src.width, box.height / src.height);
  const width = src.width * scale;
  const height = src.height * scale;
  return { x: round((box.width - width) / 2, 1), y: round((box.height - height) / 2, 1), width: round(width, 1), height: round(height, 1) };
}

function phaseFrame(rep: Rep, name: string, edge: 'startFrame' | 'endFrame'): number | null {
  return rep.phases.find((p) => p.name === name)?.[edge] ?? null;
}

// The rep in source seconds, the pull to the catch at half speed when the clip
// has the frames for it, cut to MAX_OUTPUT_S.
export function repSegments(rep: Rep, fps: number, clipStartS: number): Segment[] {
  const at = (frame: number) => round(clipStartS + frame / fps, 3);
  const slowFrom = phaseFrame(rep, 'first_pull', 'startFrame');
  const slowTo = phaseFrame(rep, 'catch', 'endFrame');
  const slow = fps >= SLOW_MIN_FPS && slowFrom != null && slowTo != null && slowTo > slowFrom;
  const cuts = slow
    ? [
        { from: rep.startFrame, to: Math.max(rep.startFrame, slowFrom), rate: 1 },
        { from: Math.max(rep.startFrame, slowFrom), to: Math.min(rep.endFrame, slowTo), rate: SLOW_RATE },
        { from: Math.min(rep.endFrame, slowTo), to: rep.endFrame, rate: 1 },
      ]
    : [{ from: rep.startFrame, to: rep.endFrame, rate: 1 }];
  const out: Segment[] = [];
  let left = MAX_OUTPUT_S;
  for (const c of cuts) {
    if (c.to <= c.from || left <= 0) continue;
    const startS = at(c.from);
    const full = at(c.to) - startS;
    const endS = round(startS + Math.min(full, left * c.rate), 3);
    out.push({ startS, endS, rate: c.rate });
    left -= (endS - startS) / c.rate;
  }
  return out;
}

export function outputDuration(segments: Segment[]): number {
  return round(segments.reduce((s, g) => s + (g.endS - g.startS) / g.rate, 0), 3);
}

// Where a source moment lands on the output clock; null when it was cut.
export function outputTime(segments: Segment[], sourceS: number): number | null {
  let t = 0;
  for (const g of segments) {
    if (sourceS >= g.startS && sourceS <= g.endS) return round(t + (sourceS - g.startS) / g.rate, 3);
    t += (g.endS - g.startS) / g.rate;
  }
  return null;
}

export function buildOverlaySpec(analysis: Analysis, opts: { aspect: ShareAspect; clipStartS: number; pro: boolean }): OverlaySpec {
  const box = OUTPUT[opts.aspect];
  const safe = SAFE[opts.aspect];
  const fps = analysis.video.fps;
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const segments = repSegments(rep, fps, opts.clipStartS);
  const video = videoRect({ width: analysis.video.width, height: analysis.video.height }, box);
  const place = (frame: number, x: number, y: number): TimedPoint | null => {
    const t = outputTime(segments, round(opts.clipStartS + frame / fps, 3));
    return t == null ? null : { t, x: round(video.x + x * video.width, 1), y: round(video.y + y * video.height, 1) };
  };
  const path = liftPath(rep)
    .map((p) => place(p.frame, p.x, p.y))
    .filter((p): p is TimedPoint => !!p);
  const dots = ['setup', 'first_pull', 'transition', 'catch']
    .map((ph) => keyFrameForPhase(rep, ph))
    .map((k) => {
      const p = k ? pointAt(rep.path, k.frame) : null;
      return k && p ? place(k.frame, p.x, p.y) : null;
    })
    .filter((p): p is TimedPoint => !!p);

  const measurement = cueMeasurement(analysis);
  const items: (OverlayText | null)[] = [
    measurement ? { text: measurement.label, fonts: MONO, size: 30, color: colors.text2, tracking: 2.4, upper: true } : null,
    analysis.cue ? { text: heroValue(analysis.cue), fonts: DISPLAY_BLACK, size: 160, color: colors.text, tracking: -3.2, upper: false } : null,
    analysis.cue ? { text: cueText(analysis.cue.faultId, analysis.cue.text), fonts: DISPLAY, size: 68, color: colors.text, tracking: -1.4, upper: false } : null,
  ];

  return {
    width: box.width,
    height: box.height,
    fps: 30,
    segments,
    durationS: outputDuration(segments),
    video,
    path,
    pathColor: colors.flare,
    pathWidth: 10,
    dots,
    dotColor: colors.text,
    dotRadius: 9,
    scrimFrom: Math.round(box.height * 0.5),
    stack: {
      x: safe.left,
      bottom: box.height - safe.bottom,
      width: box.width - safe.left - safe.right,
      gap: 8, // design-ok: pixels in the 1080-wide video overlay spec, not RN layout
      items: items.filter((i): i is OverlayText => !!i),
    },
    wordmark: opts.pro
      ? null
      : { x: safe.left, y: safe.top, size: 44, text: { text: 'Catchline', fonts: DISPLAY, size: 40, color: colors.text, tracking: 0, upper: false } },
  };
}

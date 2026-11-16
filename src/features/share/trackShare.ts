import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import type { Size } from '../../analysis/geometry';
import { HIP_TRAIL_S, bones, drawnPaths, drawnSide, floorY, joints, liftRange, repStarts, startLineX } from '../analysis/tracker';
import { barSpeed } from '../analysis/speed';
import { dark, opacity, stroke } from '../../design/tokens';
import { t } from '../../i18n';

export type ShareSpeed = 4 | 2 | 1 | 0.5 | 0.25;
export const SHARE_SPEEDS: ShareSpeed[] = [1, 0.5, 0.25];
// 2x and 4x need TrackRenderer to keep every 2nd or 4th frame; a binary before that writes them at 1x, so they
// show only where ClipTranscoder says so (build 43 on).
export const FAST_SHARE_SPEEDS: ShareSpeed[] = [4, 2, 1, 0.5, 0.25];
export const shareSpeeds = (fast: boolean): ShareSpeed[] => (fast ? FAST_SHARE_SPEEDS : SHARE_SPEEDS);
// `whole` shares every frame of the clip; off, a lift that tracking marked is shared from its first frame to its last.
// `details` is given only on a binary that draws them (4.0.3 on): each rep's path over the whole set's, drawn faint,
// with the bar speed graph (`graph`) and the lifter's own line, its date and weight (`caption`), where asked for.
// `story` (a binary that draws it, 4.0.5 on): the 9:16 video for Stories, Reels and TikTok. `kicker` is the lifter's
// line (date, weight), `title` the end card's headline, `code` their invite code if they have one.
export type TrackShareOptions = { path: boolean; lines: boolean; body: boolean; watermark: boolean; speed: ShareSpeed; whole?: boolean; details?: { graph: boolean; caption: string | null }; story?: { kicker: string | null; title: string | null; code: string | null } };

// What modules/clip-transcoder TrackRenderer.swift draws on the lift's kept clip. Positions are 0..1 of the frame,
// sizes are output pixels; a layer that is off is empty (or null), so the native side only draws what it is given.
export type TrackSpec = {
  speed: ShareSpeed;
  // the frame of the share image
  frame: number;
  frameCount: number;
  // The frames the video holds, first and last inclusive, counted over the whole clip (0 and frameCount - 1 for all
  // of it). Binary 4.0.0 (build 41) does not read them and writes every frame.
  startFrame: number;
  endFrame: number;
  fps: number;
  // [frame, x, y] per traced point
  path: [number, number, number][];
  // a hanging movement's hip trail: only this many frames back are drawn (build 43 on; older binaries draw it all)
  trailFrames?: number;
  startX: number | null;
  floorY: number | null;
  // per frame: x1, y1, x2, y2 for every bone, and x, y for every joint
  bones: number[][];
  joints: number[][];
  watermark: string | null;
  // the logo lockup and the end card; a binary before 4.0.2 ignores it and draws `watermark`
  brand?: { wordmark: string; line: string; endLine: string; endS: number; top: number };
  // 4.0.3 on. ghost: the whole set's path as [x, y] polylines, drawn faint under the rep on screen. repStarts: the
  // frames each rep begins on. chart: bar speed, [frame, m/s]. caption: the lifter's line.
  ghost?: [number, number][][];
  repStarts?: number[];
  chart?: { values: [number, number][]; min: number; max: number; unit: string };
  caption?: string;
  // 4.0.5 on (StoryRenderer.swift): a 9:16 canvas, the lift's number counting up to its peak, the lift again at half
  // speed, and the bar path alone as the end card.
  story?: {
    width: number;
    height: number;
    focusX: number;
    hero?: { value: number; unit: string; label: string; kicker: string; peakFrame: number };
    replay?: { from: number; to: number; speed: number };
    end: { title: string; lines: string[]; s: number };
    mark: string;
    displayFonts: string[];
    bodyFonts: string[];
  };
  style: {
    flare: string;
    halo: string;
    bone: string;
    pathWidth: number;
    haloWidth: number;
    boneWidth: number;
    lineWidth: number;
    dash: [number, number];
    lineAlpha: number;
    dotRadius: number;
    dotStroke: number;
    jointRadius: number;
    jointStroke: number;
    markSize: number;
    markInset: number;
    markFonts: string[];
  };
};

// The tracker screen on a 390 x 844 pt phone shows the clip full width, or 60% of the screen tall if that is
// narrower. Output pixels per point of that box, so a 2.5 pt path is as heavy in the file as it is on screen.
const SCREEN = { width: 390, height: 844 };
export function pxPerPt(video: Size): number {
  return video.width / Math.min(SCREEN.width, Math.round((Math.round(SCREEN.height * 0.6) * video.width) / video.height));
}

// A bar path was drawn for this lift (the plate was followed); a hip trail or a body-only result is not one.
export function hasBarPath(analysis: Analysis): boolean {
  return analysis.traceKind === 'bar' && (analysis.reps[0]?.path.length ?? 0) > 0;
}

const px = (pt: number, unit: number) => Number((pt * unit).toFixed(2));
const r3 = (v: number) => Number(v.toFixed(3));

// The bar speed graph for the frames the video holds: nothing for a lift with no bar speed.
export function shareChart(analysis: Analysis, first: number, last: number): TrackSpec['chart'] | undefined {
  const speed = hasBarPath(analysis) ? barSpeed(analysis.reps[0].path, analysis.video.fps, analysis.lift) : null;
  if (!speed) return undefined;
  const values = [...speed.at].filter(([f]) => f >= first && f <= last).sort((a, b) => a[0] - b[0]).map(([f, v]): [number, number] => [f, r3(v)]);
  if (values.length < 2) return undefined;
  const vs = values.map(([, v]) => v);
  return { values, min: Math.min(0, ...vs), max: Math.max(0, ...vs), unit: 'm/s' };
}

// The mark says what made the video and where to get it (owner, 12-11): "Catchline · free on the App Store". Reels and
// TikTok cover the bottom ~20% (caption) and a right-hand column (buttons), so it sits a fifth of the height up and as
// far in from the right, never off the left edge (MARK_WIDTH: the longest translation at MARK_SIZE, measured).
const MARK_SIZE = 15;
const MARK_WIDTH = 180;
export function markLayout(video: Size): { size: number; inset: number; widthPt: number } {
  const unit = pxPerPt(video);
  const widthPt = video.width / unit;
  const heightPt = video.height / unit;
  return { size: MARK_SIZE, inset: Math.max(12, Math.min(Math.round(heightPt * 0.2), Math.round(widthPt - MARK_WIDTH - 12))), widthPt };
}

// The story: the peak of the bar speed is its number, and the second and a bit around the peak plays again at half
// speed (not when the lifter already slowed the whole video). A lift with no bar speed has no number and no replay.
const REPLAY_BEFORE_S = 1.2;
const REPLAY_AFTER_S = 0.8;
export function buildStory(analysis: Analysis, story: NonNullable<TrackShareOptions['story']>, first: number, last: number, speed: ShareSpeed): NonNullable<TrackSpec['story']> {
  const chart = shareChart(analysis, first, last);
  const peak = chart?.values.reduce((a, b) => (b[1] > a[1] ? b : a));
  const hero = peak && peak[1] > 0 ? { value: peak[1], unit: chart!.unit, label: t('share.story.peak'), kicker: story.kicker ?? '', peakFrame: peak[0] } : undefined;
  const fps = analysis.video.fps || 30;
  const xs = (analysis.reps[0]?.path ?? []).map((p) => p.x);
  const title = story.title ?? (hero ? `${hero.value.toFixed(2)} ${hero.unit}` : t('share.story.path'));
  return {
    width: 1080,
    height: 1920,
    focusX: xs.length ? r3((Math.min(...xs) + Math.max(...xs)) / 2) : 0.5,
    ...(hero ? { hero } : {}),
    ...(hero && speed === 1
      ? { replay: { from: Math.max(first, Math.round(hero.peakFrame - REPLAY_BEFORE_S * fps)), to: Math.min(last, Math.round(hero.peakFrame + REPLAY_AFTER_S * fps)), speed: 0.5 } }
      : {}),
    end: { title, lines: [t('share.story.by'), ...(story.code ? [t('share.story.code', { code: story.code })] : [])], s: 2 },
    mark: 'catchline',
    displayFonts: ['BigShouldersDisplay_700Bold', 'BigShouldersDisplay-Bold'],
    bodyFonts: ['SchibstedGrotesk_400Regular', 'SchibstedGrotesk-Regular'],
  };
}

// Where the clip sits on the 9:16 canvas, as StoryRenderer.swift storyPlacement places it (fractions of the canvas).
// A tall clip covers the canvas, centred on the bar path and lowered until the top of the path clears the apps'
// header; a wide one fits the width under the header.
export const STORY_ASPECT = 9 / 16;
export function storyPlacement(video: Size, focusX: number, pathTop: number | null): { x: number; y: number; width: number; height: number; wide: boolean } {
  const clip = video.width / video.height;
  const wide = clip > 0.8;
  // sizes as fractions of the canvas width and height
  const cover = Math.max(1, clip / STORY_ASPECT);
  const width = wide ? 1 : cover;
  const height = wide ? STORY_ASPECT / clip : (cover * STORY_ASPECT) / clip;
  const x = Math.min(0, Math.max(1 - width, 0.5 - focusX * width));
  let y = (1 - height) / 2;
  if (wide) y = 0.16;
  else {
    const top = pathTop ?? 0.5;
    if (top * height + y < 0.2) y = 0.2 - top * height;
    y = Math.min(0, Math.max(1 - height, y));
  }
  return { x: r3(x), y: r3(y), width: r3(width), height: r3(height), wide };
}

// The number on a frame: 0 at the lift's first frame, eased up to the peak (StoryRenderer.swift storyValue).
export function storyValue(hero: { value: number; peakFrame: number }, frame: number, first: number): number {
  if (hero.peakFrame <= first) return hero.value;
  const p = Math.min(1, Math.max(0, (frame - first) / (hero.peakFrame - first)));
  return hero.value * (1 - (1 - p) ** 3);
}

// The caption copied for the lifter to paste under their post: what the video shows, where it came from, their code.
export const SHARE_TAGS = '#catchline #barpath #weightlifting';
export function shareCaption(story: Pick<NonNullable<TrackSpec['story']>, 'hero' | 'end'> | null, code: string | null, link: string): string {
  const hero = story?.hero;
  const number = hero ? `${hero.value.toFixed(2)} ${hero.unit}` : null;
  // the end card's title is the weight when the lifter gave one; otherwise it repeats the number or says "Bar path"
  const weight = story && story.end.title !== number && story.end.title !== t('share.story.path') ? story.end.title : null;
  const stats = [weight, hero ? `${number} ${hero.label}` : null].filter(Boolean).join(' · ') || null;
  const from = code ? t('share.caption.code', { code, link }) : t('share.caption.plain', { link });
  return [stats, from, SHARE_TAGS].filter(Boolean).join('\n');
}

export function frameCountOf(analysis: Analysis, body: Body | null): number {
  return Math.max(analysis.video.frameCount, body?.frames.length ?? 0, 1);
}

export function buildTrackSpec(analysis: Analysis, body: Body | null, options: TrackShareOptions, frame?: number): TrackSpec {
  const rep = analysis.reps[0];
  const count = frameCountOf(analysis, body);
  const unit = pxPerPt(analysis.video);
  const mark = markLayout(analysis.video);
  const range = liftRange(analysis.lift, count, options.whole === true);
  const side = drawnSide(body, analysis.noCueReason?.offSideDeg);
  const drawBody = options.body && body !== null;
  const perFrame = <T,>(row: (f: number) => T[]): T[][] => (drawBody ? Array.from({ length: body.frames.length }, (_, f) => row(f)) : []);
  return {
    speed: options.speed,
    frame: Math.min(Math.max(range.first, Math.round(frame ?? range.first)), range.last),
    frameCount: count,
    startFrame: range.first,
    endFrame: range.last,
    fps: analysis.video.fps,
    path: options.path ? (rep?.path ?? []).map((p) => [p.frame, p.x, p.y]) : [],
    ...(analysis.traceKind === 'hip' ? { trailFrames: Math.round(HIP_TRAIL_S * analysis.video.fps) } : {}),
    startX: options.lines ? startLineX(rep) : null,
    floorY: options.lines ? floorY(body) : null,
    bones: perFrame((f) => bones(joints(body, f), side).flatMap(([a, b]) => [a.x, a.y, b.x, b.y])),
    joints: perFrame((f) =>
      joints(body, f).flatMap((p, i) => (p && (side === 'both' || i % 2 === side) ? [p.x, p.y] : [])),
    ),
    watermark: options.watermark ? t('share.mark') : null,
    ...(options.watermark ? { brand: { wordmark: 'Catchline', line: t('share.brandLine'), endLine: t('share.endLine'), endS: 1.5, top: 0.12 } } : {}),
    ...(options.details && options.path && hasBarPath(analysis)
      ? { ghost: drawnPaths(analysis, range.last).whole.map((seg) => seg.map((p): [number, number] => [p.x, p.y])), repStarts: repStarts(rep.path, analysis.video.fps || 30) }
      : {}),
    ...(options.details?.graph ? (() => { const chart = shareChart(analysis, range.first, range.last); return chart ? { chart } : {}; })() : {}),
    ...(options.details?.caption ? { caption: options.details.caption } : {}),
    ...(options.story ? { story: buildStory(analysis, options.story, range.first, range.last, options.speed) } : {}),
    style: {
      flare: dark.flare,
      halo: dark.halo,
      bone: dark.text,
      pathWidth: px(stroke.path, unit),
      haloWidth: px(stroke.halo, unit),
      boneWidth: px(stroke.outline, unit),
      lineWidth: px(stroke.hairline, unit),
      dash: [px(2, unit), px(5, unit)],
      lineAlpha: opacity.lines,
      dotRadius: px(4.5, unit),
      dotStroke: px(1.5, unit),
      jointRadius: px(3, unit),
      jointStroke: px(1, unit),
      markSize: px(mark.size, unit),
      markInset: px(mark.inset, unit),
      markFonts: ['BigShouldersDisplay_700Bold', 'BigShouldersDisplay-Bold'],
    },
  };
}

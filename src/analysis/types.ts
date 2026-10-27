export type Movement =
  | 'snatch'
  | 'clean'
  | 'jerk'
  | 'kipping_pull_up'
  | 'bar_muscle_up'
  | 'kipping_hspu';

export type PhaseName =
  | 'setup'
  | 'first_pull'
  | 'transition'
  | 'second_pull'
  | 'turnover'
  | 'catch'
  | 'recovery'
  | 'hang'
  | 'arch'
  | 'hollow'
  | 'hip_drive'
  | 'support'
  | 'lockout'
  | 'tuck'
  | 'drive'
  | 'press'
  | 'peak';

export type Confidence = 'clear' | 'worth_checking' | 'low';

export type Point = { x: number; y: number };

export type TracePoint = Point & { frame: number };

export type Phase = {
  name: PhaseName;
  startFrame: number;
  endFrame: number;
};

export type KeyFrame = {
  phase: PhaseName;
  frame: number;
  image?: string;
};

export type Measurement = {
  id: string;
  label: string;
  value: number;
  unit: 'cm' | 's' | 'deg' | 'm/s' | '%';
  best?: number;
  frame: number;
  status: 'cue' | 'follows' | 'normal' | 'not_seen' | 'best';
  note: string;
};

// Coaching reference lines for a barbell rep, normalised to the frame: the vertical through the bar at lift-off, the
// knee at lift-off, the hip at hip contact and the bar at its highest, and the bar where it was furthest forward.
// A path-only rep (no phases) carries the start line and the ring alone.
export type RepGuides = { startX: number; kneeY?: number; hipY?: number; peakY?: number; ring: TracePoint };

// The joint tracks beside the bar path, in the same frame as `path`: per frame the mid-point of the pair (mid-ankle,
// mid-hip, ...). A frame where the pose has no such joint is left out, never filled in. Absent before 3.1.1.
export type TrackName = 'feet' | 'hips' | 'shoulders' | 'knees' | 'elbows';
export type RepTracks = Partial<Record<TrackName, TracePoint[]>>;

export type Rep = {
  index: number;
  startFrame: number;
  endFrame: number;
  made: boolean;
  phases: Phase[];
  keyFrames: KeyFrame[];
  path: TracePoint[];
  guides?: RepGuides;
  tracks?: RepTracks;
};

export type Cue = {
  faultId: string;
  text: string;
  why: string;
  confidence: Confidence;
  confidenceText: string;
  evidence: {
    rep: number;
    frame: number;
    from: Point;
    to: Point;
    value: number;
    unit: 'cm' | 's' | 'deg';
    caption: string;
  };
};

// Another fault that fired, ranked under the headline cue (most important first, at most 3).
export type Note = {
  faultId: string;
  text: string;
  why: string;
  severity: number;
  reps: number;
};

export type Failure = {
  reason:
    | 'bar_out_of_frame'
    | 'not_side_on'
    | 'too_dark'
    | 'too_far'
    | 'too_shaky'
    | 'multiple_lifters'
    | 'clip_cut_off'
    | 'unsupported_movement'
    | 'low_frame_rate'
    | 'clip_unreadable'
    | 'unknown';
  frame?: number;
  message: string;
  // The specific refusal behind the reason (e.g. 'no_reps', 'movement_mismatch'), logged for the refusal rate; never shown.
  code?: string;
};

// Why a measured lift has no cue: the path and phases are real, the cue was held back (a partial result).
// 'path_only' (3.1.1): no phases either; the bar, feet and hips were tracked over the whole clip after `gate` failed.
export type NoCueCode = 'off_side_on' | 'plate_hidden' | 'rep_cut_off' | 'unclear_miss' | 'low_confidence' | 'bar_lost' | 'path_only';
export type PathOnlyGate = 'no_reps' | 'no_plate' | 'no_body_scale' | 'not_side_on' | 'shoulders_cut_off';
export type NoCueReason = { code: NoCueCode; offSideDeg?: number; gate?: PathOnlyGate };

// What the pose alone says the clip shows; 'unknown' when the signal is weak.
export type DetectedMovement = { movement: Movement | 'unknown'; confidence: number };

export type Analysis = {
  version: 1;
  id: string;
  // The movement the lifter chose. The rule set actually run is movementUsed (same when absent).
  movement: Movement;
  movementUsed?: Movement;
  detectedMovement?: DetectedMovement;
  loadKg?: number;
  video: {
    uri: string;
    width: number;
    height: number;
    fps: number;
    frameCount: number;
  };
  traceKind: 'bar' | 'hip';
  pxPerCm?: number;
  reps: Rep[];
  bestRepIndex: number;
  cue: Cue | null;
  // Set only on a partial (failure null, cue null). Absent or null with cue null: nothing needed fixing.
  noCueReason?: NoCueReason | null;
  // Absent on analyses made before sub-notes shipped.
  notes?: Note[];
  measurements: Measurement[];
  // The ids of the measurements confident enough to show as the result's key numbers (3.1 on-device; absent before).
  keyNumbers?: string[];
  failure: Failure | null;
  // The CV rule set that measured this lift ("cv-2026.10.16") and the worker revision it ran on.
  // Absent on analyses made before versions were stamped.
  analysisVersion?: string;
  analysisRevision?: string;
  // Set when the lift was re-analysed from its stored trace with a newer analysis (ISO time, server-stamped).
  reanalysedAt?: string;
  // 3.1 on-device: where the lift started and how far off side-on it was filmed (synced as start_class / yaw_bucket).
  startClass?: 'floor' | 'hang' | 'blocks' | 'shoulders';
  yawBucket?: 'side' | '20-45' | '45-60' | 'past_60';
  // A clean followed by its jerk: one lift, the cue from one segment, each segment measured on its own.
  liftKind?: 'clean_and_jerk';
  segments?: AnalysisSegment[];
};

export type AnalysisSegment = Pick<Analysis, 'reps' | 'bestRepIndex' | 'cue' | 'noCueReason' | 'notes' | 'measurements' | 'keyNumbers' | 'pxPerCm'> & {
  kind: 'clean' | 'jerk';
};

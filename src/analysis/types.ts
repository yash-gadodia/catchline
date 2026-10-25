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
  | 'press';

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

export type Rep = {
  index: number;
  startFrame: number;
  endFrame: number;
  made: boolean;
  phases: Phase[];
  keyFrames: KeyFrame[];
  path: TracePoint[];
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
export type NoCueCode = 'off_side_on' | 'plate_hidden' | 'rep_cut_off' | 'unclear_miss' | 'low_confidence' | 'bar_lost';
export type NoCueReason = { code: NoCueCode; offSideDeg?: number };

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

export type AnalysisSegment = Pick<Analysis, 'reps' | 'bestRepIndex' | 'cue' | 'noCueReason' | 'notes' | 'measurements' | 'pxPerCm'> & {
  kind: 'clean' | 'jerk';
};

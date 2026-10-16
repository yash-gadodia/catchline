import type { ImageSourcePropType } from 'react-native';

// v1 "video" is the keyframe image sequence. `asset:` ids resolve to bundled
// frames; anything else is treated as a uri (e.g. frames the CV pipeline wrote).
const BUNDLED: Record<string, { color: ImageSourcePropType; gray: ImageSourcePropType }> = {
  'snatch/1-setup': {
    color: require('../../assets/frames/snatch/1-setup.jpg'),
    gray: require('../../assets/frames/snatch/gray/1-setup.jpg'),
  },
  'snatch/2-knee': {
    color: require('../../assets/frames/snatch/2-knee.jpg'),
    gray: require('../../assets/frames/snatch/gray/2-knee.jpg'),
  },
  'snatch/3-hip': {
    color: require('../../assets/frames/snatch/3-hip.jpg'),
    gray: require('../../assets/frames/snatch/gray/3-hip.jpg'),
  },
  'snatch/4-extension': {
    color: require('../../assets/frames/snatch/4-extension.jpg'),
    gray: require('../../assets/frames/snatch/gray/4-extension.jpg'),
  },
  'snatch/5-turnover': {
    color: require('../../assets/frames/snatch/5-turnover.jpg'),
    gray: require('../../assets/frames/snatch/gray/5-turnover.jpg'),
  },
  'snatch/6-catch': {
    color: require('../../assets/frames/snatch/6-catch.jpg'),
    gray: require('../../assets/frames/snatch/gray/6-catch.jpg'),
  },
  'snatch/7-recovery': {
    color: require('../../assets/frames/snatch/7-recovery.jpg'),
    gray: require('../../assets/frames/snatch/gray/7-recovery.jpg'),
  },
  'snatch-real/r1-1-setup': {
    color: require('../../assets/analysis/snatch-real/r1-1-setup.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r1-1-setup.jpg'),
  },
  'snatch-real/r1-2-first_pull': {
    color: require('../../assets/analysis/snatch-real/r1-2-first_pull.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r1-2-first_pull.jpg'),
  },
  'snatch-real/r1-3-transition': {
    color: require('../../assets/analysis/snatch-real/r1-3-transition.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r1-3-transition.jpg'),
  },
  'snatch-real/r1-4-second_pull': {
    color: require('../../assets/analysis/snatch-real/r1-4-second_pull.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r1-4-second_pull.jpg'),
  },
  'snatch-real/r1-5-turnover': {
    color: require('../../assets/analysis/snatch-real/r1-5-turnover.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r1-5-turnover.jpg'),
  },
  'snatch-real/r1-6-catch': {
    color: require('../../assets/analysis/snatch-real/r1-6-catch.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r1-6-catch.jpg'),
  },
  'snatch-real/r1-7-recovery': {
    color: require('../../assets/analysis/snatch-real/r1-7-recovery.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r1-7-recovery.jpg'),
  },
  'snatch-real/r2-1-setup': {
    color: require('../../assets/analysis/snatch-real/r2-1-setup.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r2-1-setup.jpg'),
  },
  'snatch-real/r2-2-first_pull': {
    color: require('../../assets/analysis/snatch-real/r2-2-first_pull.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r2-2-first_pull.jpg'),
  },
  'snatch-real/r2-3-transition': {
    color: require('../../assets/analysis/snatch-real/r2-3-transition.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r2-3-transition.jpg'),
  },
  'snatch-real/r2-4-second_pull': {
    color: require('../../assets/analysis/snatch-real/r2-4-second_pull.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r2-4-second_pull.jpg'),
  },
  'snatch-real/r2-5-turnover': {
    color: require('../../assets/analysis/snatch-real/r2-5-turnover.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r2-5-turnover.jpg'),
  },
  'snatch-real/r2-6-catch': {
    color: require('../../assets/analysis/snatch-real/r2-6-catch.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r2-6-catch.jpg'),
  },
  'snatch-real/r2-7-recovery': {
    color: require('../../assets/analysis/snatch-real/r2-7-recovery.jpg'),
    gray: require('../../assets/analysis/snatch-real/gray/r2-7-recovery.jpg'),
  },
  'snatch-sideon/r1-1-setup': {
    color: require('../../assets/analysis/snatch-sideon/r1-1-setup.jpg'),
    gray: require('../../assets/analysis/snatch-sideon/gray/r1-1-setup.jpg'),
  },
  'snatch-sideon/r1-2-first_pull': {
    color: require('../../assets/analysis/snatch-sideon/r1-2-first_pull.jpg'),
    gray: require('../../assets/analysis/snatch-sideon/gray/r1-2-first_pull.jpg'),
  },
  'snatch-sideon/r1-3-transition': {
    color: require('../../assets/analysis/snatch-sideon/r1-3-transition.jpg'),
    gray: require('../../assets/analysis/snatch-sideon/gray/r1-3-transition.jpg'),
  },
  'snatch-sideon/r1-4-second_pull': {
    color: require('../../assets/analysis/snatch-sideon/r1-4-second_pull.jpg'),
    gray: require('../../assets/analysis/snatch-sideon/gray/r1-4-second_pull.jpg'),
  },
  'snatch-sideon/r1-5-turnover': {
    color: require('../../assets/analysis/snatch-sideon/r1-5-turnover.jpg'),
    gray: require('../../assets/analysis/snatch-sideon/gray/r1-5-turnover.jpg'),
  },
  'snatch-sideon/r1-6-catch': {
    color: require('../../assets/analysis/snatch-sideon/r1-6-catch.jpg'),
    gray: require('../../assets/analysis/snatch-sideon/gray/r1-6-catch.jpg'),
  },
  'snatch-sideon/r1-7-recovery': {
    color: require('../../assets/analysis/snatch-sideon/r1-7-recovery.jpg'),
    gray: require('../../assets/analysis/snatch-sideon/gray/r1-7-recovery.jpg'),
  },
  'demo-best/r1-1-setup': {
    color: require('../../assets/demo/r1-1-setup.jpg'),
    gray: require('../../assets/demo/gray/r1-1-setup.jpg'),
  },
  'demo-best/r1-2-first_pull': {
    color: require('../../assets/demo/r1-2-first_pull.jpg'),
    gray: require('../../assets/demo/gray/r1-2-first_pull.jpg'),
  },
  'demo-best/r1-3-transition': {
    color: require('../../assets/demo/r1-3-transition.jpg'),
    gray: require('../../assets/demo/gray/r1-3-transition.jpg'),
  },
  'demo-best/r1-4-second_pull': {
    color: require('../../assets/demo/r1-4-second_pull.jpg'),
    gray: require('../../assets/demo/gray/r1-4-second_pull.jpg'),
  },
  'demo-best/r1-5-turnover': {
    color: require('../../assets/demo/r1-5-turnover.jpg'),
    gray: require('../../assets/demo/gray/r1-5-turnover.jpg'),
  },
  'demo-best/r1-6-catch': {
    color: require('../../assets/demo/r1-6-catch.jpg'),
    gray: require('../../assets/demo/gray/r1-6-catch.jpg'),
  },
  'demo-best/r1-7-recovery': {
    color: require('../../assets/demo/r1-7-recovery.jpg'),
    gray: require('../../assets/demo/gray/r1-7-recovery.jpg'),
  },
};

export function frameSource(image: string | undefined, gray = false): ImageSourcePropType | null {
  if (!image) return null;
  if (image.startsWith('asset:')) {
    const entry = BUNDLED[image.slice('asset:'.length)];
    if (!entry) return null;
    return gray ? entry.gray : entry.color;
  }
  return { uri: image };
}

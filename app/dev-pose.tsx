import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PoseCoreML from '../modules/pose-coreml';
import { colors, space } from '../src/design/tokens';
import { type } from '../src/design/typography';
import { poseJson } from '../src/data/onDevicePose';
import { discardPrepared, prepareClip } from '../src/data/prepare';
import Transcoder from '../modules/clip-transcoder';

// Dev only: prepare a clip exactly like the upload does, then time on-device pose on it.
// Open with catchline://dev-pose?uri=file:///... or pick a video.
async function measure(uri: string, log: (line: string) => void) {
  if (!PoseCoreML) return log('PoseCoreML native module missing (Android or stale dev client)');
  const src = await Transcoder.probe(uri);
  const t0 = Date.now();
  const clip = await prepareClip(uri, { start: 0, end: src.durationS }, () => undefined);
  const t1 = Date.now();
  try {
    const res = await PoseCoreML.analyzePose(clip.uri);
    const t2 = Date.now();
    const seen = res.frames.filter((f) => f.lifter !== undefined).length;
    const json = poseJson(res);
    const fps = res.frames.length / ((t2 - t1) / 1000);
    log(`prepared ${clip.width}x${clip.height} ${clip.frames} frames in ${((t1 - t0) / 1000).toFixed(2)} s`);
    log(`pose ${res.frames.length} frames (lifter in ${seen}) in ${((t2 - t1) / 1000).toFixed(2)} s = ${fps.toFixed(1)} fps`);
    log(`upload ${(json.length / 1024).toFixed(0)} KB`);
  } finally {
    discardPrepared(clip.uri);
  }
}

export default function DevPose() {
  const insets = useSafeAreaInsets();
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const [lines, setLines] = useState<string[]>([]);
  const log = (line: string) => {
    console.log(`[dev-pose] ${line}`);
    setLines((l) => [...l, line]);
  };
  const run = (u: string) => measure(u, log).catch((e: unknown) => log(`error: ${String(e)}`));

  useEffect(() => {
    if (__DEV__ && uri) run(uri);
  }, [uri]);

  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + space.s5, paddingHorizontal: space.gutter }}>
      <Pressable
        onPress={async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
          if (!r.canceled && r.assets[0]) run(r.assets[0].uri);
        }}
        style={{ paddingVertical: space.s4 }}
      >
        <Text style={[type.body, { color: colors.text }]}>Pick a video</Text>
      </Pressable>
      {lines.map((l, i) => (
        <Text key={i} style={[type.readout, { color: colors.text }]}>
          {l}
        </Text>
      ))}
    </ScrollView>
  );
}

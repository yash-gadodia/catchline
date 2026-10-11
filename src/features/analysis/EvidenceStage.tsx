import { View } from 'react-native';
import type { Analysis, Cue } from '../../analysis/types';
import { focusOn, toScreen, type Size } from '../../analysis/geometry';
import { keyFrameAt, pathUpTo, repByIndex } from '../../analysis/timeline';
import { evidenceReadout, heroValue } from '../../analysis/format';
import Readout from '../../components/Readout';
import Stage from './Stage';
import { DimensionLine, FlarePath, HeroNumber, OverlaySvg, RefLine } from './overlays';

export default function EvidenceStage({
  analysis,
  cue,
  box,
  zoom = 1.25,
  showPath = false,
  heroSize = 48,
  readoutTop = false,
}: {
  analysis: Analysis;
  cue: Cue;
  box: Size;
  zoom?: number;
  showPath?: boolean;
  heroSize?: number;
  readoutTop?: boolean;
}) {
  const rep = repByIndex(analysis, cue.evidence.rep);
  const key = keyFrameAt(rep, cue.evidence.frame);
  const src = { width: analysis.video.width, height: analysis.video.height };
  const focus = focusOn(cue.evidence.to, src, box);
  return (
    <View>
      <Stage
        testID="evidence-stage"
        src={src}
        box={box}
        focus={focus}
        zoom={zoom}
        zoomOrigin={cue.evidence.to}
        layers={[{ image: key.image }]}
      >
        {(fit) => {
          const from = toScreen(cue.evidence.from, fit);
          const to = toScreen(cue.evidence.to, fit);
          const path = pathUpTo(rep.path, cue.evidence.frame).map((p) => toScreen(p, fit));
          return (
            <>
              <OverlaySvg box={box}>
                <RefLine x={from.x} top={box.height * 0.04} bottom={box.height * 0.94} />
                {showPath ? <FlarePath points={path} /> : null}
                <DimensionLine from={from} to={to} testID="dimension-line" />
              </OverlaySvg>
              <HeroNumber text={heroValue(cue)} at={{ x: Math.min(from.x, to.x) + 14, y: to.y }} size={heroSize} box={box} />
            </>
          );
        }}
      </Stage>
      <Readout style={[{ position: 'absolute', left: 24 }, readoutTop ? { top: 16 } : { bottom: 16 }]} testID="evidence-readout">
        {evidenceReadout(cue)}
      </Readout>
    </View>
  );
}

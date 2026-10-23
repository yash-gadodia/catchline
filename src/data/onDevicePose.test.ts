import { poseJson } from './onDevicePose';

describe('poseJson', () => {
  it('tags the native result with its source, nothing else changed', () => {
    expect(poseJson({ fps: 60, width: 720, height: 1280, frames: [{ t: 0, people: [] }] })).toBe(
      '{"source":"rtmpose-coreml","fps":60,"width":720,"height":1280,"frames":[{"t":0,"people":[]}]}'
    );
  });
});

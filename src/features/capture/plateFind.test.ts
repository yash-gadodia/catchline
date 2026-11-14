import PoseCoreML from '../../../modules/pose-coreml';
import { findPlate, findPlateSupported } from './plateFind';

type Native = { supportsFindPlate?: boolean; findPlate?: jest.Mock };
const native = PoseCoreML as unknown as Native;
const nativeFind = native.findPlate as jest.Mock;

afterEach(() => {
  native.supportsFindPlate = true;
  native.findPlate = nativeFind;
  nativeFind.mockReset();
});

describe('findPlateSupported', () => {
  it('is true on a binary that says it has findPlate', () => {
    expect(findPlateSupported()).toBe(true);
  });
  it('is false on a binary without the constant or without the function', () => {
    native.supportsFindPlate = undefined;
    expect(findPlateSupported()).toBe(false);
    native.supportsFindPlate = true;
    native.findPlate = undefined;
    expect(findPlateSupported()).toBe(false);
  });
});

describe('findPlate', () => {
  it('asks native for the frame at that time and returns the plate as a mark, without the confidence', async () => {
    nativeFind.mockResolvedValue({ x: 0.51641234, y: 0.79938, r: 0.14424, confidence: 0.8993 });
    await expect(findPlate('file:///clips/a.mp4', 1.5)).resolves.toEqual({ x: 0.5164, y: 0.7994, r: 0.1442 });
    expect(nativeFind).toHaveBeenCalledWith('file:///clips/a.mp4', 1.5);
  });
  it('is null when native finds no plate', async () => {
    nativeFind.mockResolvedValue(null);
    await expect(findPlate('file:///clips/a.mp4', 0)).resolves.toBeNull();
  });
  it('is null when the native call fails', async () => {
    nativeFind.mockRejectedValue(new Error('Could not look for the plate: clip_unreadable'));
    await expect(findPlate('file:///clips/a.mp4', 0)).resolves.toBeNull();
  });
  it('is null for a plate too small to mark or with a broken number', async () => {
    nativeFind.mockResolvedValue({ x: 0.5, y: 0.5, r: 0.01, confidence: 0.9 });
    await expect(findPlate('file:///clips/a.mp4', 0)).resolves.toBeNull();
    nativeFind.mockResolvedValue({ x: Number.NaN, y: 0.5, r: 0.1, confidence: 0.9 });
    await expect(findPlate('file:///clips/a.mp4', 0)).resolves.toBeNull();
  });
  it('is null without calling native on an older binary', async () => {
    native.supportsFindPlate = undefined;
    await expect(findPlate('file:///clips/a.mp4', 0)).resolves.toBeNull();
    expect(nativeFind).not.toHaveBeenCalled();
  });
});

import { discardPickedCopy, sweepClipCache } from './clipCache';

const mockExisting = new Set<string>();
const mockDeleted: string[] = [];

jest.mock('expo-file-system', () => {
  const join = (parent: { uri: string } | string, names: string[]) =>
    names.reduce((base, name) => `${base.endsWith('/') ? base : `${base}/`}${name}`, typeof parent === 'string' ? parent : parent.uri);
  class Node {
    uri: string;
    constructor(parent: { uri: string } | string, ...names: string[]) {
      this.uri = join(parent, names);
    }
    get exists() {
      return mockExisting.has(this.uri);
    }
    delete() {
      mockExisting.delete(this.uri);
      mockDeleted.push(this.uri);
    }
  }
  class Directory extends Node {
    constructor(parent: { uri: string } | string, ...names: string[]) {
      super(parent, ...names);
      this.uri = `${this.uri.replace(/\/$/, '')}/`;
    }
  }
  const container = new Directory('file:///app');
  return {
    File: Node,
    Directory,
    Paths: { cache: new Directory('file:///app/Library/Caches'), document: Object.assign(new Directory('file:///app/Documents'), { parentDirectory: container }) },
  };
});

beforeEach(() => {
  mockExisting.clear();
  mockDeleted.length = 0;
});

describe('discardPickedCopy', () => {
  it('deletes the photo picker copy of a picked video', () => {
    mockExisting.add('file:///app/Library/Caches/ImagePicker/A1.mov');
    discardPickedCopy('file:///app/Library/Caches/ImagePicker/A1.mov');
    expect(mockDeleted).toEqual(['file:///app/Library/Caches/ImagePicker/A1.mov']);
  });

  it('never touches a file outside the picker cache (a camera original, a kept clip)', () => {
    mockExisting.add('file:///app/tmp/lift-camera/B2.mov');
    mockExisting.add('file:///app/Documents/lifts/l1/clip.mp4');
    discardPickedCopy('file:///app/tmp/lift-camera/B2.mov');
    discardPickedCopy('file:///app/Documents/lifts/l1/clip.mp4');
    expect(mockDeleted).toEqual([]);
  });
});

describe('sweepClipCache', () => {
  it('empties the picker cache and the temporary prepare, tracking and render folders', () => {
    for (const d of ['Library/Caches/ImagePicker/', 'tmp/clip-transcoder/', 'tmp/catchline-analysis/', 'tmp/share-video/', 'tmp/lift-camera/']) mockExisting.add(`file:///app/${d}`);
    sweepClipCache();
    expect(mockDeleted).toEqual([
      'file:///app/Library/Caches/ImagePicker/',
      'file:///app/tmp/clip-transcoder/',
      'file:///app/tmp/catchline-analysis/',
      'file:///app/tmp/share-video/',
    ]);
  });

  it('also takes the camera originals when the account goes', () => {
    mockExisting.add('file:///app/tmp/lift-camera/');
    sweepClipCache({ cameraOriginals: true });
    expect(mockDeleted).toEqual(['file:///app/tmp/lift-camera/']);
  });
});

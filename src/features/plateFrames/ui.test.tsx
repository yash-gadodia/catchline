import { act, fireEvent, render } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { snatchMock } from '../../analysis/fixtures';
import TrackerScreen from '../analysis/TrackerScreen';
import { usePlateFramesConsent } from './consent';
import CorrectScreen from './CorrectScreen';
import PlateFramesAsk, { ASK_DELAY_MS } from './PlateFramesAsk';
import { usePlateFramesSettings } from './settings';

const mockSupported = { cropFrames: jest.fn() as jest.Mock | undefined };
jest.mock('../../../modules/clip-transcoder', () => ({
  __esModule: true,
  default: {
    get cropFrames() {
      return mockSupported.cropFrames;
    },
  },
}));
jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../lib/api', () => ({
  ensureSession: jest.fn(async () => 'u1'),
  recordConsent: jest.fn(async () => undefined),
  deleteMyPlateFrames: jest.fn(async () => 3),
}));
const mockSendLift = jest.fn(async (_id: string) => 0);
const mockSendCorrection = jest.fn(async (_id: string, _frame: number, _mark: unknown) => 0);
jest.mock('./send', () => ({ sendLiftFrames: (id: string) => mockSendLift(id), sendCorrection: (id: string, frame: number, mark: unknown) => mockSendCorrection(id, frame, mark) }));
const mockAddCorrection = jest.fn(async (_id: string, _frame: number, _mark: unknown) => ({ mark: null, corrections: [] }));
jest.mock('./local', () => ({ addLocalCorrection: (id: string, frame: number, mark: unknown) => mockAddCorrection(id, frame, mark) }));
const mockClear = jest.fn();
jest.mock('./outbox', () => ({ clearPlateFrameOutbox: () => mockClear() }));

const api = jest.requireMock('../../lib/api') as { recordConsent: jest.Mock; deleteMyPlateFrames: jest.Mock };
const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
// A PanResponder reads the drag from the touch history, as the native side reports it.
const touch = (t: number, x: number, y: number, from: [number, number] = [x, y]) => ({
  nativeEvent: { locationX: x, locationY: y },
  touchHistory: {
    touchBank: [{ touchActive: true, startPageX: from[0], startPageY: from[1], startTimeStamp: 0, currentPageX: x, currentPageY: y, currentTimeStamp: t, previousPageX: from[0], previousPageY: from[1], previousTimeStamp: t - 1 }],
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: t,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSupported.cropFrames = jest.fn();
  usePlateFramesConsent.setState({ choice: null, asked: false });
});

describe('CorrectScreen', () => {
  const video = { width: 1080, height: 1920, fps: 60, frameCount: 120 };

  it('keeps the correction on the phone and offers it for sending, on the frame the lifter was on', async () => {
    const onDone = jest.fn();
    const view = await render(<CorrectScreen liftId="lift-1" clipUri="file:///clip.mp4" frame={37} video={video} onDone={onDone} />);
    expect(view.getByTestId('correct-where')).toHaveTextContent('Saved on this phone only.');
    expect(view.getByTestId('correct-save')).toBeDisabled();
    const stage = view.getByTestId('correct-stage');
    // the stage is 58% of a 1334 pt screen (774 pt), the 9:16 frame 435 pt wide in the middle of 750
    await fireEvent(stage, 'responderGrant', touch(1, 375, 387));
    await fireEvent(stage, 'responderMove', touch(2, 375, 464.4, [375, 387]));
    await fireEvent(stage, 'responderRelease', touch(3, 375, 464.4));
    await press(view.getByTestId('correct-save'));
    expect(mockAddCorrection).toHaveBeenCalledTimes(1);
    const [id, frame, mark] = mockAddCorrection.mock.calls[0] as [string, number, { x: number; y: number; r: number }];
    expect([id, frame]).toEqual(['lift-1', 37]);
    expect(mark).toEqual({ x: 0.5, y: 0.5, r: 0.1 });
    expect(mockSendCorrection).toHaveBeenCalledWith('lift-1', 37, mark);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('says a crop is sent once the lifter has opted in', async () => {
    usePlateFramesConsent.setState({ asked: true, choice: { granted: true, version: 1, at: '2026-11-11T10:00:00.000Z', synced: true } });
    const view = await render(<CorrectScreen liftId="lift-1" clipUri="file:///clip.mp4" frame={3} video={video} onDone={jest.fn()} />);
    expect(view.getByTestId('correct-where')).toHaveTextContent('A crop of this frame is sent to help the plate finder. Not your video.');
  });
});

describe('the tracker', () => {
  it('offers "The path is wrong" with the frame the lifter is on', async () => {
    const onPathWrong = jest.fn();
    const view = await render(<TrackerScreen analysis={snatchMock} clipUri="file:///clip.mp4" body={null} title="Lift" onBack={jest.fn()} onPathWrong={onPathWrong} />);
    expect(view.getByTestId('tracker-path-wrong')).toHaveTextContent('The path is wrong');
    await press(view.getByTestId('tracker-path-wrong'));
    expect(onPathWrong).toHaveBeenCalledWith(0);
  });

  it('shows no such action unless the screen is given one', async () => {
    const view = await render(<TrackerScreen analysis={snatchMock} clipUri="file:///clip.mp4" body={null} title="Lift" onBack={jest.fn()} />);
    expect(view.queryByTestId('tracker-path-wrong')).toBeNull();
  });
});

describe('the You tab rows', () => {
  function Rows() {
    const s = usePlateFramesSettings();
    return (
      <View>
        <Text testID="state">{JSON.stringify({ supported: s.supported, on: s.on, canDelete: s.canDelete, note: s.note })}</Text>
        <Text testID="on" onPress={() => s.toggle(true)}>on</Text>
        <Text testID="off" onPress={() => s.toggle(false)}>off</Text>
        <Text testID="delete" onPress={() => void s.deleteSent()}>delete</Text>
      </View>
    );
  }

  it('is off by default, with nothing to delete', async () => {
    const view = await render(<Rows />);
    expect(view.getByTestId('state')).toHaveTextContent('{"supported":true,"on":false,"canDelete":false,"note":null}');
  });

  it('turning it off stops future sends, empties what was waiting and tells the server', async () => {
    const view = await render(<Rows />);
    await press(view.getByTestId('on'));
    expect(view.getByTestId('state')).toHaveTextContent('{"supported":true,"on":true,"canDelete":true,"note":null}');
    await press(view.getByTestId('off'));
    expect(view.getByTestId('state')).toHaveTextContent('{"supported":true,"on":false,"canDelete":true,"note":null}');
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(api.recordConsent.mock.calls).toEqual([
      ['plate_frames', '1', true],
      ['plate_frames', '1', false],
    ]);
  });

  it('"Delete the frames I sent" calls the server and says so, or says it could not', async () => {
    usePlateFramesConsent.setState({ asked: true, choice: { granted: false, version: 1, at: '2026-11-11T10:00:00.000Z', synced: true } });
    const view = await render(<Rows />);
    await press(view.getByTestId('delete'));
    expect(api.deleteMyPlateFrames).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('state')).toHaveTextContent(/"note":"deleted"/);
    api.deleteMyPlateFrames.mockRejectedValueOnce(new Error('offline'));
    await press(view.getByTestId('delete'));
    expect(view.getByTestId('state')).toHaveTextContent(/"note":"failed"/);
  });
});

describe('PlateFramesAsk', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const open = async () => {
    const view = await render(<PlateFramesAsk liftId="lift-1" />);
    expect(view.queryByTestId('plates-ask')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(ASK_DELAY_MS);
    });
    return view;
  };

  it('says plainly what is sent, that it is not the video, and that a crop can show a person', async () => {
    const view = await open();
    expect(view.getByTestId('plates-ask-body')).toHaveTextContent('Send the frames you mark: small square pictures cut around the plate, with your circle. Not your video.');
    expect(view.getByTestId('plates-ask-detail')).toHaveTextContent(/A crop can show part of you or someone nearby\./);
    expect(view.getByTestId('plates-ask-detail')).toHaveTextContent(/keep them for up to 24 months/);
  });

  it('a yes records the consent and sends this lift', async () => {
    const view = await open();
    await press(view.getByTestId('plates-ask-yes'));
    expect(usePlateFramesConsent.getState().choice?.granted).toBe(true);
    expect(api.recordConsent).toHaveBeenCalledWith('plate_frames', '1', true);
    expect(mockSendLift).toHaveBeenCalledWith('lift-1');
    expect(view.queryByTestId('plates-ask')).toBeNull();
  });

  it('a no records the refusal, sends nothing and is never asked again', async () => {
    const view = await open();
    await press(view.getByTestId('plates-ask-no'));
    expect(usePlateFramesConsent.getState()).toMatchObject({ asked: true, choice: { granted: false } });
    expect(api.recordConsent).toHaveBeenCalledWith('plate_frames', '1', false);
    expect(mockSendLift).not.toHaveBeenCalled();
    view.unmount();
    const again = await render(<PlateFramesAsk liftId="lift-2" />);
    await act(async () => {
      jest.advanceTimersByTime(ASK_DELAY_MS);
    });
    expect(again.queryByTestId('plates-ask')).toBeNull();
  });

  it('is not asked on a build that cannot cut the crops', async () => {
    mockSupported.cropFrames = undefined;
    const view = await render(<PlateFramesAsk liftId="lift-1" />);
    await act(async () => {
      jest.advanceTimersByTime(ASK_DELAY_MS);
    });
    expect(view.queryByTestId('plates-ask')).toBeNull();
  });
});

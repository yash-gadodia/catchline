import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Clipboard from 'expo-clipboard';
import { snatchMock, snatchReal } from '../../analysis/fixtures';
import ShareScreen from './ShareScreen';
import ShareCard from './ShareCard';
import SendToCoachSheet, { coachMessage } from './SendToCoachSheet';
import FromCoachCard, { overrideDateLabel } from './FromCoachCard';
import { createLocalCoachRepository, useCoachStore } from './coachRepository';
import { overlayVideoRenderer, renderStill, saveImage } from './exporter';
import {
  DEFAULT_OPTIONS,
  cardCopy,
  cardSize,
  cueMeasurement,
  exportSize,
  safeInsets,
  stuckLine,
  watermarkText,
} from './model';
import { STUCK_FIXTURE } from './stuck';

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

const initialCoach = useCoachStore.getState();
beforeEach(() => {
  jest.clearAllMocks();
  useCoachStore.setState(initialCoach, true);
});

describe('share model', () => {
  it('sizes cards at the 390 base and exports at 1080 wide', () => {
    expect(cardSize('strobe_card', '9:16')).toEqual({ width: 390, height: 693 });
    expect(cardSize('strobe_card', '4:5')).toEqual({ width: 390, height: 488 });
    expect(cardSize('strobe_card', '1:1')).toEqual({ width: 390, height: 390 });
    expect(cardSize('sticker', '9:16')).toEqual({ width: 390, height: 507 });
    expect(exportSize('strobe_card', '9:16')).toEqual({ width: 1080, height: 1920 });
    expect(exportSize('strobe_card', '4:5')).toEqual({ width: 1080, height: 1350 });
  });

  it('keeps 9:16 copy clear of the Reels and TikTok overlays', () => {
    expect(safeInsets('9:16', { width: 1080, height: 1920 })).toEqual({ top: 269, bottom: 384, left: 65, right: 130 });
    expect(safeInsets('1:1', { width: 390, height: 390 })).toEqual({ top: 20, bottom: 20, left: 20, right: 20 });
  });

  it('puts the cue in the free watermark and drops it for paid', () => {
    expect(watermarkText(snatchMock, false)).toBe('catchline · stay over the bar longer');
    expect(watermarkText(snatchMock, true)).toBeNull();
  });

  it('builds the card copy from the analysis and the chosen options', () => {
    expect(cueMeasurement(snatchMock)?.id).toBe('bar_drift_hip');
    expect(cueMeasurement(snatchReal)?.id).toBe('jump_forward');
    expect(cardCopy(snatchMock, DEFAULT_OPTIONS, '@coachdani')).toEqual({
      hero: '6 cm',
      cue: 'Stay over the bar longer',
      meta: 'snatch · 62.5 kg · bar drift at hip · best 2',
    });
    expect(cardCopy(snatchMock, { ...DEFAULT_OPTIONS, cue: false, weight: false, coach: true }, '@coachdani', false)).toEqual({
      hero: '6 cm',
      cue: null,
      meta: 'snatch · coach @coachdani',
    });
  });

  it('describes the before and after of a cue that stuck', () => {
    expect(stuckLine(STUCK_FIXTURE)).toBe('bar drift 6 → 2 cm · 3 weeks');
  });
});

describe('ShareCard', () => {
  it('renders the strobe card with hero, cue, meta, path and watermark', async () => {
    const { getByTestId } = await render(
      <ShareCard analysis={snatchMock} type="strobe_card" aspect="9:16" options={DEFAULT_OPTIONS} watermark="catchline · stay over the bar longer" coachHandle={null} />
    );
    expect(getByTestId('card-hero')).toHaveTextContent('6 cm');
    expect(getByTestId('card-cue')).toHaveTextContent('Stay over the bar longer');
    expect(getByTestId('card-meta')).toHaveTextContent('snatch · 62.5 kg · bar drift at hip · best 2');
    expect(getByTestId('watermark')).toHaveTextContent('catchline · stay over the bar longer');
    expect(getByTestId('card-path')).toBeOnTheScreen();
    expect(getByTestId('stage-layer-asset:snatch/1-setup')).toBeOnTheScreen();
    expect(getByTestId('stage-layer-asset:snatch/6-catch')).toBeOnTheScreen();
  });

  it('drops the strobe to the catch frame and hides the path when toggled off', async () => {
    const { queryByTestId, getByTestId } = await render(
      <ShareCard analysis={snatchMock} type="strobe_card" aspect="1:1" options={{ ...DEFAULT_OPTIONS, strobe: false, path: false }} watermark={null} coachHandle={null} />
    );
    expect(queryByTestId('stage-layer-asset:snatch/1-setup')).toBeNull();
    expect(getByTestId('stage-layer-asset:snatch/6-catch')).toBeOnTheScreen();
    expect(queryByTestId('card-path')).toBeNull();
    expect(queryByTestId('watermark')).toBeNull();
  });

  it('renders the overlay video frame with its phase strip', async () => {
    const { getByTestId } = await render(
      <ShareCard analysis={snatchMock} type="overlay_video" aspect="9:16" options={DEFAULT_OPTIONS} watermark="catchline · stay over the bar longer" coachHandle={null} />
    );
    const strip = getByTestId('phase-strip');
    expect(within(strip).getByText('setup 0.50')).toBeOnTheScreen();
    expect(within(strip).getByText('catch 0.33')).toBeOnTheScreen();
    expect(getByTestId('card-meta')).toHaveTextContent('catchline · snatch · 62.5 kg');
  });

  it('renders the it-stuck card before and after', async () => {
    const { getByTestId, getByText } = await render(
      <ShareCard analysis={snatchMock} type="it_stuck" aspect="4:5" options={DEFAULT_OPTIONS} watermark={null} coachHandle={null} stuck={STUCK_FIXTURE} />
    );
    expect(getByTestId('card-hero')).toHaveTextContent('Stuck.');
    expect(getByText('30 sep · 6 cm')).toBeOnTheScreen();
    expect(getByText('today · 2 cm')).toBeOnTheScreen();
    expect(getByText('bar drift 6 → 2 cm · 3 weeks')).toBeOnTheScreen();
  });

  it('renders the sticker on a transparent card', async () => {
    const { getByTestId } = await render(
      <ShareCard analysis={snatchMock} type="sticker" aspect="9:16" options={DEFAULT_OPTIONS} watermark={null} coachHandle={null} />
    );
    expect(getByTestId('share-card-sticker-sticker')).toHaveStyle({ backgroundColor: 'transparent', width: 390, height: 507 });
    expect(getByTestId('sticker')).toBeOnTheScreen();
  });
});

describe('exporter', () => {
  it('captures the card at export size', async () => {
    const ref = { current: null };
    await expect(renderStill(ref, 'strobe_card', '4:5')).resolves.toBe('file:///mock/share-card.png');
    expect(captureRef).toHaveBeenCalledWith(ref, { format: 'png', quality: 1, width: 1080, height: 1350, result: 'tmpfile' });
  });

  it('reports a dismissed share sheet as cancelled', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValueOnce({ action: Share.dismissedAction });
    await expect(saveImage('file:///x.png')).resolves.toBe('cancelled');
    expect(spy).toHaveBeenCalledWith({ url: 'file:///x.png' });
  });

  it('leaves overlay video to the Phase 3 server renderer', async () => {
    await expect(
      overlayVideoRenderer.render({ analysisId: 'snatch-mock', aspect: '9:16', options: DEFAULT_OPTIONS, watermark: null, fps: 30 })
    ).resolves.toEqual({ status: 'failed', reason: 'not_available' });
  });
});

describe('ShareScreen', () => {
  const deps = () => ({
    render: jest.fn(() => Promise.resolve('file:///card.png')),
    save: jest.fn(() => Promise.resolve('saved' as const)),
    video: { render: jest.fn(() => Promise.resolve({ status: 'failed' as const, reason: 'not_available' as const })) },
    instagram: jest.fn(() => Promise.resolve()),
  });
  const nav = { onBack: jest.fn(), onSendToCoach: jest.fn() };

  it('shows the free footnote and renders, saves, then offers Instagram and the coach', async () => {
    const d = deps();
    const screen = await render(<ShareScreen analysis={snatchMock} pro={false} {...nav} deps={d} />);
    expect(screen.getByTestId('share-footnote')).toHaveTextContent('free: watermark carries the cue · upgrade to remove');
    expect(screen.getByTestId('share-card-strobe_card-9:16')).toBeOnTheScreen();
    await press(screen.getByTestId('share-export'));
    expect(d.render).toHaveBeenCalledWith(expect.objectContaining({ current: expect.anything() }), 'strobe_card', '9:16');
    expect(d.save).toHaveBeenCalledWith('file:///card.png');
    expect(screen.getByText('Saved to Photos')).toBeOnTheScreen();
    await press(screen.getByText('Open Instagram'));
    expect(d.instagram).toHaveBeenCalledTimes(1);
    await press(screen.getByTestId('saved-send-coach'));
    expect(nav.onSendToCoach).toHaveBeenCalledTimes(1);
  });

  it('switches aspect and type, and hides aspect choices for the sticker', async () => {
    const screen = await render(<ShareScreen analysis={snatchMock} pro {...nav} deps={deps()} />);
    expect(screen.getByTestId('share-footnote')).toHaveTextContent('1080 × 1920 · png');
    await press(screen.getByTestId('aspect-4:5'));
    expect(screen.getByTestId('share-card-strobe_card-4:5')).toBeOnTheScreen();
    expect(screen.getByTestId('share-footnote')).toHaveTextContent('1080 × 1350 · png');
    await press(screen.getByTestId('type-sticker'));
    expect(screen.getByTestId('share-card-sticker-sticker')).toBeOnTheScreen();
    expect(screen.queryByTestId('aspect-9:16')).toBeNull();
    expect(screen.queryByTestId('option-cue')).toBeNull();
    expect(screen.getByTestId('option-strobe')).toBeOnTheScreen();
  });

  it('toggles the coach handle into the card', async () => {
    const screen = await render(<ShareScreen analysis={snatchMock} pro {...nav} deps={deps()} />);
    expect(screen.getByTestId('option-coach')).toHaveTextContent('@coachdani');
    await press(screen.getByTestId('option-coach'));
    expect(screen.getByTestId('card-meta')).toHaveTextContent('snatch · 62.5 kg · bar drift at hip · best 2 · coach @coachdani');
  });

  it('offers the still when overlay video export is not available yet', async () => {
    const d = deps();
    const screen = await render(<ShareScreen analysis={snatchMock} pro={false} {...nav} deps={d} />);
    await press(screen.getByTestId('type-overlay_video'));
    expect(screen.getByTestId('share-export')).toHaveTextContent('Save video');
    await press(screen.getByTestId('share-export'));
    expect(d.video.render).toHaveBeenCalledWith(
      { analysisId: 'snatch-mock', aspect: '9:16', options: DEFAULT_OPTIONS, watermark: 'catchline · stay over the bar longer', fps: 30 },
      expect.any(Function)
    );
    expect(screen.getByText('Video export is not ready yet')).toBeOnTheScreen();
    await press(screen.getByText('Save still'));
    expect(d.render).toHaveBeenCalledWith(expect.anything(), 'overlay_video', '9:16');
    expect(screen.getByText('Saved to Photos')).toBeOnTheScreen();
  });

  it('shows the failed state when the capture throws, and retries', async () => {
    const d = deps();
    d.render.mockRejectedValueOnce(new Error('snapshot failed'));
    const screen = await render(<ShareScreen analysis={snatchMock} pro={false} {...nav} deps={d} />);
    await press(screen.getByTestId('share-export'));
    expect(screen.getByText("Couldn't render")).toBeOnTheScreen();
    await press(screen.getByText('Try again'));
    expect(d.render).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Saved to Photos')).toBeOnTheScreen();
  });

  it('shows the rendering sheet', async () => {
    const screen = await render(<ShareScreen analysis={snatchMock} pro={false} initialState="rendering" {...nav} deps={deps()} />);
    expect(screen.getByText('Rendering your card')).toBeOnTheScreen();
    expect(screen.getByText('about 10 s')).toBeOnTheScreen();
    expect(screen.getByTestId('render-progress')).toHaveStyle({ width: '60%' });
  });
});

describe('coach repository', () => {
  it('creates a 30-day link and stores overrides', async () => {
    const repo = createLocalCoachRepository(() => new Date('2026-10-11T10:00:00.000Z'));
    const link = await repo.createLink('snatch-mock', { includeCue: true, includeRecent: false });
    expect(link).toEqual({
      id: '7f3a',
      analysisId: 'snatch-mock',
      url: 'https://catchline.app/l/7f3a',
      includeCue: true,
      includeRecent: false,
      createdAt: '2026-10-11T10:00:00.000Z',
      expiresAt: '2026-11-10T10:00:00.000Z',
    });
    expect((await repo.createLink('snatch-mock', { includeCue: false, includeRecent: true })).id).toBe('7f3b');
    expect(repo.getOverride('snatch-real')).toBeNull();
    await repo.saveOverride({
      analysisId: 'snatch-real',
      coachName: 'Sam',
      text: 'Finish the pull',
      replacedCue: 'Land where you started',
      metricLabel: 'Jump forward',
      createdAt: '2026-10-11T10:00:00.000Z',
    });
    expect(repo.getOverride('snatch-real')?.text).toBe('Finish the pull');
  });
});

describe('SendToCoachSheet', () => {
  it('copies the link and shares it through WhatsApp, Messages and More', async () => {
    const open = jest.fn(() => Promise.resolve());
    const share = jest.fn(() => Promise.resolve());
    const repo = createLocalCoachRepository(() => new Date('2026-10-11T10:00:00.000Z'));
    const screen = await render(
      <SendToCoachSheet analysis={snatchMock} onClose={jest.fn()} deps={{ repo, copy: Clipboard.setStringAsync, open, share }} />
    );
    expect(screen.getByText('A link to this lift with the overlay, the cue and the numbers. No login for them. Expires in 30 days.')).toBeOnTheScreen();
    await press(screen.getByText('Copy link'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://catchline.app/l/7f3a');
    expect(screen.getByText('Link copied')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-link-url')).toHaveTextContent('https://catchline.app/l/7f3a');
    await press(screen.getByText('WhatsApp'));
    expect(open).toHaveBeenCalledWith(`whatsapp://send?text=${encodeURIComponent(coachMessage('https://catchline.app/l/7f3a'))}`);
    await press(screen.getByText('Messages'));
    expect(open).toHaveBeenLastCalledWith(`sms:&body=${encodeURIComponent('Can you check this lift? https://catchline.app/l/7f3a')}`);
    await press(screen.getByText('More'));
    expect(share).toHaveBeenCalledWith('Can you check this lift? https://catchline.app/l/7f3a');
    expect(useCoachStore.getState().links).toHaveLength(1);
  });

  it('mints a new link when the toggles change', async () => {
    const repo = createLocalCoachRepository(() => new Date('2026-10-11T10:00:00.000Z'));
    const screen = await render(
      <SendToCoachSheet analysis={snatchMock} onClose={jest.fn()} deps={{ repo, copy: Clipboard.setStringAsync, open: jest.fn(), share: jest.fn() }} />
    );
    await press(screen.getByText('Copy link'));
    await act(async () => {
      fireEvent(screen.getByTestId('include-recent'), 'valueChange', true);
    });
    await press(screen.getByText('Link copied'));
    expect(useCoachStore.getState().links.map((l) => [l.id, l.includeRecent])).toEqual([
      ['7f3a', false],
      ['7f3b', true],
    ]);
  });
});

describe('FromCoachCard', () => {
  it('shows the coach override in place of the app cue', async () => {
    const override = useCoachStore.getState().overrides['snatch-mock'];
    const onTry = jest.fn();
    const screen = await render(<FromCoachCard override={override} onTry={onTry} now={new Date('2026-10-11T12:00:00.000Z')} />);
    expect(screen.getByText('today')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-cue')).toHaveTextContent('Sit back into the start, chest up. Pull slower off the floor.');
    expect(
      screen.getByText('Replaces "Stay over the bar longer". Catchline will track bar drift at hip against this cue instead.')
    ).toBeOnTheScreen();
    await press(screen.getByText('Try this next session'));
    expect(onTry).toHaveBeenCalledTimes(1);
  });

  it('labels older overrides by date', () => {
    expect(overrideDateLabel('2026-09-30T08:00:00.000Z', new Date('2026-10-11T12:00:00.000Z'))).toBe('30 sep');
  });
});

import { shareVibeCard } from '../shareVibeCard';
import Share from 'react-native-share';
import { releaseCapture } from 'react-native-view-shot';

const mockShareOpen = Share.open as jest.Mock;
const mockReleaseCapture = releaseCapture as jest.Mock;

function fakeCardRef(capture: () => Promise<string>) {
  return { current: { capture } } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('shareVibeCard', () => {
  it('captures the card and shares the resulting image', async () => {
    mockShareOpen.mockResolvedValue({ success: true, message: '' });
    const ref = fakeCardRef(async () => 'file:///tmp/card.png');

    const result = await shareVibeCard(ref, 'Soft Anchor', 'a quote');

    expect(result).toEqual({ status: 'shared' });
    expect(mockShareOpen).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'file:///tmp/card.png', type: 'image/png' }),
    );
    expect(mockReleaseCapture).toHaveBeenCalledWith('file:///tmp/card.png');
  });

  it('reports cancelled when the share sheet is dismissed', async () => {
    mockShareOpen.mockResolvedValue({ success: false, message: 'User did not share' });
    const ref = fakeCardRef(async () => 'file:///tmp/card.png');

    const result = await shareVibeCard(ref, 'Soft Anchor');

    expect(result).toEqual({ status: 'cancelled' });
  });

  it('reports error when the native share sheet throws', async () => {
    mockShareOpen.mockRejectedValue(new Error('boom'));
    const ref = fakeCardRef(async () => 'file:///tmp/card.png');

    const result = await shareVibeCard(ref, 'Soft Anchor');

    expect(result).toEqual({ status: 'error' });
    expect(mockReleaseCapture).toHaveBeenCalledWith('file:///tmp/card.png');
  });

  it('falls back to a text-only share when capture fails', async () => {
    mockShareOpen.mockResolvedValue({ success: true, message: '' });
    const ref = fakeCardRef(async () => {
      throw new Error('capture failed');
    });

    const result = await shareVibeCard(ref, 'Soft Anchor', 'my quote');

    expect(result).toEqual({ status: 'shared' });
    expect(mockShareOpen).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'my quote' }),
    );
    expect(mockReleaseCapture).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when no share quote is available', async () => {
    mockShareOpen.mockResolvedValue({ success: true, message: '' });
    const ref = fakeCardRef(async () => null as unknown as string);

    await shareVibeCard(ref, 'Soft Anchor', null);

    expect(mockShareOpen).toHaveBeenCalledWith(
      expect.objectContaining({ message: "I'm a Soft Anchor on Frinq." }),
    );
  });
});

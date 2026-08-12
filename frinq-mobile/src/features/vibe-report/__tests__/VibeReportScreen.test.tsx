import React from 'react';
import { render, waitFor, fireEvent, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VibeReportScreen } from '../screens/VibeReportScreen';
import { QuizDraftRepository } from '../../../storage/quizDraftRepository';
import { VibeReport } from '../../../services/api/contracts';

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <VibeReportScreen />
    </QueryClientProvider>,
  );
}

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

let mockStoreData: Map<string, string>;
const mockStore = {
  getString: (k: string) => mockStoreData.get(k) ?? null,
  set: (k: string, v: string) => void mockStoreData.set(k, v),
  remove: (k: string) => void mockStoreData.delete(k),
};
jest.mock('../../../storage/encryptedStorage', () => ({
  getEncryptedStore: async () => mockStore,
}));

const mockShareVibeCard = jest.fn();
jest.mock('../shareVibeCard', () => ({
  shareVibeCard: (...args: unknown[]) => mockShareVibeCard(...args),
}));

// The envelope's full opening sequence takes 3.6s of real animation time
// (matching the actual on-device feel) — under reduced motion it hands off
// to the report almost immediately instead, which is what these tests want:
// exercising the functional reveal/share flow, not sitting through the
// animation. A real device with reduced-motion on gets this exact path.
jest.mock('../../../design/motion/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

const USER = { id: 'user-1', phone: '9876543210' };

function fullReport(overrides: Partial<VibeReport> = {}): VibeReport {
  return {
    submission_id: 'sub-1',
    status: 'done',
    name: 'Ada',
    headline: 'a quiet force in any room',
    archetype: 'Soft Anchor',
    archetype_desc: 'steady and grounding',
    share_quote: 'the one everyone trusts',
    insights: [{ label: 'grounded', text: 'you make people feel safe' }],
    tags: ['steady', 'warm'],
    share_card: {
      archetype: 'Soft Anchor',
      archetype_slug: 'soft-anchor',
      nickname: 'the quiet one',
      description: 'steady and grounding',
      archetype_desc: 'steady and grounding',
      headline: 'a quiet force in any room',
      pull_quote: 'the one everyone trusts',
      share_quote: 'the one everyone trusts',
      tags: ['steady', 'warm'],
      stats: { social_energy: 55, peak_time: '9:00 pm', group_role: 'The Glue', group_effect: 88, secret_edge: 'Presence', rarity: 'Top 10%' },
      love_language: '',
      ideal_hangout: '',
      compatibility: { clicks_with: [], clashes_with: [] },
      friend_audit: { seek: '', avoid: '' },
      growth_edge: '',
    },
    deep_summary: {
      report_quote: 'the quiet force in every room',
      narrative: ['You show up before anyone asks.'],
      mirror: 'People relax around you.',
      first_impression: 'Calm, watchful.',
      hidden_pattern: 'You carry more than you show.',
      unspoken_need: 'To be asked, not just leaned on.',
      read_notes: [{ label: 'watch for', text: 'burnout from over-giving' }],
      closing_line: 'Steady wins.',
      snapshot: { first_read: 'grounded', after_time: 'reliable', under_stress: 'quieter', what_wins_you: 'consistency' },
    },
    ...overrides,
  };
}

function mockApiClient(report: VibeReport | Error) {
  return {
    request: jest.fn(async ({ path }: { path: string }) => {
      if (path === '/api/v1/users/me') return USER;
      if (report instanceof Error) throw report;
      return report;
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreData = new Map();
  const repo = new QuizDraftRepository({ store: mockStore, now: () => 1 });
  repo.save({ submissionId: 'sub-1', userId: USER.id, lastRoute: 'story', answers: {} });
});

describe('VibeReportScreen', () => {
  it('shows the boot splash while loading', () => {
    // A promise that never resolves — keeps the screen in 'loading' for the
    // life of this test with no trailing state update after it ends.
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn(() => new Promise(() => {})) } });
    const { getByTestId } = renderScreen();
    expect(getByTestId('boot-splash')).toBeTruthy();
  });

  it('opens on the envelope, with the report hidden behind it until it is tapped', async () => {
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport()) });
    const { findByRole, queryByText } = renderScreen();

    expect(await findByRole('button', { name: /open your friend read/i })).toBeTruthy();
    // The written portrait only mounts once the envelope hands off.
    expect(queryByText(/the bigger picture/i)).toBeNull();
  });

  it('reveals the deck and the written portrait after the envelope is opened', async () => {
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport()) });
    const { findByRole, findByText } = renderScreen();

    fireEvent.press(await findByRole('button', { name: /open your friend read/i }));

    // Hero plaque + the legacy-mapped portrait paragraphs. "You carry more
    // than you show." (hidden_pattern) is deliberately reused in BOTH the
    // deck's "connect" quick-row and this portrait paragraph by the legacy
    // mapping (summaryPageData.ts), so it now renders twice once the deck
    // shows enough depth to include that card — asserting on `narrative[0]`
    // instead, which the legacy mapping only ever places in the portrait.
    expect(await findByText('the soft anchor')).toBeTruthy();
    expect(await findByText(/the bigger picture/i)).toBeTruthy();
    expect(await findByText('You show up before anyone asks.')).toBeTruthy();
  });

  it('still renders a usable read when deep_summary is missing entirely', async () => {
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport({ deep_summary: null })) });
    const { findByRole, findByText, queryByText } = renderScreen();

    fireEvent.press(await findByRole('button', { name: /open your friend read/i }));

    // Falls back to share_card copy for the type definition.
    // Displayed title-cased, like the web card's text-transform: capitalize.
    expect(await findByText('the soft anchor')).toBeTruthy();
    expect(queryByText('Steady wins.')).toBeNull();
  });

  it('expands long AI-generated text without crashing', async () => {
    const longText = 'x'.repeat(600);
    mockUseSession.mockReturnValue({
      apiClient: mockApiClient(fullReport({ deep_summary: { narrative: [longText] } })),
    });
    const { findByRole, findByText } = renderScreen();

    fireEvent.press(await findByRole('button', { name: /open your friend read/i }));
    // The portrait capitalizes each paragraph's first letter for readability.
    expect(await findByText(`X${longText.slice(1)}`)).toBeTruthy();
  });

  it('shows a stale-membership message and offers retry when status is not done', async () => {
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport({ status: 'processing' })) });
    const { findByRole } = renderScreen();
    const alert = await findByRole('alert');
    expect(within(alert).getByText(/still on its way/i)).toBeTruthy();
  });

  it('shows a retryable error on a network failure, and retry re-fetches', async () => {
    const apiClient = mockApiClient(new Error('network'));
    mockUseSession.mockReturnValue({ apiClient });

    const { findByRole } = renderScreen();
    const alert = await findByRole('alert');
    const retryButton = within(alert).getByRole('button', { name: /try again/i });

    apiClient.request.mockImplementation(async ({ path }: { path: string }) =>
      path === '/api/v1/users/me' ? USER : fullReport(),
    );
    fireEvent.press(retryButton);

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledWith({ path: '/api/v1/quiz/summary/sub-1' }));
  });

  it('shows a recoverable error when no local draft/submission id can be found', async () => {
    mockStoreData = new Map(); // no draft saved for this user
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport()) });

    const { findByRole } = renderScreen();
    expect(await findByRole('alert')).toBeTruthy();
  });

  it('shares the visible quick-read card via shareVibeCard, captioned with that card', async () => {
    // The lead "your type" card (Figma's static hero plaque) isn't in the
    // swipeable deck any more — it never had a share affordance in the
    // design, only the four quick-read cards below "what stands out about
    // you" do. This shares the first of those instead.
    mockShareVibeCard.mockResolvedValue({ status: 'shared' });
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport()) });

    const { findByRole } = renderScreen();
    fireEvent.press(await findByRole('button', { name: /open your friend read/i }));

    fireEvent.press(await findByRole('button', { name: /share this card: what you bring to the table/i }));

    await waitFor(() =>
      expect(mockShareVibeCard).toHaveBeenCalledWith(
        expect.anything(),
        'the soft anchor',
        'my frinq type is the soft anchor. People relax around you.',
      ),
    );
  });
});

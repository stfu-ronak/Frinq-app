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

  it('renders the card, quote, insights, deep-summary sections, and tags when the report is done', async () => {
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport()) });
    const { findByText, getByLabelText } = renderScreen();

    expect(await findByText('you make people feel safe')).toBeTruthy();
    expect(getByLabelText('Your Frinq archetype: Soft Anchor')).toBeTruthy();
    expect(await findByText('You show up before anyone asks.')).toBeTruthy();
    expect(await findByText('Steady wins.')).toBeTruthy();
    expect(await findByText('steady')).toBeTruthy();
  });

  it('omits deep-summary sections gracefully when deep_summary is missing', async () => {
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport({ deep_summary: null })) });
    const { findByText, queryByText } = renderScreen();

    expect(await findByText('grounded')).toBeTruthy(); // insights still render
    expect(queryByText('Steady wins.')).toBeNull(); // closing_line section omitted, not shown empty
    expect(queryByText('the read')).toBeNull();
  });

  it('renders without an illustration for an archetype with no curated asset yet', async () => {
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport({ archetype: 'Wild Card', share_card: null })) });
    const { findByLabelText } = renderScreen();
    expect(await findByLabelText('Your Frinq archetype: Wild Card')).toBeTruthy();
  });

  it('expands long AI-generated text without crashing', async () => {
    const longText = 'x'.repeat(600);
    mockUseSession.mockReturnValue({
      apiClient: mockApiClient(fullReport({ deep_summary: { narrative: [longText] } })),
    });
    const { findByText } = renderScreen();
    expect(await findByText(longText)).toBeTruthy();
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

  it('shares the card via shareVibeCard on button press', async () => {
    mockShareVibeCard.mockResolvedValue({ status: 'shared' });
    mockUseSession.mockReturnValue({ apiClient: mockApiClient(fullReport()) });

    const { findByRole } = renderScreen();
    const shareButton = await findByRole('button', { name: /share your vibe/i });
    fireEvent.press(shareButton);

    await waitFor(() => expect(mockShareVibeCard).toHaveBeenCalledWith(expect.anything(), 'Soft Anchor', 'the quiet force in every room'));
    // heroQuote prefers deep_summary.report_quote over headline/share_quote — same text shown on screen.
  });
});

/**
 * Finishing the quiz must land on the summary reveal, not on the Events tab —
 * previously `processing -> active` went straight to MainTabs and the read the
 * user had just waited ~100s for was only reachable by hunting through Profile.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { RootNavigator } from '../RootNavigator';

jest.mock('../../features/vibe-report/screens/VibeReportScreen', () => {
  const { Text } = require('react-native');
  return { VibeReportScreen: ({ onContinue }: { onContinue?: () => void }) =>
    <Text testID="reveal">{onContinue ? 'reveal-with-continue' : 'reveal'}</Text> };
});
jest.mock('../MainTabs', () => {
  const { Text } = require('react-native');
  return { MainTabs: () => <Text testID="main">main</Text> };
});
jest.mock('../../features/vibe-report/screens/ProcessingScreen', () => {
  const { Text } = require('react-native');
  return { ProcessingScreen: () => <Text testID="processing">processing</Text> };
});

describe('RootNavigator reveal hand-off', () => {
  it('shows the main app directly for a returning active user', () => {
    const { queryByTestId } = render(<RootNavigator state="active" />);
    expect(queryByTestId('main')).toBeTruthy();
    expect(queryByTestId('reveal')).toBeNull();
  });

  it('shows the reveal — with a Continue — when the user has just come out of processing', () => {
    const { rerender, queryByTestId, getByTestId } = render(<RootNavigator state="processing" />);
    expect(queryByTestId('processing')).toBeTruthy();

    rerender(<RootNavigator state="active" />);

    expect(getByTestId('reveal').props.children).toBe('reveal-with-continue');
    expect(queryByTestId('main')).toBeNull();
  });
});

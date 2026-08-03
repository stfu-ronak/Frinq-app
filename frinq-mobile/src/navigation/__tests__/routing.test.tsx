import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { screenForState, RootNavigator } from '../RootNavigator';
import { BootState } from '../../app/boot/bootMachine';

// Real pushService.ts imports @react-native-firebase/messaging, which isn't
// natively linked (or transform-allowed for Jest) yet. None of this file's
// tests reach 'active' state (where MainTabs/CommunityScreen would actually
// mount) — this only satisfies the static import chain.
jest.mock('../../services/push/pushService', () => ({}));

describe('screenForState (exhaustive routing)', () => {
  const cases: Array<[BootState, string]> = [
    ['checking', 'splash'],
    ['authRequired', 'auth'],
    ['legalRequired', 'legal'],
    ['quizInProgress', 'quiz'],
    ['processing', 'processing'],
    ['active', 'main'],
    ['suspended', 'suspended'],
    ['banned', 'banned'],
    ['offline', 'offline'],
    ['error', 'error'],
  ];
  it.each(cases)('%s -> %s', (state, screen) => {
    expect(screenForState(state)).toBe(screen);
  });
});

function renderRoot(state: BootState) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <NavigationContainer>
        <RootNavigator state={state} />
      </NavigationContainer>
    </SafeAreaProvider>,
  );
}

describe('RootNavigator render gating', () => {
  it('renders only the boot splash while checking (no protected screens)', () => {
    const { getByTestId, queryByTestId } = renderRoot('checking');
    expect(getByTestId('app-launch-splash')).toBeTruthy();
    expect(getByTestId('app-launch-splash-icon')).toBeTruthy();
    expect(queryByTestId('screen-community')).toBeNull();
    expect(queryByTestId('screen-profile')).toBeNull();
    expect(queryByTestId('screen-quiz')).toBeNull();
  });

  it('renders the banned terminal screen, not app content', () => {
    const { getByTestId, queryByTestId } = renderRoot('banned');
    expect(getByTestId('screen-banned')).toBeTruthy();
    expect(queryByTestId('app-launch-splash')).toBeNull();
  });

  it('renders the suspended terminal screen', () => {
    const { getByTestId } = renderRoot('suspended');
    expect(getByTestId('screen-suspended')).toBeTruthy();
  });

  it('renders the offline retry screen, never the login/auth screen', () => {
    const { getByTestId, queryByTestId } = renderRoot('offline');
    expect(getByTestId('screen-offline')).toBeTruthy();
    // The whole point: an offline launch must not look like a logout.
    expect(queryByTestId('screen-auth')).toBeNull();
  });
});

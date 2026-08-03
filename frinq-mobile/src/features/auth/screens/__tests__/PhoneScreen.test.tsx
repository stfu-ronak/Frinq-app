import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { PhoneScreen } from '../PhoneScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
jest.mock('../../../../services/session/sessionContext', () => ({ useSession: () => ({ apiClient: {} }) }));
jest.mock('../../authService', () => ({ sendOtp: jest.fn() }));
jest.mock('../../../../services/telemetry/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../quiz/quizSyncService', () => ({ startQuiz: jest.fn() }));
jest.mock('../../../quiz/pendingQuizState', () => ({ savePendingQuizState: jest.fn() }));

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | string | undefined>;
}

describe('PhoneScreen', () => {
  it('uses the reference-scale heading, compact telephone art, and rectangular OTP button', () => {
    const { getByTestId, getByRole, UNSAFE_getByProps } = render(<PhoneScreen />);
    expect(flatten(getByTestId('phone-heading').props.style)).toMatchObject({ color: '#621407', fontSize: 28, lineHeight: 42 });
    expect(flatten(UNSAFE_getByProps({ testID: 'phone-art' }).props.style)).toMatchObject({ height: 160, flex: 0, marginTop: 140 });
    expect(flatten(getByRole('button', { name: 'Request OTP' }).props.style)).toMatchObject({ width: '86%', minHeight: 52, borderRadius: 12 });
  });
});

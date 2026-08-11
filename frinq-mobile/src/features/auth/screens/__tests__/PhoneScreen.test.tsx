import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { PhoneScreen } from '../PhoneScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: undefined }),
}));
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
    const { getByTestId, getByRole, getByLabelText, UNSAFE_getByProps } = render(<PhoneScreen />);
    expect(flatten(getByTestId('phone-heading').props.style)).toMatchObject({ width: 210, height: 46 });
    expect(flatten(UNSAFE_getByProps({ testID: 'phone-art' }).props.style)).toMatchObject({ height: 192, flex: 0, marginTop: 140 });
    expect(flatten(getByRole('button', { name: 'Request OTP' }).props.style)).toMatchObject({ width: '76%', minHeight: 48, borderRadius: 12 });
    expect(flatten(getByTestId('phone-country-code').props.style)).toMatchObject({ width: 87, height: 49, backgroundColor: '#ECECEC' });
    expect(flatten(getByLabelText('Phone number').props.style)).toMatchObject({ height: 49, fontSize: 20 });
    expect(getByLabelText('Phone number').props.placeholder).toBe('85454 54616');
  });
});

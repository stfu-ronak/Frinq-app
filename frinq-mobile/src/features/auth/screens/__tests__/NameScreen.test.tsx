import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NameScreen } from '../NameScreen';
import { savePendingQuizState } from '../../../quiz/pendingQuizState';

const mockNavigate = jest.fn();
const ROUTE_PARAMS = { userId: 'user-1', phone: '9990001111', priorSession: null };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: ROUTE_PARAMS }),
}));
jest.mock('../../../quiz/pendingQuizState', () => ({ savePendingQuizState: jest.fn().mockResolvedValue(undefined) }));

const mockFlush = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../quiz/flushPendingQuizState', () => ({ flushPendingQuizState: (...a: unknown[]) => mockFlush(...a) }));

const mockSignalAuthenticated = jest.fn();
jest.mock('../../../../services/session/sessionContext', () => ({
  useSession: () => ({ apiClient: 'the-api-client', coordinator: { signalAuthenticated: mockSignalAuthenticated } }),
}));

beforeEach(() => jest.clearAllMocks());

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | string | undefined>;
}

describe('NameScreen', () => {
  it('keeps the reference-scale two-line question and supplied arrow artwork', () => {
    const { getByTestId, getByLabelText, getByRole, queryByTestId } = render(<NameScreen />);

    expect(flatten(getByTestId('name-heading').props.style)).toMatchObject({ color: '#621407', fontSize: 28, lineHeight: 42, maxWidth: 280 });
    expect(getByTestId('name-next-arrow').type).toBe('Image');
    expect(flatten(getByLabelText('Your name').props.style)).toMatchObject({ textAlign: 'center' });
    expect(flatten(getByRole('button', { name: 'Continue with name' }).props.style)).toMatchObject({ marginBottom: 60 });
    expect(queryByTestId('name-peach-fade')).toBeNull();
  });

  it('never advertises the length rule up front — the message only appears after a rejected submit', () => {
    const { queryByText } = render(<NameScreen />);
    expect(queryByText(/3-16 characters/)).toBeNull();
  });

  it.each([
    ['too short', 'Al'],
    ['too long', 'Bartholomew Cuthbert'],
  ])('rejects a %s name with an inline message and does not navigate', (_label, value) => {
    const { getByLabelText, getByRole, getByText } = render(<NameScreen />);
    fireEvent.changeText(getByLabelText('Your name'), value);
    fireEvent.press(getByRole('button', { name: 'Continue with name' }));

    expect(getByText('name should be 3-16 characters')).toBeTruthy();
    expect(savePendingQuizState).not.toHaveBeenCalled();
    expect(mockSignalAuthenticated).not.toHaveBeenCalled();
  });

  it('accepts an in-range name, saves it trimmed, flushes the draft, then flips auth', async () => {
    const { getByLabelText, getByRole } = render(<NameScreen />);
    fireEvent.changeText(getByLabelText('Your name'), '  Dhairya  ');
    fireEvent.press(getByRole('button', { name: 'Continue with name' }));

    await waitFor(() => expect(savePendingQuizState).toHaveBeenCalledWith({ name: 'Dhairya' }));
    // The flush must land BEFORE auth flips, or the quiz would mount and read
    // the draft before the name is in it.
    await waitFor(() => expect(mockFlush).toHaveBeenCalledWith('the-api-client', 'user-1', '9990001111', null));
    await waitFor(() => expect(mockSignalAuthenticated).toHaveBeenCalledTimes(1));
  });

  it('clears the error as soon as the user edits again', () => {
    const { getByLabelText, getByRole, queryByText } = render(<NameScreen />);
    fireEvent.changeText(getByLabelText('Your name'), 'Al');
    fireEvent.press(getByRole('button', { name: 'Continue with name' }));
    expect(queryByText(/3-16 characters/)).toBeTruthy();

    fireEvent.changeText(getByLabelText('Your name'), 'Alex');
    expect(queryByText(/3-16 characters/)).toBeNull();
  });
});

import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { NameScreen } from '../NameScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
jest.mock('../../../quiz/pendingQuizState', () => ({ savePendingQuizState: jest.fn() }));

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
});

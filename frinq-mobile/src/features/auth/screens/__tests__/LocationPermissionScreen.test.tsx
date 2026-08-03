import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { LocationPermissionScreen } from '../LocationPermissionScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | string | undefined>;
}

describe('LocationPermissionScreen', () => {
  it('matches the location reference copy, palette, and two-action layout', () => {
    const { getByText, getByRole, getByTestId } = render(<LocationPermissionScreen />);

    expect(flatten(getByText('location services').props.style)).toMatchObject({ color: '#621407', fontSize: 28, lineHeight: 42 });
    expect(getByText('we use your location to show you potential matches in your area.')).toBeTruthy();
    expect(flatten(getByRole('button', { name: 'Set location services' }).props.style)).toMatchObject({
      width: '86%', minHeight: 52, borderRadius: 12,
    });
    expect(flatten(getByRole('button', { name: 'Not now' }).props.style)).toMatchObject({ marginTop: 8 });
    expect(flatten(getByTestId('location-permission-body').props.style)).toMatchObject({ paddingBottom: 0 });
  });
});

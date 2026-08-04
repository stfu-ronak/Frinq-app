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
    const { getByText, getByRole, getByTestId, queryByText, UNSAFE_getByProps } = render(<LocationPermissionScreen />);

    expect(queryByText('location services')).toBeNull();
    expect(getByTestId('location-title-art').type).toBe('Image');
    expect(flatten(UNSAFE_getByProps({ testID: 'location-pin-art' }).props.style)).toMatchObject({ width: 43, height: 61 });
    expect(getByText('we use your location to show you potential matches in your area.')).toBeTruthy();
    expect(flatten(getByRole('button', { name: 'Set location services' }).props.style)).toMatchObject({
      width: '76%', minHeight: 48, borderRadius: 12,
    });
    expect(flatten(getByRole('button', { name: 'Not now' }).props.style)).toMatchObject({ marginTop: 16 });
    expect(flatten(getByTestId('location-permission-body').props.style)).toMatchObject({ paddingBottom: 0 });
  });
});

import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ReferenceIntroScreen } from '../ReferenceIntroScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | string | undefined>;
}

describe('ReferenceIntroScreen', () => {
  it('renders the supplied lobed-ring artwork behind its content, no back arrow', () => {
    const { UNSAFE_getByProps, queryByLabelText } = render(<ReferenceIntroScreen />);
    expect(UNSAFE_getByProps({ testID: 'reference-intro-pattern' })).toBeTruthy();
    expect(UNSAFE_getByProps({ testID: 'reference-intro-lobed-pattern' })).toBeTruthy();
    expect(queryByLabelText('Go back')).toBeNull();
  });

  it('uses artwork (not drawn text) for the logo, heading, and CTA', () => {
    const { getByTestId, getByRole } = render(<ReferenceIntroScreen />);

    expect(getByTestId('reference-intro-logo').type).toBe('Image');
    expect(getByTestId('reference-intro-heading').type).toBe('Image');
    expect(flatten(getByRole('button', { name: 'Find your Frinq' }).props.style)).toMatchObject({ width: '76%' });
  });
});

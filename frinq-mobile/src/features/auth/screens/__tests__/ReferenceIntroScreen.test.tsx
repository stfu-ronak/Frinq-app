import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ReferenceIntroScreen } from '../ReferenceIntroScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | string | undefined>;
}

describe('ReferenceIntroScreen', () => {
  it('renders the supplied lobed-line artwork behind its content', () => {
    const { UNSAFE_getByProps } = render(<ReferenceIntroScreen />);
    expect(UNSAFE_getByProps({ testID: 'reference-intro-pattern' })).toBeTruthy();
    expect(UNSAFE_getByProps({ testID: 'reference-intro-lobed-pattern' })).toBeTruthy();
  });

  it('uses the compact reference scale and rectangular CTA proportions', () => {
    const { getByTestId, getByRole } = render(<ReferenceIntroScreen />);

    expect(flatten(getByTestId('reference-intro-logo').props.style)).toMatchObject({ fontSize: 18, lineHeight: 30 });
    expect(flatten(getByTestId('reference-intro-heading').props.style)).toMatchObject({ fontSize: 28, lineHeight: 42 });
    expect(flatten(getByRole('button', { name: 'Find your Frinq' }).props.style)).toMatchObject({
      width: '86%', minHeight: 52, borderRadius: 12,
    });
  });
});

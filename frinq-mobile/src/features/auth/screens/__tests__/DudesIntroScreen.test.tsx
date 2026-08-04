import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { DudesIntroScreen } from '../DudesIntroScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | string | undefined>;
}

describe('DudesIntroScreen', () => {
  it('keeps the heading on one reference-scaled line and uses the rectangular CTA', () => {
    const { getByTestId, getByRole, UNSAFE_getByProps } = render(<DudesIntroScreen />);

    expect(flatten(getByTestId('dudes-intro-heading').props.style)).toMatchObject({ fontSize: 28, lineHeight: 42 });
    const art = UNSAFE_getByProps({ testID: 'dudes-intro-art' });
    expect(art.props.resizeMethod).toBe('scale');
    expect(flatten(art.props.style)).toMatchObject({ height: 270, marginTop: 104, flex: 0 });
    expect(flatten(getByRole('button', { name: "Let's go" }).props.style)).toMatchObject({
      width: '76%', minHeight: 48, borderRadius: 12,
    });
    expect(flatten(getByTestId('reference-cta-actions').props.style)).toMatchObject({ marginTop: 'auto' });
  });
});

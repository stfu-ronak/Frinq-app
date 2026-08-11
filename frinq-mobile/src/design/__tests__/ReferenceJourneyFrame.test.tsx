import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ReferenceJourneyFrame } from '../components/ReferenceJourneyFrame';

describe('ReferenceJourneyFrame', () => {
  it('renders a cream frame with an accessible back control', () => {
    const { getByLabelText, getByTestId } = render(
      <ReferenceJourneyFrame onBack={jest.fn()}>
        <Text>content</Text>
      </ReferenceJourneyFrame>,
    );

    expect(getByTestId('reference-journey-frame')).toBeTruthy();
    expect(getByLabelText('Go back')).toBeTruthy();
  });

  // A scroll screen's footer sits outside the scrollable content so its Y
  // position stays fixed regardless of how tall that content is (see the
  // `footer` prop doc comment) — but that only works if the footer's own
  // children stay centered instead of stretching to the full row width,
  // which is what makes a lone "skip" link render flush-left instead of
  // centered under the arrow above it.
  it('centers footer content horizontally, same as the scrollable body', () => {
    const { getByTestId } = render(
      <ReferenceJourneyFrame onBack={jest.fn()} scroll footer={<Text>skip</Text>}>
        <Text>content</Text>
      </ReferenceJourneyFrame>,
    );

    const footerStyle = StyleSheet.flatten(getByTestId('reference-journey-footer').props.style as never) as Record<string, unknown>;
    expect(footerStyle).toMatchObject({ alignItems: 'center' });
  });
});

import React from 'react';
import { Text } from 'react-native';
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
});

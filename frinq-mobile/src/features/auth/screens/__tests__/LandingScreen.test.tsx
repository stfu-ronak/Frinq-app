import React from 'react';
import { render } from '@testing-library/react-native';
import { LandingScreen } from '../LandingScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock('../../../legal/pendingAcceptance', () => ({ loadPendingAcceptance: jest.fn() }));
jest.mock('../../../quiz/pendingQuizState', () => ({ loadPendingQuizState: jest.fn() }));

describe('LandingScreen', () => {
  it('uses the supplied logo and arrow artwork without an extra outer control border (the artwork already includes it)', () => {
    const { getByTestId, getByRole } = render(<LandingScreen />);
    expect(getByTestId('landing-logo').type).toBe('Image');
    expect(getByTestId('landing-next-arrow').type).toBe('Image');
    expect(getByRole('button', { name: 'Start finding your Frinq' }).props.style).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ borderWidth: expect.anything() })]),
    );
  });

  it('keeps the next arrow in the lower part of the landing composition', () => {
    const { getByTestId } = render(<LandingScreen />);
    expect(getByTestId('landing-arrow-wrap').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ marginTop: 'auto' })]));
  });
});

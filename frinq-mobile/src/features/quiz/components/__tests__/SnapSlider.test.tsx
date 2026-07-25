/**
 * Task 45 Step 3 gap: SnapSlider had zero test coverage despite being a
 * radio-group-like control with 5 selectable stops, each carrying its own
 * accessibilityState.selected — exactly the "incorrect selection state" and
 * "touch target minimum" categories the step calls out.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SnapSlider } from '../SnapSlider';
import { touchTarget } from '../../../../design/tokens/spacing';

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | undefined>;
}

const PROPS = {
  prompt: 'How do you spend a free Saturday?',
  leftLabel: 'plans with people',
  leftHint: 'social',
  rightLabel: 'time alone',
  rightHint: 'solo',
};

describe('SnapSlider', () => {
  it('exposes exactly one selected stop at a time, matching the current value', () => {
    const { getAllByRole } = render(<SnapSlider {...PROPS} value={50} onChange={jest.fn()} />);
    const dots = getAllByRole('button');
    expect(dots).toHaveLength(5);
    const selected = dots.filter((d) => d.props.accessibilityState?.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toBe('middle');
  });

  it('reports no stop selected when unanswered', () => {
    const { getAllByRole } = render(<SnapSlider {...PROPS} value={undefined} onChange={jest.fn()} />);
    const selected = getAllByRole('button').filter((d) => d.props.accessibilityState?.selected);
    expect(selected).toHaveLength(0);
  });

  it('tapping a stop reports its snap value', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<SnapSlider {...PROPS} value={50} onChange={onChange} />);
    fireEvent.press(getByLabelText('strongly right'));
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('every stop meets the token touch-target minimum', () => {
    const { getAllByRole } = render(<SnapSlider {...PROPS} value={50} onChange={jest.fn()} />);
    for (const dot of getAllByRole('button')) {
      const style = flatten(dot.props.style);
      expect(style.width).toBeGreaterThanOrEqual(touchTarget.min);
      expect(style.height).toBeGreaterThanOrEqual(touchTarget.min);
    }
  });

  it('exposes the whole control as one adjustable element with a min/max/now value, not five unrelated buttons', () => {
    const { getByLabelText } = render(<SnapSlider {...PROPS} value={75} onChange={jest.fn()} />);
    const adjustable = getByLabelText(PROPS.prompt);
    expect(adjustable.props.accessibilityRole).toBe('adjustable');
    expect(adjustable.props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 75 });
  });
});

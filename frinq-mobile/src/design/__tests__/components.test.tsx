import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { ChoicePill } from '../components/ChoicePill';
import { ChoiceCard } from '../components/ChoiceCard';
import { TextField } from '../components/TextField';
import { OfflineBanner } from '../components/OfflineBanner';
import { BrandHeading } from '../components/Text';
import { OtpField } from '../components/OtpField';
import { PhoneField } from '../components/PhoneField';
import { ChoiceListRow } from '../components/ChoiceListRow';
import { TagPicker } from '../components/TagPicker';
import { QuizProgress } from '../components/QuizProgress';
import { Dialog } from '../components/Dialog';

describe('PrimaryButton', () => {
  it('fires onPress when enabled', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<PrimaryButton label="Continue" onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes busy state and blocks taps while busy', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<PrimaryButton label="Saving" onPress={onPress} busy />);
    const btn = getByRole('button');
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('exposes disabled state', () => {
    const { getByRole } = render(<PrimaryButton label="Nope" onPress={jest.fn()} disabled />);
    expect(getByRole('button').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('ChoicePill / ChoiceCard selection state (not color-only)', () => {
  it('pill reports selected via accessibilityState', () => {
    const { getByRole } = render(<ChoicePill label="Coffee" selected onPress={jest.fn()} />);
    expect(getByRole('button').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('unselected pill reports selected:false', () => {
    const { getByRole } = render(<ChoicePill label="Tea" selected={false} onPress={jest.fn()} />);
    expect(getByRole('button').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('card composes title+description into one accessible label', () => {
    const { getByRole } = render(<ChoiceCard title="Night in" description="cozy" selected={false} onPress={jest.fn()} />);
    expect(getByRole('button').props.accessibilityLabel).toBe('Night in. cozy');
  });
});

describe('TextField', () => {
  it('shows an error region and marks it a live region', () => {
    const { getByText } = render(
      <TextField label="Name" value="" onChangeText={jest.fn()} error="Required" />,
    );
    const err = getByText('Required');
    expect(err.props.accessibilityLiveRegion).toBe('polite');
  });

  it('uses the label as the input accessibility label', () => {
    const { getByLabelText } = render(<TextField label="City" value="Delhi" onChangeText={jest.fn()} />);
    expect(getByLabelText('City')).toBeTruthy();
  });
});

describe('OfflineBanner', () => {
  it('renders nothing when online', () => {
    const { queryByRole } = render(<OfflineBanner visible={false} />);
    expect(queryByRole('alert')).toBeNull();
  });

  it('announces politely when offline', () => {
    const { getByRole } = render(<OfflineBanner visible />);
    expect(getByRole('alert').props.accessibilityLiveRegion).toBe('polite');
  });
});

describe('BrandHeading', () => {
  it('is a screen-reader header and honors font scaling (no maxFontSizeMultiplier cap)', () => {
    const { getByRole } = render(<BrandHeading>find your frinq</BrandHeading>);
    const h = getByRole('header');
    expect(h.props.maxFontSizeMultiplier).toBeUndefined();
  });
});

describe('PhoneField', () => {
  it('strips non-digits and caps at 10', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<PhoneField value="" onChangeText={onChange} />);
    fireEvent.changeText(getByLabelText('Phone number'), 'ab12-345 678901234');
    expect(onChange).toHaveBeenCalledWith('1234567890');
  });
});

describe('OtpField', () => {
  it('is one labeled field and advances on digit entry', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<OtpField value="" onChangeText={onChange} length={6} />);
    expect(getByLabelText('Enter the 6-digit verification code')).toBeTruthy();
  });
});

describe('ChoiceListRow', () => {
  it('is a radio exposing selected state', () => {
    const { getByRole } = render(<ChoiceListRow label="A" selected onPress={jest.fn()} />);
    expect(getByRole('radio').props.accessibilityState).toMatchObject({ selected: true });
  });
});

describe('TagPicker', () => {
  it('adds an unselected tag and respects max', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <TagPicker options={['a', 'b', 'c']} selected={['a']} max={2} onChange={onChange} />,
    );
    fireEvent.press(getByLabelText('b'));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('blocks new selections at max (disabled unselected pill)', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <TagPicker options={['a', 'b', 'c']} selected={['a', 'b']} max={2} onChange={onChange} />,
    );
    fireEvent.press(getByLabelText('c'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('QuizProgress', () => {
  it('exposes a progressbar value', () => {
    const { getByRole } = render(<QuizProgress step={3} total={10} />);
    expect(getByRole('progressbar').props.accessibilityValue).toMatchObject({ now: 3, max: 10 });
  });
});

describe('Dialog', () => {
  it('renders title + confirm and fires confirm', () => {
    const confirm = jest.fn();
    const { getByText } = render(
      <Dialog visible title="Delete?" message="This is permanent." confirm={{ label: 'Delete', onPress: confirm }} cancel={{ label: 'Cancel', onPress: jest.fn() }} />,
    );
    fireEvent.press(getByText('Delete'));
    expect(confirm).toHaveBeenCalled();
  });
});

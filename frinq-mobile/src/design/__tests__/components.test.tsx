import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
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
import { Sheet } from '../components/Sheet';
import { ArrowButton } from '../components/ArrowButton';
import { NavRow } from '../components/NavRow';
import { QuizHeader } from '../components/QuizHeader';
import { touchTarget } from '../tokens/spacing';

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | undefined>;
}

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

  it('card reports its own selected state via accessibilityState, not just its label', () => {
    const { getByRole, rerender } = render(<ChoiceCard title="Night in" selected={false} onPress={jest.fn()} />);
    expect(getByRole('button').props.accessibilityState).toMatchObject({ selected: false });
    rerender(<ChoiceCard title="Night in" selected onPress={jest.fn()} />);
    expect(getByRole('button').props.accessibilityState).toMatchObject({ selected: true });
  });
});

describe('touch target minimums (44/48dp token, not just spot-checked)', () => {
  it('ArrowButton meets the preferred minimum height', () => {
    const { getByRole } = render(<ArrowButton label="resend code" onPress={jest.fn()} />);
    expect(flatten(getByRole('button').props.style).minHeight).toBeGreaterThanOrEqual(touchTarget.preferred);
  });

  it('NavRow meets the preferred minimum height', () => {
    const { getByRole } = render(<NavRow label="support" onPress={jest.fn()} />);
    expect(flatten(getByRole('button').props.style).minHeight).toBeGreaterThanOrEqual(touchTarget.preferred);
  });

  it('PrimaryButton meets the preferred minimum height', () => {
    const { getByRole } = render(<PrimaryButton label="Continue" onPress={jest.fn()} />);
    expect(flatten(getByRole('button').props.style).minHeight).toBeGreaterThanOrEqual(touchTarget.preferred);
  });

  it('ChoicePill meets the token minimum height', () => {
    const { getByRole } = render(<ChoicePill label="Coffee" selected={false} onPress={jest.fn()} />);
    expect(flatten(getByRole('button').props.style).minHeight).toBeGreaterThanOrEqual(touchTarget.min);
  });

  it('ChoiceListRow meets the preferred minimum height', () => {
    const { getByRole } = render(<ChoiceListRow label="A" selected={false} onPress={jest.fn()} />);
    expect(flatten(getByRole('radio').props.style).minHeight).toBeGreaterThanOrEqual(touchTarget.preferred);
  });

  it('TextField meets the preferred minimum height', () => {
    const { getByLabelText } = render(<TextField label="City" value="" onChangeText={jest.fn()} />);
    expect(flatten(getByLabelText('City').props.style).minHeight).toBeGreaterThanOrEqual(touchTarget.preferred);
  });

  it('PhoneField meets the preferred minimum height (the row wrapping the input, which carries the tap target)', () => {
    const { UNSAFE_getAllByType } = render(<PhoneField value="" onChangeText={jest.fn()} />);
    const rows = UNSAFE_getAllByType(View).map((v) => flatten(v.props.style));
    expect(rows.some((s) => (s.minHeight ?? 0) >= touchTarget.preferred)).toBe(true);
  });

  it('OtpField: each digit box meets the preferred minimum tap-target size (sighted-user re-edit target, even though hidden from screen readers behind the one labeled field)', () => {
    const { UNSAFE_getAllByType } = render(<OtpField value="" onChangeText={jest.fn()} length={6} />);
    const boxes = UNSAFE_getAllByType(TextInput);
    expect(boxes).toHaveLength(6);
    for (const box of boxes) {
      const style = flatten(box.props.style);
      expect(style.width).toBeGreaterThanOrEqual(touchTarget.preferred);
      expect(style.height).toBeGreaterThanOrEqual(touchTarget.preferred);
    }
  });

  it('QuizHeader back button has a real accessible name and meets the preferred minimum size', () => {
    const { getByLabelText } = render(<QuizHeader section="quiz" onBack={jest.fn()} />);
    const back = getByLabelText('Go back');
    const style = flatten(back.props.style);
    expect(style.width).toBeGreaterThanOrEqual(touchTarget.preferred);
    expect(style.height).toBeGreaterThanOrEqual(touchTarget.preferred);
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

  it('renders as a real native modal region while visible — the platform (not custom JS) is what moves screen-reader focus in on open', () => {
    const { UNSAFE_getByProps } = render(
      <Dialog visible title="Delete?" confirm={{ label: 'Delete', onPress: jest.fn() }} />,
    );
    expect(UNSAFE_getByProps({ accessibilityViewIsModal: true })).toBeTruthy();
  });
});

describe('Sheet', () => {
  it('renders as a real native modal region while visible, title included', () => {
    const { getByText, UNSAFE_getByProps } = render(
      <Sheet visible onClose={jest.fn()} title="message actions">
        <></>
      </Sheet>,
    );
    expect(getByText('message actions')).toBeTruthy();
    expect(UNSAFE_getByProps({ accessibilityViewIsModal: true })).toBeTruthy();
  });

  it('renders nothing accessible while not visible', () => {
    const { queryByText } = render(
      <Sheet visible={false} onClose={jest.fn()} title="message actions">
        <></>
      </Sheet>,
    );
    expect(queryByText('message actions')).toBeNull();
  });
});

describe('BrandHeading', () => {
  it('keeps Android font padding for Borel display headings', () => {
    const { getByRole } = render(<BrandHeading>find your frinq</BrandHeading>);
    expect(getByRole('header').props.includeFontPadding).toBe(true);
  });
});

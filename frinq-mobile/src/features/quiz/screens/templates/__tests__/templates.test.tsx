import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { IntroTemplate } from '../IntroTemplate';
import { TextInputTemplate } from '../TextInputTemplate';
import { DateInputTemplate } from '../DateInputTemplate';
import { SingleChoiceCardTemplate } from '../SingleChoiceCardTemplate';
import { SingleChoiceListTemplate } from '../SingleChoiceListTemplate';
import { MultiChoiceTagsTemplate } from '../MultiChoiceTagsTemplate';
import { RapidFireTemplate } from '../RapidFireTemplate';
import { OpinionsTemplate } from '../OpinionsTemplate';
import { PreferencesTemplate } from '../PreferencesTemplate';
import { VoiceOrTextTemplate } from '../VoiceOrTextTemplate';
import {
  IntroStep, TextStep, DateStep, SingleChoiceCardStep, SingleChoiceListStep,
  MultiChoiceTagsStep, RapidFireStep, OpinionsStep, PreferencesStep, VoiceOrTextStep,
} from '../../../domain/quizDefinition';

jest.mock('../../../../../services/session/sessionContext', () => ({
  useSession: () => ({ apiClient: { request: jest.fn() } }),
}));

describe('IntroTemplate', () => {
  it('fires onContinue on CTA press', () => {
    const step: IntroStep = { id: 'i', kind: 'intro', section: 'x', heading: 'Hi', ctaLabel: 'go' };
    const onContinue = jest.fn();
    const { getByRole } = render(<IntroTemplate step={step} onContinue={onContinue} />);
    fireEvent.press(getByRole('button', { name: 'go' }));
    expect(onContinue).toHaveBeenCalled();
  });
});

describe('TextInputTemplate', () => {
  const step: TextStep = { id: 'name', kind: 'text', section: 'basics', answerKey: 'name', prompt: 'name?', minLength: 2 };

  it('disables continue below minLength and enables at/above it', () => {
    const { getByLabelText, getByRole, rerender } = render(
      <TextInputTemplate step={step} value="" onChange={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(true);
    rerender(<TextInputTemplate step={step} value="Ada" onChange={jest.fn()} onContinue={jest.fn()} />);
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(false);
    expect(getByLabelText('name?')).toBeTruthy();
  });
});

describe('DateInputTemplate', () => {
  const step: DateStep = { id: 'age', kind: 'date', section: 'basics', answerKey: 'dob', prompt: 'dob?' };

  it('shows an error only after Continue is pressed with an invalid date', () => {
    const { getByLabelText, getByRole, queryByText } = render(
      <DateInputTemplate step={step} value="99/99/2020" onChange={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(queryByText(/real date/)).toBeNull();
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(queryByText(/real date/)).toBeTruthy();
    expect(getByLabelText('day')).toBeTruthy();
  });

  it('rejects under-18 with the correct copy and does not call onContinue', () => {
    const onContinue = jest.fn();
    const recentYear = new Date().getFullYear() - 5;
    const { getByRole, findByText } = render(
      <DateInputTemplate step={step} value={`01/01/${recentYear}`} onChange={jest.fn()} onContinue={onContinue} />,
    );
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(onContinue).not.toHaveBeenCalled();
    return findByText('frinq is for 18+ right now');
  });

  it('calls onContinue for a valid adult date', () => {
    const onContinue = jest.fn();
    const { getByRole } = render(
      <DateInputTemplate step={step} value="14/03/1999" onChange={jest.fn()} onContinue={onContinue} />,
    );
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(onContinue).toHaveBeenCalled();
  });
});

describe('SingleChoiceCardTemplate', () => {
  const step: SingleChoiceCardStep = {
    id: 'social_type', kind: 'singleChoiceCard', section: 'x', answerKey: 'social_type', prompt: 'p?',
    options: [{ value: 'introvert', label: 'introvert' }, { value: 'extrovert', label: 'extrovert' }],
    allowCustom: true, customLabel: 'other',
  };

  it('selecting an option calls onSelect with its value immediately', () => {
    const onSelect = jest.fn();
    const { getByText } = render(<SingleChoiceCardTemplate step={step} value="" onSelect={onSelect} />);
    fireEvent.press(getByText('introvert'));
    expect(onSelect).toHaveBeenCalledWith('introvert');
  });

  it('submitting custom text calls onSelect with the trimmed text', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(<SingleChoiceCardTemplate step={step} value="" onSelect={onSelect} />);
    const input = getByLabelText('other');
    fireEvent.changeText(input, '  something else  ');
    fireEvent(input, 'submitEditing');
    expect(onSelect).toHaveBeenCalledWith('something else');
  });
});

describe('SingleChoiceListTemplate', () => {
  const step: SingleChoiceListStep = {
    id: 'trip', kind: 'singleChoiceList', section: 'x', answerKey: 'trip', prompt: 'p?',
    options: [{ value: 'a', label: 'Option A' }, { value: 'b', label: 'Option B' }],
  };

  it('selecting a row calls onSelect with its value', () => {
    const onSelect = jest.fn();
    const { getByText } = render(<SingleChoiceListTemplate step={step} value="" onSelect={onSelect} />);
    fireEvent.press(getByText('Option B'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });
});

describe('MultiChoiceTagsTemplate', () => {
  const step: MultiChoiceTagsStep = {
    id: 'scene', kind: 'multiChoiceTags', section: 'x', answerKey: 'scene', prompt: 'p?',
    options: ['a', 'b', 'c'], min: 1,
  };

  it('disables continue with zero selections and enables with one', () => {
    const { getByRole, rerender } = render(
      <MultiChoiceTagsTemplate step={step} value={[]} onChange={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(true);
    rerender(<MultiChoiceTagsTemplate step={step} value={['a']} onChange={jest.fn()} onContinue={jest.fn()} />);
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(false);
  });
});

describe('RapidFireTemplate', () => {
  const step: RapidFireStep = {
    id: 'rapid_fire', kind: 'rapidFire', section: 'x', answerKey: 'rapid', secondsPerPair: 5,
    pairs: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('calls onComplete with both chosen answers after answering each pair', () => {
    const onComplete = jest.fn();
    const { getByText } = render(<RapidFireTemplate step={step} onComplete={onComplete} />);
    fireEvent.press(getByText('A1'));
    fireEvent.press(getByText('B2'));
    expect(onComplete).toHaveBeenCalledWith(['A1', 'B2']);
  });

  it('auto-picks a side when the timer runs out', () => {
    const onComplete = jest.fn();
    render(<RapidFireTemplate step={step} onComplete={onComplete} />);
    // Advance one second at a time so each effect-scheduled setTimeout is
    // re-armed and flushed before the next tick — a single large jump can
    // outrun React's effect scheduling under fake timers.
    for (let i = 0; i < 12; i++) {
      act(() => jest.advanceTimersByTime(1000));
    }
    expect(onComplete).toHaveBeenCalled();
    expect(onComplete.mock.calls[0][0]).toHaveLength(2);
  });
});

describe('OpinionsTemplate', () => {
  const step: OpinionsStep = {
    id: 'opinions', kind: 'opinions', section: 'x', answerKey: 'opinions',
    pairs: [{ prompt: 'p1', a: 'A1', b: 'B1' }, { prompt: 'p2', a: 'A2', b: 'B2' }],
  };

  it('advances through pairs in sequence and calls onComplete with all answers', () => {
    const onComplete = jest.fn();
    const { getByText } = render(<OpinionsTemplate step={step} onComplete={onComplete} />);
    expect(getByText('p1')).toBeTruthy();
    fireEvent.press(getByText('A1'));
    expect(getByText('p2')).toBeTruthy();
    fireEvent.press(getByText('B2'));
    expect(onComplete).toHaveBeenCalledWith(['A1', 'B2']);
  });
});

describe('PreferencesTemplate', () => {
  const step: PreferencesStep = {
    id: 'preferences', kind: 'preferences', section: 'x', answerKey: 'preferences',
    sliders: [
      { prompt: 's1', leftLabel: 'L1', leftHint: 'l1', rightLabel: 'R1', rightHint: 'r1' },
      { prompt: 's2', leftLabel: 'L2', leftHint: 'l2', rightLabel: 'R2', rightHint: 'r2' },
    ],
  };

  it('disables continue until every slider has a value', () => {
    const { getByRole, getAllByLabelText, rerender } = render(
      <PreferencesTemplate step={step} values={[undefined, undefined]} onChange={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(true);
    rerender(<PreferencesTemplate step={step} values={[50, 75]} onChange={jest.fn()} onContinue={jest.fn()} />);
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(false);
    // Every slider always renders a "middle" dot as one of its 5 fixed
    // positions — one per slider — regardless of which value is selected.
    const middleDots = getAllByLabelText('middle');
    expect(middleDots).toHaveLength(step.sliders.length);
    expect(middleDots[0].props.accessibilityState.selected).toBe(true); // slider 0's value is 50
  });

  it('tapping a snap point reports its index and value', () => {
    const onChange = jest.fn();
    const { getAllByLabelText } = render(
      <PreferencesTemplate step={step} values={[undefined, undefined]} onChange={onChange} onContinue={jest.fn()} />,
    );
    fireEvent.press(getAllByLabelText('strongly right')[0]);
    expect(onChange).toHaveBeenCalledWith(0, 100);
  });
});

describe('VoiceOrTextTemplate', () => {
  const step: VoiceOrTextStep = { id: 'story', kind: 'voiceOrText', section: 'x', answerKey: 'story', heading: 'Tell us' };

  it('disables continue when empty and enables once text is entered', () => {
    const { getByRole, rerender } = render(
      <VoiceOrTextTemplate step={step} submissionId="sub-1" value="" onChange={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(true);
    rerender(<VoiceOrTextTemplate step={step} submissionId="sub-1" value="a story" onChange={jest.fn()} onContinue={jest.fn()} />);
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(false);
  });
});

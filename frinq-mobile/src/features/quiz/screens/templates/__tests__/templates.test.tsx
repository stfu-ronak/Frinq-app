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
import { SocialVerificationTemplate } from '../SocialVerificationTemplate';
import { SnapSlider } from '../../../components/SnapSlider';
import { QuizScreenFrame } from '../../../components/QuizScreenFrame';
import {
  IntroStep, TextStep, DateStep, SingleChoiceCardStep, SingleChoiceListStep,
  MultiChoiceTagsStep, RapidFireStep, OpinionsStep, PreferencesStep, VoiceOrTextStep,
  SocialVerificationStep, SliderStep,
} from '../../../domain/quizDefinition';

jest.mock('../../../../../services/session/sessionContext', () => ({
  useSession: () => ({ apiClient: { request: jest.fn() } }),
}));

// VoiceAnswer's own recording/upload behavior is covered by its dedicated
// test file — here it's mocked down to just the onStatusChange contract
// VoiceOrTextTemplate actually depends on.
let mockVoiceAnswerStatus: ((hasSavedRecording: boolean) => void) | undefined;
jest.mock('../../../components/VoiceAnswer', () => ({
  VoiceAnswer: (props: { onStatusChange?: (v: boolean) => void }) => {
    mockVoiceAnswerStatus = props.onStatusChange;
    return null;
  },
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

  it('does not re-show a stale error while mid-edit after a prior invalid Continue press', () => {
    // Regression for: touched latched true on Continue and never reset, so
    // editing month down to a single digit ("3" before "03") re-triggered the
    // error on every keystroke instead of only after a completed attempt.
    const onChange = jest.fn();
    const { getByRole, getByLabelText, queryByText, rerender } = render(
      <DateInputTemplate step={step} value="14/99/1999" onChange={onChange} onContinue={jest.fn()} />,
    );
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(queryByText(/real date/)).toBeTruthy();

    fireEvent.changeText(getByLabelText('month'), '3');
    expect(onChange).toHaveBeenCalledWith('14/3/1999');
    rerender(<DateInputTemplate step={step} value="14/3/1999" onChange={onChange} onContinue={jest.fn()} />);
    expect(queryByText(/real date/)).toBeNull();
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

  it('renders a Continue button (disabled until a card or custom text is provided) when allowCustom is set', () => {
    // Regression: typing into the custom field had no on-screen way to submit
    // besides the keyboard's "done" action.
    const onSelect = jest.fn();
    const { getByRole, getByLabelText } = render(
      <SingleChoiceCardTemplate step={step} value="" onSelect={onSelect} />,
    );
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(getByLabelText('other'), 'something else');
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(false);
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(onSelect).toHaveBeenCalledWith('something else');
  });

  it('does not render a Continue button when allowCustom is not set', () => {
    const noCustomStep: SingleChoiceCardStep = { ...step, allowCustom: false };
    const { queryByRole } = render(<SingleChoiceCardTemplate step={noCustomStep} value="" onSelect={jest.fn()} />);
    expect(queryByRole('button', { name: 'continue' })).toBeNull();
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

  it('simple chrome: selecting only highlights, Continue commits the pending value', () => {
    const simpleStep: SingleChoiceListStep = { ...step, chrome: 'simple' };
    const onSelect = jest.fn();
    const { getByText, getByRole } = render(
      <SingleChoiceListTemplate step={simpleStep} value="" onSelect={onSelect} />,
    );
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(getByText('Option B'));
    expect(onSelect).not.toHaveBeenCalled(); // selecting alone doesn't advance in simple chrome
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(false);
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('box variant renders tall options with an "or" divider between them', () => {
    const boxStep: SingleChoiceListStep = { ...step, chrome: 'simple', variant: 'box' };
    const onSelect = jest.fn();
    const { getByText, queryByText } = render(
      <SingleChoiceListTemplate step={boxStep} value="" onSelect={onSelect} />,
    );
    expect(queryByText('or')).toBeTruthy();
    fireEvent.press(getByText('Option A'));
    expect(onSelect).not.toHaveBeenCalled();
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

  it('layout "list" renders full-width rows instead of wrapping chips', () => {
    const listStep: MultiChoiceTagsStep = { ...step, layout: 'list' };
    const onChange = jest.fn();
    const { getByText } = render(
      <MultiChoiceTagsTemplate step={listStep} value={[]} onChange={onChange} onContinue={jest.fn()} />,
    );
    fireEvent.press(getByText('b'));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('allowCustom folds "anything else" text into the answer array alongside chip selections', () => {
    const customStep: MultiChoiceTagsStep = { ...step, allowCustom: true };
    const onChange = jest.fn();
    const { getByLabelText, rerender } = render(
      <MultiChoiceTagsTemplate step={customStep} value={['a']} onChange={onChange} onContinue={jest.fn()} />,
    );
    fireEvent.changeText(getByLabelText('anything else?'), 'my own thing');
    expect(onChange).toHaveBeenCalledWith(['a', 'my own thing']);
    rerender(<MultiChoiceTagsTemplate step={customStep} value={['a', 'my own thing']} onChange={onChange} onContinue={jest.fn()} />);
    fireEvent.changeText(getByLabelText('anything else?'), '');
    expect(onChange).toHaveBeenLastCalledWith(['a']);
  });
});

describe('RapidFireTemplate', () => {
  const step: RapidFireStep = {
    id: 'rapid_fire', kind: 'rapidFire', section: 'x', answerKey: 'rapid', secondsPerPair: 5,
    pairs: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('tapping a side only highlights it; Next commits the choice and advances', () => {
    const onComplete = jest.fn();
    const { getByText, getByRole } = render(<RapidFireTemplate step={step} onComplete={onComplete} />);
    fireEvent.press(getByText('A1'));
    expect(onComplete).not.toHaveBeenCalled(); // selecting alone doesn't advance
    expect(getByRole('button', { name: 'Next' }).props.accessibilityState.disabled).toBe(false);
    fireEvent.press(getByRole('button', { name: 'Next' }));
    fireEvent.press(getByText('B2'));
    fireEvent.press(getByRole('button', { name: 'Next' }));
    expect(onComplete).toHaveBeenCalledWith(['A1', 'B2']);
  });

  it('Next is disabled until a side is chosen', () => {
    const { getByRole } = render(<RapidFireTemplate step={step} onComplete={jest.fn()} />);
    expect(getByRole('button', { name: 'Next' }).props.accessibilityState.disabled).toBe(true);
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

  it('advances through pairs in sequence and calls onComplete with all picks, no whys when none configured', () => {
    const onComplete = jest.fn();
    const { getByText } = render(<OpinionsTemplate step={step} submissionId="sub-1" onComplete={onComplete} />);
    expect(getByText('p1')).toBeTruthy();
    fireEvent.press(getByText('A1'));
    expect(getByText('p2')).toBeTruthy();
    fireEvent.press(getByText('B2'));
    expect(onComplete).toHaveBeenCalledWith(['A1', 'B2'], []);
  });

  it('runs a batched why-phase after every pick when pairs have whyPrompt', () => {
    const whyStep: OpinionsStep = {
      id: 'opinions', kind: 'opinions', section: 'x', answerKey: 'opinions', whyAnswerKey: 'opinions_why',
      pairs: [
        { prompt: 'p1', a: 'A1', b: 'B1', whyPrompt: 'why1?' },
        { prompt: 'p2', a: 'A2', b: 'B2', whyPrompt: 'why2?' },
      ],
    };
    const onComplete = jest.fn();
    const { getByText, getByPlaceholderText, queryByText } = render(
      <OpinionsTemplate step={whyStep} submissionId="sub-1" onComplete={onComplete} />,
    );
    fireEvent.press(getByText('A1'));
    fireEvent.press(getByText('B2'));
    // Picks phase done — batched why-phase starts, not interleaved with picks.
    expect(queryByText('p1')).toBeNull();
    expect(getByText('why1?')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('genuinely curious...'), 'because reasons');
    fireEvent.press(getByText('continue'));
    expect(getByText('why2?')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('genuinely curious...'), 'other reasons');
    fireEvent.press(getByText('continue'));
    expect(onComplete).toHaveBeenCalledWith(['A1', 'B2'], ['because reasons', 'other reasons']);
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

  it('shows one statement per screen and disables continue until it has a value', () => {
    const { getByRole, getByText, queryByText, rerender } = render(
      <PreferencesTemplate step={step} values={[undefined, undefined]} onChange={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(getByText('s1')).toBeTruthy();
    expect(queryByText('s2')).toBeNull(); // not all sliders on one page
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(true);
    rerender(<PreferencesTemplate step={step} values={[50, undefined]} onChange={jest.fn()} onContinue={jest.fn()} />);
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(false);
  });

  it('advances to the next statement on continue, then fires onContinue once after the last', () => {
    const onContinue = jest.fn();
    const { getByRole, getByText, queryByText, rerender } = render(
      <PreferencesTemplate step={step} values={[50, undefined]} onChange={jest.fn()} onContinue={onContinue} />,
    );
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(queryByText('s1')).toBeNull();
    expect(getByText('s2')).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();

    rerender(<PreferencesTemplate step={step} values={[50, 75]} onChange={jest.fn()} onContinue={onContinue} />);
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('tapping a snap point reports the current slider index and value', () => {
    const onChange = jest.fn();
    const { getAllByLabelText, getByRole } = render(
      <PreferencesTemplate step={step} values={[50, undefined]} onChange={onChange} onContinue={jest.fn()} />,
    );
    fireEvent.press(getAllByLabelText('strongly right')[0]);
    expect(onChange).toHaveBeenCalledWith(0, 100);

    fireEvent.press(getByRole('button', { name: 'continue' }));
    fireEvent.press(getAllByLabelText('strongly left')[0]);
    expect(onChange).toHaveBeenCalledWith(1, 0);
  });
});

describe('slider step (QuizStepScreen inline case)', () => {
  // No dedicated SliderTemplate file exists — QuizStepScreen renders SnapSlider
  // directly inside QuizScreenFrame for kind: 'slider'. This harness mirrors
  // that exact case body (local value state, gated Continue) rather than
  // standing up the full QuizStepScreen (navigation/quizContext) for one case.
  function SliderCase({ step, onContinue }: { step: SliderStep; onContinue: (value: number | undefined) => void }) {
    const [value, setValue] = React.useState<number | undefined>(undefined);
    return (
      <QuizScreenFrame
        stepId={step.id}
        section={step.section}
        continueLabel="continue"
        onContinue={() => onContinue(value)}
        continueDisabled={value === undefined}
      >
        <SnapSlider
          prompt={step.prompt}
          leftLabel={step.leftLabel}
          leftHint={step.leftHint}
          rightLabel={step.rightLabel}
          rightHint={step.rightHint}
          value={value}
          onChange={setValue}
        />
      </QuizScreenFrame>
    );
  }

  it('renders a single slider step and reports its value on continue', () => {
    const step: SliderStep = {
      id: 'custom_slider', kind: 'slider', section: 'content', answerKey: 'custom_slider',
      prompt: 'you trust more', leftLabel: 'what you see', leftHint: 'see', rightLabel: 'what you sense', rightHint: 'sense',
    };
    const onContinue = jest.fn();
    const { getByRole, getByLabelText } = render(<SliderCase step={step} onContinue={onContinue} />);
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(getByLabelText('strongly right'));
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(false);
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(onContinue).toHaveBeenCalledWith(100);
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

  it('enables continue for a voice-only answer, with no typed text at all', () => {
    // Regression: a saved recording never fed into `valid`, so a voice-only
    // answer had no way to proceed.
    mockVoiceAnswerStatus = undefined;
    const { getByRole } = render(
      <VoiceOrTextTemplate step={step} submissionId="sub-1" value="" onChange={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(true);
    act(() => mockVoiceAnswerStatus?.(true));
    expect(getByRole('button', { name: 'continue' }).props.accessibilityState.disabled).toBe(false);
  });
});

describe('SocialVerificationTemplate', () => {
  const step: SocialVerificationStep = {
    id: 'social_verification', kind: 'socialVerification', section: 'basics', chrome: 'simple', showSkip: true,
    heading: 'social verification', linkedinAnswerKey: 'social_linkedin', instagramAnswerKey: 'social_instagram',
  };

  it('Skip advances with no content required in either field', () => {
    const onSkip = jest.fn();
    const { getByText } = render(
      <SocialVerificationTemplate
        step={step} linkedin="" instagram=""
        onChangeLinkedin={jest.fn()} onChangeInstagram={jest.fn()}
        onContinue={jest.fn()} onSkip={onSkip}
      />,
    );
    fireEvent.press(getByText('skip'));
    expect(onSkip).toHaveBeenCalled();
  });

  it('Continue also advances with no content required (both fields optional)', () => {
    const onContinue = jest.fn();
    const { getByRole } = render(
      <SocialVerificationTemplate
        step={step} linkedin="" instagram=""
        onChangeLinkedin={jest.fn()} onChangeInstagram={jest.fn()}
        onContinue={onContinue} onSkip={jest.fn()}
      />,
    );
    fireEvent.press(getByRole('button', { name: 'continue' }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('typing into a field calls the matching onChange callback', () => {
    const onChangeLinkedin = jest.fn();
    const { getByLabelText } = render(
      <SocialVerificationTemplate
        step={step} linkedin="" instagram=""
        onChangeLinkedin={onChangeLinkedin} onChangeInstagram={jest.fn()}
        onContinue={jest.fn()} onSkip={jest.fn()}
      />,
    );
    fireEvent.changeText(getByLabelText('your LinkedIn profile'), 'linkedin.com/in/me');
    expect(onChangeLinkedin).toHaveBeenCalledWith('linkedin.com/in/me');
  });
});

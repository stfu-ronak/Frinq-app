import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { PressableScale } from '../PressableScale';

describe('PressableScale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <PressableScale onPress={onPress}>
        <Text>tap me</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText('tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires a selection haptic on press-in by default', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { getByText } = render(
      <PressableScale onPress={() => {}}>
        <Text>tap me</Text>
      </PressableScale>,
    );
    fireEvent(getByText('tap me'), 'pressIn');
    expect(ReactNativeHapticFeedback.trigger).toHaveBeenCalledWith('selection', expect.anything());
  });

  it('skips the haptic under reduce-motion — press still works, just without motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const onPress = jest.fn();
    const { findByText, getByText } = render(
      <PressableScale onPress={onPress}>
        <Text>tap me</Text>
      </PressableScale>,
    );
    await findByText('tap me'); // let isReduceMotionEnabled's promise resolve
    fireEvent(getByText('tap me'), 'pressIn');
    expect(ReactNativeHapticFeedback.trigger).not.toHaveBeenCalled();

    fireEvent.press(getByText('tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('never fires the haptic when haptic={false}, regardless of motion setting', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { getByText } = render(
      <PressableScale onPress={() => {}} haptic={false}>
        <Text>tap me</Text>
      </PressableScale>,
    );
    fireEvent(getByText('tap me'), 'pressIn');
    expect(ReactNativeHapticFeedback.trigger).not.toHaveBeenCalled();
  });
});

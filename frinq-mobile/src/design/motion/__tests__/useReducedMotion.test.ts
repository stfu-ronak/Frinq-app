import { renderHook, waitFor, act } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from '../useReducedMotion';

describe('useReducedMotion', () => {
  it('starts false and adopts the OS value once it resolves', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false); // synchronous initial render, before the promise resolves
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('updates when the OS setting changes mid-session', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    let emit: ((v: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, handler) => {
      emit = handler as unknown as (v: boolean) => void;
      return { remove: jest.fn() } as any;
    });

    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));

    act(() => emit?.(true));
    expect(result.current).toBe(true);
  });

  it('unsubscribes its listener on unmount', async () => {
    const removeSpy = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: removeSpy } as any);

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True when the OS "reduce motion" setting is on. Motion helpers use this to
 *  drop spatial/scale/looping animation in favor of immediate/crossfade state
 *  without ever losing information. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}

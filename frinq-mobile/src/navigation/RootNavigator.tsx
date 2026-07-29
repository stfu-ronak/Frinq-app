import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BootState } from '../app/boot/bootMachine';
import { OfflineBanner } from '../design/components/OfflineBanner';
import { useIsOffline } from '../services/network/networkState';
import { AuthNavigator } from './AuthNavigator';
import { QuizNavigator } from './QuizNavigator';
import { MainTabs } from './MainTabs';
import { LegalGateNavigator } from './LegalGateNavigator';
import { ProcessingScreen } from '../features/vibe-report/screens/ProcessingScreen';
import { ErrorState } from '../design/components/ErrorState';
import { AppLaunchSplash, Placeholder } from './placeholders';

export type RootScreen =
  | 'splash'
  | 'auth'
  | 'legal'
  | 'quiz'
  | 'processing'
  | 'main'
  | 'error'
  | 'offline'
  | 'suspended'
  | 'banned';

/** Pure mapping from boot state to the single top-level screen. Keeping it pure
 *  makes routing exhaustively unit-testable without mounting navigators. */
export function screenForState(state: BootState): RootScreen {
  switch (state) {
    case 'checking': return 'splash';
    case 'authRequired': return 'auth';
    case 'legalRequired': return 'legal';
    case 'quizInProgress': return 'quiz';
    case 'processing': return 'processing';
    case 'active': return 'main';
    case 'suspended': return 'suspended';
    case 'banned': return 'banned';
    case 'offline': return 'offline';
    case 'error': return 'error';
  }
}

interface RootNavigatorProps {
  state: BootState;
  onLegalAccepted?: () => void;
  /** Called once finalizeQuiz succeeds — the server's onboarding_state has
   *  already flipped to profile_processing, so this just re-runs boot
   *  resolution to pick that up (never a client-side "quiz done" guess). */
  onQuizComplete?: () => void;
  /** Called once the vibe-report job reaches a terminal 'done' status — same
   *  re-resolve-from-server pattern as onQuizComplete/onLegalAccepted. */
  onProcessingComplete?: () => void;
  /** Manual retry from the offline boot screen (boot also auto-retries on
   *  reconnect). */
  onOfflineRetry?: () => void;
}

export function RootNavigator({
  state,
  onLegalAccepted = () => {},
  onQuizComplete = () => {},
  onProcessingComplete = () => {},
  onOfflineRetry = () => {},
}: RootNavigatorProps) {
  const offline = useIsOffline();
  const screen = screenForState(state);

  return (
    <View style={styles.fill}>
      <OfflineBanner visible={offline} />
      <View style={styles.fill}>{renderScreen(screen, { onLegalAccepted, onQuizComplete, onProcessingComplete, onOfflineRetry })}</View>
    </View>
  );
}

interface ScreenCallbacks {
  onLegalAccepted: () => void;
  onQuizComplete: () => void;
  onProcessingComplete: () => void;
  onOfflineRetry: () => void;
}

function renderScreen(screen: RootScreen, cb: ScreenCallbacks) {
  switch (screen) {
    case 'splash': return <AppLaunchSplash />;
    case 'auth': return <AuthNavigator />;
    case 'quiz': return <QuizNavigator onQuizComplete={cb.onQuizComplete} />;
    case 'main': return <MainTabs />;
    case 'legal': return <LegalGateNavigator onAccepted={cb.onLegalAccepted} />;
    case 'processing': return <ProcessingScreen onComplete={cb.onProcessingComplete} />;
    case 'offline':
      return (
        <View testID="screen-offline" style={styles.fill}>
          <ErrorState
            title="You're offline"
            message="We couldn't reach Frinq. Check your connection — we'll pick up automatically when you're back online."
            onRetry={cb.onOfflineRetry}
          />
        </View>
      );
    case 'error': return <Placeholder title="Something went wrong" note="retry / support" testID="screen-error" />;
    case 'suspended': return <Placeholder title="Account suspended" note="contact support" testID="screen-suspended" />;
    case 'banned': return <Placeholder title="Account banned" note="contact support" testID="screen-banned" />;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

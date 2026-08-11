import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../services/session/sessionContext';
import { UserResponse } from '../services/api/contracts';
import { QuizProvider } from '../features/quiz/quizContext';
import { QuizStepScreen, QuizStepRouteParams } from '../features/quiz/screens/QuizStepScreen';
import { QuizSubmissionService } from '../features/quiz/quizSubmissionService';
import { startQuiz, partialSave as partialSaveApi } from '../features/quiz/quizSyncService';
import { getEncryptedStore } from '../storage/encryptedStorage';
import { QuizDraftRepository, setDynamicAnswerKeys } from '../storage/quizDraftRepository';
import { answerKeyForStep, DEFAULT_CONTENT_STEPS, FIRST_STEP_ID, nextStep, QuizStep, setContentSteps } from '../features/quiz/domain/quizDefinition';
import { BootSplash } from './placeholders';
import { ErrorState } from '../design/components/ErrorState';

const Stack = createNativeStackNavigator<QuizStepRouteParams>();

interface ResolvedQuiz {
  submissionId: string;
  userId: string;
  initialStepId: string;
  repo: QuizDraftRepository;
}

/**
 * Authenticated quiz continuation. Resolves (in order): the local encrypted
 * draft for this user (fastest, covers app restart/backgrounding); if none
 * exists, a fresh quiz/start reusing whatever non-terminal submission the
 * server already has for this phone, starting at the first step after
 * `name` (a wiped-local-storage device genuinely can't know exactly where a
 * user left off without a dedicated "current answers" endpoint — the web
 * reference has the identical limitation, this isn't a native regression).
 */
export function QuizNavigator({ onQuizComplete }: { onQuizComplete: () => void }) {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  const [resolved, setResolved] = useState<ResolvedQuiz | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResolveFailed(false);
    (async () => {
      // Shared query key with BootController's own /users/me fetch — if boot
      // resolved within the last 30s (staleTime), this reuses that cached
      // result instead of a second network round-trip right after it.
      const user = await queryClient.fetchQuery({
        queryKey: ['currentUser'],
        queryFn: () => apiClient.request<UserResponse>({ path: '/api/v1/users/me' }),
      });
      // Admin-authored quiz config is decoupled from the mobile client for
      // now (its variant/kind fields were drifting from the app's design and
      // producing mismatched question UI) — always use today's compiled-in
      // content until that's revisited.
      const contentSteps: readonly QuizStep[] = DEFAULT_CONTENT_STEPS;
      if (cancelled) return;
      setContentSteps(contentSteps);
      setDynamicAnswerKeys(contentSteps.flatMap((step) => {
        const answerKey = answerKeyForStep(step);
        return answerKey === null ? [] : [answerKey];
      }));
      const store = await getEncryptedStore();
      const repo = new QuizDraftRepository({ store, now: () => Date.now() });
      const existing = repo.load(user.id);
      if (existing) {
        if (!cancelled) {
          setResolved({ submissionId: existing.submissionId, userId: user.id, initialStepId: existing.lastRoute, repo });
        }
        return;
      }
      const started = await startQuiz(apiClient, user.phone ?? '');
      if (!cancelled) {
        setResolved({
          submissionId: started.submission_id,
          userId: user.id,
          initialStepId: nextStep('name') ?? FIRST_STEP_ID,
          repo,
        });
      }
    })().catch(() => {
      // A boot/resume-time failure (offline, session hiccup) must not leave
      // an unhandled rejection or a screen stuck on the splash forever —
      // show a real retry affordance instead.
      if (!cancelled) setResolveFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [apiClient, attempt]);

  // Hoisted above the early returns (hooks must run unconditionally) so
  // QuizProvider's context value — which now memoizes on these — actually
  // gets a stable identity across re-renders instead of a fresh instance/
  // closure every time, per quizContext.tsx's memoization fix.
  const submissionService = useMemo(() => new QuizSubmissionService(apiClient), [apiClient]);

  const handleQuizComplete = useCallback(async () => {
    if (!resolved) return false;
    // The machine's current answers live in QuizStepScreen's context; read
    // them back off the draft (already persisted synchronously on every
    // ANSWER) rather than threading machine state through here.
    const draft = resolved.repo.load(resolved.userId);
    const outcome = await submissionService.finalize(resolved.submissionId, draft?.answers ?? {});
    if (outcome.kind === 'success') {
      onQuizComplete();
      return true;
    }
    // 'invalid'/'error' — report failure so the last step shows an error +
    // retry. finalize() dedupes in-flight calls, so retry is safe.
    return false;
  }, [resolved, submissionService, onQuizComplete]);

  if (resolveFailed) {
    return <ErrorState message="Couldn't load your quiz. Check your connection and try again." onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (!resolved) return <BootSplash />;

  return (
    <QuizProvider
      submissionId={resolved.submissionId}
      userId={resolved.userId}
      repo={resolved.repo}
      partialSave={(id, answers, lastRoute) => partialSaveApi(apiClient, id, answers, lastRoute)}
      onQuizComplete={handleQuizComplete}
    >
      {/* gestureEnabled: false — swipe-back would pop the route without going
          through QuizStepScreen's goBack(), which is the only path that also
          rewinds QuizMachine's internal step pointer. A gesture-popped route
          desyncs the two (visible step reverts, machine's pointer doesn't),
          so the next NEXT computes off the stale pointer and persists a
          lastRoute ahead of what's on screen. The explicit back arrow and
          Android hardware-back both already route through goBack(). */}
      {/* animationTypeForReplace is declared STATICALLY here, not set
          imperatively right before the replace call. QuizStepScreen's goBack()
          falls back to replace() whenever there's no push history (a resumed
          mid-quiz session mounts a single-entry stack), and a
          navigation.setOptions() issued in the same tick as the replace does
          not reliably apply to the outgoing screen first — so back animated
          like a forward push. The only replace this navigator ever performs
          IS that back-fallback, so pinning 'pop' here is always correct.
          animationDuration trims the default for a snappier back/next. */}
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationTypeForReplace: 'pop',
          animationDuration: 220,
          gestureEnabled: false,
        }}
        initialRouteName="Step"
      >
        <Stack.Screen name="Step" component={QuizStepScreen} initialParams={{ stepId: resolved.initialStepId }} />
      </Stack.Navigator>
    </QuizProvider>
  );
}

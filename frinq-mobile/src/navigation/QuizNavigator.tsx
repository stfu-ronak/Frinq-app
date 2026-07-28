import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSession } from '../services/session/sessionContext';
import { UserResponse } from '../services/api/contracts';
import { QuizProvider } from '../features/quiz/quizContext';
import { QuizStepScreen, QuizStepRouteParams } from '../features/quiz/screens/QuizStepScreen';
import { QuizSubmissionService } from '../features/quiz/quizSubmissionService';
import { startQuiz, partialSave as partialSaveApi } from '../features/quiz/quizSyncService';
import { fetchQuizConfig } from '../features/quiz/quizConfigService';
import { getEncryptedStore } from '../storage/encryptedStorage';
import { QuizDraftRepository, setDynamicAnswerKeys } from '../storage/quizDraftRepository';
import { answerKeyForStep, DEFAULT_CONTENT_STEPS, FIRST_STEP_ID, nextStep, ONBOARDING_PREFIX, QuizStep, setContentSteps } from '../features/quiz/domain/quizDefinition';
import { BootSplash } from './placeholders';
import { ErrorState } from '../design/components/ErrorState';

const Stack = createNativeStackNavigator<QuizStepRouteParams>();

interface ResolvedQuiz {
  submissionId: string;
  userId: string;
  initialStepId: string;
  repo: QuizDraftRepository;
}

function isValidContentSteps(steps: readonly QuizStep[]): boolean {
  if (steps.length === 0) return false;
  const onboardingIds = new Set(ONBOARDING_PREFIX.map((step) => step.id));
  return steps.every((step) => typeof step.id === 'string' && !onboardingIds.has(step.id));
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
  const [resolved, setResolved] = useState<ResolvedQuiz | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResolveFailed(false);
    (async () => {
      const user = await apiClient.request<UserResponse>({ path: '/api/v1/users/me' });
      let contentSteps: readonly QuizStep[];
      try {
        const config = await fetchQuizConfig(apiClient);
        if (!isValidContentSteps(config.steps)) throw new Error('invalid_quiz_config');
        contentSteps = config.steps;
      } catch {
        // Offline / backend hiccup — quiz still works with today's compiled-in content.
        contentSteps = DEFAULT_CONTENT_STEPS;
      }
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

  if (resolveFailed) {
    return <ErrorState message="Couldn't load your quiz. Check your connection and try again." onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (!resolved) return <BootSplash />;

  const submissionService = new QuizSubmissionService(apiClient);

  return (
    <QuizProvider
      submissionId={resolved.submissionId}
      userId={resolved.userId}
      repo={resolved.repo}
      partialSave={(id, answers, lastRoute) => partialSaveApi(apiClient, id, answers, lastRoute)}
      onQuizComplete={async () => {
        // The machine's current answers live in QuizStepScreen's context;
        // read them back off the draft (already persisted synchronously on
        // every ANSWER) rather than threading machine state through here.
        const draft = resolved.repo.load(resolved.userId);
        const outcome = await submissionService.finalize(resolved.submissionId, draft?.answers ?? {});
        if (outcome.kind === 'success') {
          onQuizComplete();
          return true;
        }
        // 'invalid'/'error' — report failure so the last step shows an error +
        // retry. finalize() dedupes in-flight calls, so retry is safe.
        return false;
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Step">
        <Stack.Screen name="Step" component={QuizStepScreen} initialParams={{ stepId: resolved.initialStepId }} />
      </Stack.Navigator>
    </QuizProvider>
  );
}

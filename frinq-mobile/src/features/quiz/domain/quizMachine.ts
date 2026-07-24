import { QuizDraftRepository } from '../../../storage/quizDraftRepository';
import { FIRST_STEP_ID, getStep, nextStep, previousStep, StepId } from './quizDefinition';

export interface QuizState {
  stepId: StepId;
  answers: Record<string, unknown>;
  submissionId: string;
}

export type QuizEvent =
  | { type: 'ANSWER'; key: string; value: unknown }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'GOTO'; stepId: StepId };

export interface PartialSaveFn {
  (submissionId: string, answers: Record<string, unknown>, lastRoute: string): Promise<boolean>;
}

/**
 * Owns quiz navigation + answer state for one submission. Local answer
 * updates save the encrypted draft FIRST (synchronous, never lost), then a
 * debounced partial-save reaches the owned server endpoint. Navigation never
 * blocks on the network — the plan's "only wait when the next step requires
 * confirmed server state" doesn't apply to any step in this linear quiz (no
 * step depends on a server-computed value to render), so NEXT is always
 * immediate; the debounce only affects when the *server* catches up.
 *
 * Back edits the SAME submission (never creates a second one) — it's just a
 * stepId change; answers already collected are preserved and can be
 * overwritten on re-visit.
 */
export class QuizMachine {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;

  constructor(
    private state: QuizState,
    private readonly repo: QuizDraftRepository,
    private readonly userId: string,
    private readonly partialSave: PartialSaveFn,
    debounceMs = 800,
  ) {
    this.debounceMs = debounceMs;
  }

  static start(submissionId: string, userId: string, repo: QuizDraftRepository, partialSave: PartialSaveFn, debounceMs?: number): QuizMachine {
    const existing = repo.load(userId);
    const state: QuizState =
      existing && existing.submissionId === submissionId
        ? { stepId: existing.lastRoute, answers: existing.answers, submissionId }
        : { stepId: FIRST_STEP_ID, answers: {}, submissionId };
    return new QuizMachine(state, repo, userId, partialSave, debounceMs);
  }

  getState(): Readonly<QuizState> {
    return this.state;
  }

  private persistDraft() {
    this.repo.save({
      submissionId: this.state.submissionId,
      userId: this.userId,
      lastRoute: this.state.stepId,
      answers: this.state.answers,
    });
  }

  private scheduleServerSync() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.partialSave(this.state.submissionId, this.state.answers, this.state.stepId).catch(() => {
        // Non-fatal: the encrypted local draft is already saved; a future
        // debounce tick (or app resume) retries the server sync.
      });
    }, this.debounceMs);
  }

  /** Flush the pending debounced sync immediately (e.g. before backgrounding). */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.partialSave(this.state.submissionId, this.state.answers, this.state.stepId).catch(() => {});
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  send(event: QuizEvent): void {
    switch (event.type) {
      case 'ANSWER': {
        this.state = { ...this.state, answers: { ...this.state.answers, [event.key]: event.value } };
        this.persistDraft();
        this.scheduleServerSync();
        return;
      }
      case 'NEXT': {
        const next = nextStep(this.state.stepId);
        if (!next) return; // already at the last step; the screen handles submission
        this.state = { ...this.state, stepId: next };
        this.persistDraft();
        return;
      }
      case 'BACK': {
        const prev = previousStep(this.state.stepId);
        if (!prev) return; // already at the first step
        this.state = { ...this.state, stepId: prev };
        this.persistDraft();
        return;
      }
      case 'GOTO': {
        if (!getStep(event.stepId)) return; // ignore unknown step ids
        this.state = { ...this.state, stepId: event.stepId };
        this.persistDraft();
        return;
      }
    }
  }
}

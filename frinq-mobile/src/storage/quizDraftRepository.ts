/**
 * Bounded, versioned, encrypted quiz-draft recovery. This module holds the pure
 * logic + validation; the actual AES-256 MMKV instance (key from Keychain) is
 * injected as a KeyValueStore by encryptedStorage.ts. The draft stores ONLY the
 * submission id, schema version, last safe route, bounded structured answers,
 * and sync metadata — never tokens, voice bytes, AI output, chat, or analytics.
 */
export interface KeyValueStore {
  getString(key: string): string | null | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const DRAFT_KEY = 'quiz_draft';
export const DRAFT_SCHEMA_VERSION = 1;

// Structured answer keys the quiz may persist (mirrors the web quiz-state keys,
// prefix dropped). Anything else is rejected — no free-form smuggling.
export const FIXED_ANSWER_KEYS: ReadonlySet<string> = new Set([
  'name', 'city', 'dob', 'gender', 'pronoun', 'social_linkedin', 'social_instagram',
  'social_type', 'saturday', 'scene', 'hobbies', 'interests',
  'trip', 'travel_style', 'connection_mode', 'event_yes', 'event_no', 'would_rather',
  'meeting_style', 'show_up', 'connection', 'red_flags', 'rapid', 'opinions',
  'opinions_why', 'preferences', 'story', 'looking_for',
]);

let _dynamicAnswerKeys: ReadonlySet<string> = new Set();

/** Called once by QuizNavigator after resolving the active quiz_config's
 *  content steps — unions every content step's answerKey into what
 *  validateAnswers accepts, on top of the fixed onboarding/legacy set above.
 *  Never shrinks the fixed set; only additive. */
export function setDynamicAnswerKeys(keys: readonly string[]): void {
  _dynamicAnswerKeys = new Set(keys);
}

export function isKnownAnswerKey(key: string): boolean {
  return FIXED_ANSWER_KEYS.has(key) || _dynamicAnswerKeys.has(key);
}

export const LIMITS = { maxKeys: 40, maxStringLen: 2000, maxArrayLen: 60 } as const;

export interface QuizDraft {
  schemaVersion: number;
  submissionId: string;
  userId: string;
  lastRoute: string;
  answers: Record<string, unknown>;
  updatedAt: number;
}

function boundedValue(v: unknown): boolean {
  if (typeof v === 'string') return v.length <= LIMITS.maxStringLen;
  if (typeof v === 'number' || typeof v === 'boolean') return true;
  if (Array.isArray(v)) {
    return v.length <= LIMITS.maxArrayLen && v.every((x) => (typeof x === 'string' ? x.length <= LIMITS.maxStringLen : typeof x === 'number' || typeof x === 'boolean'));
  }
  return false;
}

/** Validate answers: known keys only, within bounds. Throws on violation. */
export function validateAnswers(answers: Record<string, unknown>): void {
  const keys = Object.keys(answers);
  if (keys.length > LIMITS.maxKeys) throw new Error('draft_too_many_keys');
  for (const k of keys) {
    if (!isKnownAnswerKey(k)) throw new Error(`draft_unknown_answer_key:${k}`);
    if (!boundedValue(answers[k])) throw new Error(`draft_oversized_value:${k}`);
  }
}

export interface RepoDeps {
  store: KeyValueStore;
  now: () => number;
}

export class QuizDraftRepository {
  constructor(private readonly deps: RepoDeps) {}

  /**
   * Load the draft for `userId`. Returns null (and clears) when: absent,
   * corrupt JSON, unknown/newer schema version (quarantine → offer safe
   * restart), a different user (account change), or invalid answers. Never
   * parses untrusted future versions into app state.
   */
  load(userId: string): QuizDraft | null {
    const raw = this.deps.store.getString(DRAFT_KEY);
    if (!raw) return null;
    let parsed: QuizDraft;
    try {
      parsed = JSON.parse(raw) as QuizDraft;
    } catch {
      this.clear();
      return null;
    }
    if (parsed.schemaVersion !== DRAFT_SCHEMA_VERSION) {
      // Unknown/legacy version — quarantine, do not migrate blindly.
      this.clear();
      return null;
    }
    if (parsed.userId !== userId) {
      // Draft belongs to a different account — never leak across users.
      this.clear();
      return null;
    }
    try {
      validateAnswers(parsed.answers ?? {});
    } catch {
      this.clear();
      return null;
    }
    return parsed;
  }

  /** Persist a draft. Validates bounds/keys and stamps schema + updatedAt. */
  save(input: Omit<QuizDraft, 'schemaVersion' | 'updatedAt'>): void {
    validateAnswers(input.answers ?? {});
    const draft: QuizDraft = {
      ...input,
      schemaVersion: DRAFT_SCHEMA_VERSION,
      updatedAt: this.deps.now(),
    };
    this.deps.store.set(DRAFT_KEY, JSON.stringify(draft));
  }

  /** Mandatory on account change, logout-all, deletion, or safe restart. */
  clear(): void {
    this.deps.store.remove(DRAFT_KEY);
  }
}

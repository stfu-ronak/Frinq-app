/**
 * Typed native representation of the quiz. No server-editable-question
 * feature — the step list is a closed, versioned, compiled-in array. Answer
 * keys mirror storage/quizDraftRepository.ts's FIXED_ANSWER_KEYS exactly (that
 * module is the single source of truth for the allowlist/bounds; this file
 * adds copy, options, template choice, and ordering on top).
 *
 * Order, exact copy, and every option were audited directly from the web
 * reference (frinq-frontend/app/(quiz)/*\/page.tsx) and its actual
 * `router.push`/`nextHref` navigation targets — not inferred or guessed.
 *
 * Storage-format note: the web reference stores three fields (hobbies,
 * show_up, looking_for) as a plain comma-joined string and the rest as a
 * JSON-stringified array, purely an artifact of localStorage requiring
 * strings. The native draft already holds real JS values (no double
 * serialization), so all multi-select answers here are normalized to
 * `string[]` for consistency. Task 32 must confirm the backend quiz-submit
 * payload accepts this shape for those three fields before wiring
 * submission (bare-string vs array), the same way Task 29 caught real
 * UserResponse drift — do not assume.
 */
import { FIXED_ANSWER_KEYS } from './answerSchema';

export type StepId = string;

interface BaseStep {
  id: StepId;
  /** Analytics/back-navigation section label shown in QuizHeader. */
  section: string;
  /** Opt into the stripped-back SimpleStepFrame instead of progress chrome. */
  chrome?: 'simple';
  /** Render an optional Skip affordance when the template supports it. */
  showSkip?: boolean;
}

export interface IntroStep extends BaseStep {
  kind: 'intro';
  heading: string;
  body?: string;
  ctaLabel: string;
}

export interface TextStep extends BaseStep {
  kind: 'text';
  answerKey: string;
  prompt: string;
  placeholder?: string;
  minLength?: number;
  allowVoice?: boolean;
}

export interface DateStep extends BaseStep {
  kind: 'date';
  answerKey: string;
  prompt: string;
}

export interface SingleChoiceCardStep extends BaseStep {
  kind: 'singleChoiceCard';
  answerKey: string;
  prompt: string;
  options: ReadonlyArray<{ value: string; label: string; description?: string }>;
  allowCustom?: boolean;
  customLabel?: string;
  customPlaceholder?: string;
}

export interface SingleChoiceListStep extends BaseStep {
  kind: 'singleChoiceList';
  answerKey: string;
  prompt: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Default pill rows, or large mutually-exclusive boxes in simple chrome. */
  variant?: 'pill' | 'box';
}

export interface MultiChoiceTagsStep extends BaseStep {
  kind: 'multiChoiceTags';
  answerKey: string;
  prompt: string;
  subtext?: string;
  placeholder?: string;
  options: readonly string[];
  min?: number;
  max?: number;
  /** Default wrapping chips, or full-width selectable rows. */
  layout?: 'chips' | 'list';
  allowCustom?: boolean;
  customPlaceholder?: string;
}

/** Optional social-profile links; each answer is persisted under its own
 * fixed draft key so the user can skip either field independently. */
export interface SocialVerificationStep extends BaseStep {
  kind: 'socialVerification';
  heading: string;
  body?: string;
  linkedinAnswerKey: string;
  instagramAnswerKey: string;
}

export interface RapidFirePair {
  a: string;
  b: string;
}
export interface RapidFireStep extends BaseStep {
  kind: 'rapidFire';
  answerKey: string;
  pairs: readonly RapidFirePair[];
  secondsPerPair: number;
}

export interface OpinionPair {
  prompt: string;
  a: string;
  b: string;
}
export interface OpinionsStep extends BaseStep {
  kind: 'opinions';
  answerKey: string;
  pairs: readonly OpinionPair[];
}

export interface SliderDef {
  prompt: string;
  leftLabel: string;
  leftHint: string;
  rightLabel: string;
  rightHint: string;
}
export interface PreferencesStep extends BaseStep {
  kind: 'preferences';
  answerKey: string;
  sliders: readonly SliderDef[];
}

export interface SliderStep extends BaseStep {
  kind: 'slider';
  answerKey: string;
  prompt: string;
  leftLabel: string;
  leftHint: string;
  rightLabel: string;
  rightHint: string;
}

export interface VoiceOrTextStep extends BaseStep {
  kind: 'voiceOrText';
  answerKey: string;
  heading: string;
  subtext?: string;
  placeholder?: string;
}

/** QuizStep: a closed discriminated union covering every step kind actually
 *  used by the product (per the audited web reference). No other kind may be
 *  introduced without extending this union and its template registry. */
export type QuizStep =
  | IntroStep
  | TextStep
  | DateStep
  | SingleChoiceCardStep
  | SingleChoiceListStep
  | MultiChoiceTagsStep
  | SocialVerificationStep
  | RapidFireStep
  | OpinionsStep
  | PreferencesStep
  | SliderStep
  | VoiceOrTextStep;

// ---------------------------------------------------------------------------
// The compiled step list — linear order, verified against the web reference's
// actual router.push/nextHref targets. No conditional branching exists in the
// product; nextStep()/previousStep() below derive purely from array position.
// ---------------------------------------------------------------------------

/** The fixed onboarding steps. Never replaced by admin-authored content —
 *  every quiz starts with exactly these, in this order. */
export const ONBOARDING_PREFIX: readonly QuizStep[] = [
  { id: 's0', kind: 'intro', section: 'intro', heading: "let's get to know you.", body: 'a few questions. no right answers.', ctaLabel: 'continue' },
  { id: 'name', kind: 'text', section: 'basics', answerKey: 'name', prompt: 'what should we call you?', placeholder: 'your name...', minLength: 1 },
  { id: 'city', kind: 'text', section: 'basics', answerKey: 'city', prompt: 'where do you live?', minLength: 2 },
  { id: 'age', kind: 'date', section: 'basics', answerKey: 'dob', prompt: 'when were you born?' },
  {
    id: 'social_verification', kind: 'socialVerification', section: 'basics', chrome: 'simple', showSkip: true,
    heading: 'social verification',
    linkedinAnswerKey: 'social_linkedin', instagramAnswerKey: 'social_instagram',
  },
  { id: 'ready', kind: 'intro', section: 'intro', heading: 'are you ready?', ctaLabel: 'continue' },
  { id: 'nahh', kind: 'intro', section: 'intro', heading: 'we want to understand the real you. let’s dive in.', body: 'let’s begin.', ctaLabel: 'continue' },
];

/** The compiled-in content steps, i.e. the part `setContentSteps` replaces.
 *  Also the fallback when fetching the admin-authored set fails. */
export const DEFAULT_CONTENT_STEPS: readonly QuizStep[] = [
  {
    id: 'social_type', kind: 'singleChoiceCard', section: 'who you are', answerKey: 'social_type',
    prompt: 'what is your social type?',
    options: [
      { value: 'introvert', label: 'introvert', description: 'i like to be alone mostly. people drain my energy.' },
      { value: 'selective extrovert', label: 'selective extrovert', description: 'very selective about who i let in. everyone passes a filter.' },
      { value: 'ambivert', label: 'ambivert', description: "i like people but i need my space equally. it's a balance." },
      { value: 'extrovert', label: 'extrovert', description: 'people give me energy. alone too long and i start to unravel.' },
    ],
  },
  {
    id: 'scene', kind: 'multiChoiceTags', section: 'who you are', answerKey: 'scene', prompt: "what's your scene?", min: 1,
    options: [
      "i don't drink or smoke.", 'a beer or two. socially.', 'hard drinks when i drink.',
      "i smoke or vape. that's my thing.", 'weed is how i decompress.', 'some combination depending on the night.',
    ],
  },
  {
    id: 'saturday_night', kind: 'singleChoiceCard', section: 'who you are', answerKey: 'saturday',
    prompt: 'my ideal saturday looks like', allowCustom: true,
    customLabel: 'or describe your own saturday', customPlaceholder: 'something different entirely...',
    options: [
      { value: 'small intimate dinner', label: 'small intimate dinner', description: 'good food, right people, conversation that goes nowhere and everywhere.' },
      { value: 'live event', label: 'live event', description: 'concert, comedy, anything with a crowd and an energy.' },
      { value: 'workshop', label: 'workshop', description: 'learning something with your hands or your head.' },
      { value: 'game night', label: 'game night', description: "competitive or chaotic, doesn't matter." },
    ],
  },
  {
    id: 'hobbies', kind: 'multiChoiceTags', section: 'who you are', answerKey: 'hobbies',
    prompt: "any unique hobbies you're proud of?", subtext: 'or pick from these', placeholder: 'vintage collecting, fermenting things...', min: 1,
    options: [
      'vintage collecting', 'urban exploring', 'hot sauce making', 'competitive crosswords', 'foraging',
      'rewatching shows', 'solving puzzles', 'open mics', 'zine-making', 'dumpster diving for gems',
      'astrology deep dives', 'learning accents', 'thrifting', 'film photography', 'journaling',
      'meme archaeology', 'niche wikipedia rabbit holes', 'community radio', 'amateur astronomy',
      'fermenting things', 'bonsai', 'escape rooms', 'speedrunning games',
    ],
  },
  {
    id: 'interests', kind: 'multiChoiceTags', section: 'who you are', answerKey: 'interests',
    prompt: 'pick your interests', placeholder: "anything you're into...", min: 1,
    options: [
      'photography', 'painting / drawing', 'writing', 'music', 'film & cinema', 'fashion & style', 'dancing',
      'cooking', 'baking', 'trying new restaurants', 'coffee culture', 'wine & spirits', 'cocktail making',
      'hiking', 'gym / fitness', 'yoga', 'running', 'swimming', 'cycling', 'rock climbing', 'football / sports',
      'reading', 'podcasts', 'philosophy', 'history', 'current affairs', 'spirituality', 'psychology',
      'travelling', 'live music / concerts', 'festivals', 'board games / game nights', 'volunteering', 'nightlife',
      'tech & startups', 'gaming', 'diy & crafts', 'investing', 'gardening', 'coding',
    ],
  },
  { id: 'sweet', kind: 'intro', section: 'intro', heading: 'now let’s really get to know you...', ctaLabel: 'continue' },

  {
    id: 'trip', kind: 'singleChoiceList', section: 'what you would do', answerKey: 'trip',
    prompt: "a weekend trip you waited all week for got cancelled last minute. what's your first reaction?",
    options: [
      { value: 'upset', label: 'genuinely upset' },
      { value: 'annoyed', label: 'annoyed' },
      { value: 'relieved', label: 'secretly relieved' },
      { value: 'backup', label: 'had a backup' },
    ],
  },
  {
    id: 'travel_style', kind: 'singleChoiceList', section: 'what you would do', answerKey: 'travel_style',
    prompt: 'when you go somewhere new, you usually...',
    options: [
      { value: 'research beforehand', label: 'research beforehand' },
      { value: 'figure things out on the spot', label: 'figure things out on the spot' },
      { value: 'follow whoever planned it', label: 'follow whoever planned it' },
      { value: 'explore randomly', label: 'explore randomly' },
    ],
  },
  {
    id: 'connection_mode', kind: 'singleChoiceList', section: 'what you would do', answerKey: 'connection_mode',
    prompt: "you're most likely to connect with someone when...",
    options: [
      { value: "we're doing an activity together", label: "we're doing an activity together" },
      { value: "we're talking deeply", label: "we're talking deeply" },
      { value: "we're laughing a lot", label: "we're laughing a lot" },
      { value: "we're exploring something new", label: "we're exploring something new" },
      { value: "we're part of the same group vibe", label: "we're part of the same group vibe" },
    ],
  },
  {
    id: 'event_yes', kind: 'multiChoiceTags', section: 'what you would do', answerKey: 'event_yes',
    prompt: 'which of these would you most likely say yes to?', placeholder: "anything you'd say yes to...", min: 1,
    options: [
      'board game night', 'live music gig', 'food hopping', 'trek / nature outing', 'pottery / DIY workshop',
      'bookstore or museum visit', 'sports / activity meetup', 'house party', 'open mic / comedy night',
      'random city exploration', 'box cricket', 'concert',
    ],
  },
  {
    id: 'event_no', kind: 'multiChoiceTags', section: 'what you would do', answerKey: 'event_no',
    prompt: 'which sounds like your nightmare?', placeholder: 'anything that sounds like your nightmare...', min: 1,
    options: [
      'board game night', 'live music gig', 'food hopping', 'trek / nature outing', 'pottery / DIY workshop',
      'bookstore or museum visit', 'sports / activity meetup', 'house party', 'open mic / comedy night',
      'random city exploration', 'box cricket', 'concert',
    ],
  },
  {
    id: 'would_rather', kind: 'singleChoiceList', section: 'what you would do', answerKey: 'would_rather',
    prompt: 'with someone you click with, what would you rather do?',
    options: [
      { value: 'build something together', label: 'build something together' },
      { value: 'explore something new together', label: 'explore something new together' },
      { value: 'talk for hours, no agenda', label: 'talk for hours, no agenda' },
      { value: 'compete or play together', label: 'compete or play together' },
      { value: 'just sit and exist together', label: 'just sit and exist together' },
    ],
  },
  {
    id: 'meeting_style', kind: 'singleChoiceList', section: 'what you would do', answerKey: 'meeting_style',
    prompt: 'when meeting new people, what feels most natural?',
    options: [
      { value: 'talking one-on-one', label: 'talking one-on-one' },
      { value: 'small group conversations', label: 'small group conversations' },
      { value: 'being around larger groups', label: 'being around larger groups' },
      { value: 'depends on the vibe', label: 'depends on the vibe' },
    ],
  },

  { id: 'story', kind: 'voiceOrText', section: 'your story', answerKey: 'story', heading: 'think of a time you made a friend unexpectedly.', subtext: 'how did it happen? speak or type briefly.', placeholder: 'we were both waiting for the same...' },

  {
    id: 'connection', kind: 'singleChoiceCard', section: 'connection', answerKey: 'connection',
    prompt: 'what makes a random stranger interesting to you?', allowCustom: true,
    customLabel: 'or describe what catches your attention', customPlaceholder: 'something else entirely...',
    options: [
      { value: "they're curious", label: "they're curious", description: 'they ask more questions than they answer.' },
      { value: 'they think differently', label: 'they think differently', description: "they see things you wouldn't have noticed." },
      { value: 'they have weird interests', label: 'they have weird interests', description: 'niche obsessions, unusual hobbies, specific knowledge.' },
      { value: 'they tell stories well', label: 'they tell stories well', description: 'even a coffee run sounds like a small adventure.' },
    ],
  },
  {
    id: 'red_flags', kind: 'multiChoiceTags', section: 'connection', answerKey: 'red_flags',
    prompt: 'in a new friend, what are your instant turn-offs?', placeholder: "what turns you off in a new friend...", min: 1,
    options: [
      'dishonesty / lying', 'love-bombing early on', 'disrespecting boundaries', 'avoiding hard conversations',
      'hot and cold behaviour', 'poor communication', 'jealousy / controlling', 'flakiness / unreliability',
      'no accountability', 'one-upping everything', 'oversharing too soon', 'phone addiction', 'status obsession',
    ],
  },
  {
    id: 'show_up', kind: 'multiChoiceTags', section: 'connection', answerKey: 'show_up',
    prompt: 'how do you show up for people you care about?', placeholder: 'i remember the things you said in passing...', min: 1,
    options: [
      'i check in regularly', 'i show up in person', 'i remember small details', 'i give thoughtful gifts',
      'i sit with them in silence', 'i offer practical help', 'i listen without fixing', 'i send voice notes',
      'i plan quality time', 'i hype them up loudly', 'i text first, always', 'i hold space in hard weeks',
    ],
  },

  { id: 'rapid_intro', kind: 'intro', section: 'rapid-fire', heading: 'okay, that was heavy. let’s dial it back.', body: 'rapid fire. 10 seconds each. go with your gut.', ctaLabel: 'tap anywhere to begin' },
  {
    id: 'rapid_fire', kind: 'rapidFire', section: 'rapid-fire', answerKey: 'rapid', secondsPerPair: 10,
    pairs: [
      { a: 'confront immediately', b: 'take time to process' },
      { a: 'deep 2 am talks', b: 'random bakchodi' },
      { a: 'home early', b: 'home late' },
      { a: 'mountain person', b: 'beach person' },
      { a: 'i make the plans', b: 'i join the plans' },
      { a: 'need regular catch-ups', b: 'pick up where we left off' },
      { a: 'new cultures', b: 'deeper into my own' },
      { a: 'hiking with strangers', b: 'poker with strangers' },
      { a: "i'm always the host", b: "i'm never the host" },
      { a: 'call everyday', b: 'call once a week' },
    ],
  },

  { id: 'glorious', kind: 'intro', section: 'opinions', heading: "you're almost there.", body: 'time to check your opinions. controversial you ask? it depends.', ctaLabel: 'continue' },
  {
    id: 'opinions', kind: 'opinions', section: 'opinions', answerKey: 'opinions',
    pairs: [
      { prompt: 'on ai taking over:', a: 'it will replace everything we know.', b: "humans can't truly be replaced." },
      { prompt: 'when it comes to truth:', a: 'hard truth, always. no sugarcoating.', b: 'empathy matters more than brutal honesty.' },
      { prompt: 'you respect people who:', a: 'have a five year plan and stick to it.', b: 'live fully in the moment.' },
      { prompt: 'on how people show up:', a: 'word is bond.', b: 'action > words.' },
    ],
  },
  { id: 'opinions_why', kind: 'voiceOrText', section: 'opinions', answerKey: 'opinions_why', heading: 'tell us why', placeholder: 'genuinely curious...' },

  { id: 'preferences_intro', kind: 'intro', section: 'preferences', heading: 'four quick questions about how you actually move through the world.', body: 'use the slider. no wrong answers.', ctaLabel: 'continue' },
  {
    id: 'preferences', kind: 'preferences', section: 'preferences', answerKey: 'preferences',
    sliders: [
      { prompt: 'you trust more', leftLabel: 'what you can see', leftHint: 'see', rightLabel: 'what you sense', rightHint: 'sense' },
      { prompt: 'you decide things more with', leftLabel: 'your heart', leftHint: 'heart', rightLabel: 'your head', rightHint: 'head' },
      { prompt: 'you grow more from', leftLabel: 'going deeper', leftHint: 'deeper', rightLabel: 'going wider', rightHint: 'wider' },
      { prompt: "if you had to pick, you'd rather be", leftLabel: 'kind', leftHint: 'kind', rightLabel: 'honest', rightHint: 'honest' },
    ],
  },

  {
    id: 'last_question', kind: 'multiChoiceTags', section: 'final', answerKey: 'looking_for',
    prompt: 'what kind of people are you looking for?', subtext: 'be honest. nobody is judging.', placeholder: 'people who...', min: 1,
    options: [
      'emotionally available', 'ambitious & driven', 'curious & open-minded', 'family-oriented',
      'spiritually aligned', 'financially responsible', 'funny & playful', 'good communicator',
      'physically active', 'socially confident', 'introverted & calm', 'culturally aware',
    ],
  },
];

let _activeSteps: readonly QuizStep[] = [...ONBOARDING_PREFIX, ...DEFAULT_CONTENT_STEPS];
let _stepIndex = new Map(_activeSteps.map((s, i) => [s.id, i]));

/** Called once by QuizNavigator after fetching (or falling back on) the active
 *  quiz config's content steps — replaces everything after ONBOARDING_PREFIX.
 *  Never called mid-quiz-session. */
export function setContentSteps(steps: readonly QuizStep[]): void {
  _activeSteps = [...ONBOARDING_PREFIX, ...steps];
  _stepIndex = new Map(_activeSteps.map((s, i) => [s.id, i]));
}

/** Always the first onboarding step — content swaps can never change it. */
export const FIRST_STEP_ID: StepId = ONBOARDING_PREFIX[0].id;

/** Dynamic: the terminal step depends on which content steps are active. */
export function currentLastStepId(): StepId {
  return _activeSteps[_activeSteps.length - 1].id;
}

export function getStep(id: StepId): QuizStep | undefined {
  const i = _stepIndex.get(id);
  return i === undefined ? undefined : _activeSteps[i];
}

/** Linear next-step lookup. Every non-terminal step has exactly one next
 *  step; there is no conditional branching in the audited web reference. */
export function nextStep(id: StepId): StepId | null {
  const i = _stepIndex.get(id);
  if (i === undefined || i + 1 >= _activeSteps.length) return null;
  return _activeSteps[i + 1].id;
}

export function previousStep(id: StepId): StepId | null {
  const i = _stepIndex.get(id);
  if (i === undefined || i <= 0) return null;
  return _activeSteps[i - 1].id;
}

export function stepProgress(id: StepId): { step: number; total: number } {
  const inputSteps = _activeSteps.filter((s) => s.kind !== 'intro');
  const i = inputSteps.findIndex((s) => s.id === id);
  return { step: i === -1 ? 0 : i + 1, total: inputSteps.length };
}

/** Every answer-bearing step's key must be in the shared FIXED_ANSWER_KEYS
 *  allowlist (storage/quizDraftRepository.ts) — checked by the structural
 *  test, not just at runtime. */
export function answerKeyForStep(step: QuizStep): string | null {
  return 'answerKey' in step ? step.answerKey : null;
}

/** All draft keys written by a step. Most steps have one `answerKey`; social
 * verification intentionally stores its two optional profile links separately. */
export function answerKeysForStep(step: QuizStep): readonly string[] {
  if (step.kind === 'socialVerification') {
    return [step.linkedinAnswerKey, step.instagramAnswerKey];
  }
  const answerKey = answerKeyForStep(step);
  return answerKey === null ? [] : [answerKey];
}

/** All answer keys required by the currently installed quiz session. */
export function currentAnswerKeys(): readonly string[] {
  return _activeSteps.flatMap(answerKeysForStep);
}

export { FIXED_ANSWER_KEYS, FIXED_ANSWER_KEYS as ANSWER_KEYS };

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
import { GENDER_OPTIONS } from '../../../services/api/genderOptions';

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
  /** 'cream' (default): the usual quiz chrome. 'maroon': a full-bleed
   *  maroon milestone card (Figma "ahh.. that was heavy questioning") — white
   *  heading/body, a lighter-peach CTA face. */
  theme?: 'cream' | 'maroon';
}

export interface TextStep extends BaseStep {
  kind: 'text';
  answerKey: string;
  prompt: string;
  placeholder?: string;
  minLength?: number;
  allowVoice?: boolean;
  /** Optional fixed onboarding values may advance without an answer. */
  optional?: boolean;
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
  /** Static framing question shown above every pair (Figma node 163:2121) —
   *  the pairs are all behavioral either/or traits, so one caption fits all. */
  prompt?: string;
}

export interface OpinionPair {
  prompt: string;
  a: string;
  b: string;
  /** When set, this pair is followed by a text+voice "why" sub-question
   *  once every pick in the round is done (batched, not interleaved). */
  whyPrompt?: string;
  whyAllowVoice?: boolean;
}
export interface OpinionsStep extends BaseStep {
  kind: 'opinions';
  answerKey: string;
  pairs: readonly OpinionPair[];
  /** Required when any pair has a whyPrompt — the draft key the batched
   *  why-answers (one per whyPrompt pair, in pair order) are saved under. */
  whyAnswerKey?: string;
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

/** Stored as the answer value when a question is answered by VOICE ONLY, with
 *  no typed text. It marks "there is a recording for this key" so the answer
 *  is present (finalize requires every key) without inventing text the user
 *  never wrote.
 *
 *  MUST stay byte-identical to the backend's `_VOICE_PLACEHOLDER` in
 *  app/core/ai/page2_summary.py — build_page2_input swaps it for the Whisper
 *  transcript, and drops the answer entirely when no transcript exists, so a
 *  mismatch here would feed the literal sentinel to the model as if it were
 *  the user's own words. */
export const VOICE_ANSWER_PLACEHOLDER = '[voice response]';

// ---------------------------------------------------------------------------
// The compiled step list — linear order, verified against the web reference's
// actual router.push/nextHref targets. No conditional branching exists in the
// product; nextStep()/previousStep() below derive purely from array position.
// ---------------------------------------------------------------------------

/** The fixed onboarding steps. Never replaced by admin-authored content —
 *  every quiz starts with exactly these, in this order. */
export const ONBOARDING_PREFIX: readonly QuizStep[] = [
  { id: 'welcome', kind: 'intro', section: 'intro', heading: 'welcome', ctaLabel: 'continue' },
  { id: 'gender', kind: 'singleChoiceList', section: 'basics', answerKey: 'gender', prompt: 'how do you identify yourself', options: GENDER_OPTIONS },
  { id: 'pronoun', kind: 'text', section: 'basics', answerKey: 'pronoun', prompt: 'your pronouns', placeholder: 'she/her, he/him, they/them', minLength: 0, optional: true, showSkip: true },
  { id: 'city', kind: 'text', section: 'basics', answerKey: 'city', prompt: 'where do you live?', minLength: 2 },
  { id: 'age', kind: 'date', section: 'basics', answerKey: 'dob', prompt: 'when were you born?' },
  {
    id: 'social_verification', kind: 'socialVerification', section: 'basics', chrome: 'simple', showSkip: true,
    heading: 'social verification',
    linkedinAnswerKey: 'social_linkedin', instagramAnswerKey: 'social_instagram',
  },
  { id: 'ready', kind: 'intro', section: 'intro', heading: 'are you ready?', ctaLabel: 'continue' },
];

/** The compiled-in content steps, i.e. the part `setContentSteps` replaces.
 *  Also the fallback when fetching the admin-authored set fails. */
export const DEFAULT_CONTENT_STEPS: readonly QuizStep[] = [
  {
    id: 'social_type', kind: 'singleChoiceList', section: 'who you are', answerKey: 'social_type',
    prompt: 'what is your social type?',
    options: [
      { value: 'introvert', label: 'introvert' },
      { value: 'extrovert', label: 'extrovert' },
      { value: 'ambivert', label: 'ambivert' },
      { value: 'selective introvert', label: 'selective introvert' },
    ],
  },
  {
    id: 'scene', kind: 'multiChoiceTags', section: 'who you are', answerKey: 'scene', prompt: "what's your scene?", min: 1,
    layout: 'list',
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
    prompt: "any unique hobbies you're proud of?", min: 1,
    allowCustom: true, customPlaceholder: 'vintage collecting, fermenting things...',
    options: [
      'vintage collecting', 'urban exploring', 'hot sauce making', 'competitive crosswords', 'foraging',
      'rewatching shows', 'solving puzzles', 'open mics', 'zine-making', 'bonsai', 'dumpster diving for gems',
      'astrology deep dives', 'learning accents', 'thrifting', 'film photography', 'journaling',
      'meme archaeology', 'niche wikipedia rabbit holes', 'community radio', 'amateur astronomy',
      'fermenting things', 'escape rooms', 'speedrunning games',
    ],
  },
  {
    id: 'interests', kind: 'multiChoiceTags', section: 'who you are', answerKey: 'interests',
    prompt: 'pick your interests', min: 1,
    allowCustom: true, customPlaceholder: "anything you're into...",
    options: [
      'photography', 'painting / drawing', 'writing', 'music', 'film & cinema', 'fashion & style', 'dancing',
      'cooking', 'baking', 'trying new restaurants', 'coffee culture', 'wine & spirits', 'cocktail making',
      'hiking', 'gym / fitness', 'yoga', 'running', 'swimming', 'cycling', 'rock climbing', 'football / sports',
      'reading', 'podcasts', 'philosophy', 'history', 'current affairs', 'spirituality', 'psychology',
      'travelling', 'live music / concerts', 'festivals', 'board games / game nights', 'volunteering', 'nightlife',
      'tech & startups', 'gaming', 'diy & crafts', 'investing', 'gardening', 'coding',
    ],
  },
  { id: 'sweet', kind: 'intro', section: 'intro', heading: 'now let’s really get to know you...', ctaLabel: 'continue', theme: 'maroon' },

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
    prompt: 'which of these would you most likely say yes to?', min: 1,
    allowCustom: true, customPlaceholder: "anything you'd say yes to...",
    options: [
      'board game night', 'live music gig', 'food hopping', 'trek / nature outing', 'pottery / DIY workshop',
      'bookstore or museum visit', 'sports / activity meetup', 'house party', 'open mic / comedy night',
      'random city exploration', 'box cricket', 'concert',
    ],
  },
  {
    id: 'event_no', kind: 'multiChoiceTags', section: 'what you would do', answerKey: 'event_no',
    prompt: 'which sounds like your nightmare?', min: 1,
    allowCustom: true, customPlaceholder: 'anything that sounds like your nightmare...',
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
    prompt: 'in a new friend, what are your instant turn-offs?', min: 1,
    allowCustom: true, customPlaceholder: "what turns you off in a new friend...",
    options: [
      'dishonesty / lying', 'love-bombing early on', 'disrespecting boundaries', 'avoiding hard conversations',
      'hot and cold behaviour', 'poor communication', 'jealousy / controlling', 'flakiness / unreliability',
      'no accountability', 'one-upping everything', 'oversharing too soon', 'phone addiction', 'status obsession',
    ],
  },
  {
    id: 'show_up', kind: 'multiChoiceTags', section: 'connection', answerKey: 'show_up',
    prompt: 'how do you show up for people you care about?', min: 1,
    allowCustom: true, customPlaceholder: 'i remember the things you said in passing...',
    options: [
      'i check in regularly', 'i show up in person', 'i remember small details', 'i give thoughtful gifts',
      'i sit with them in silence', 'i offer practical help', 'i listen without fixing', 'i send voice notes',
      'i plan quality time', 'i hype them up loudly', 'i text first, always', 'i hold space in hard weeks',
    ],
  },

  // heading is intentionally empty: the art asset has "Rapid Fire round"
  // baked into the flame, so rendering a text heading too would double it.
  { id: 'rapid_intro', kind: 'intro', section: 'rapid-fire', heading: '', ctaLabel: "I'm Ready 🔥", theme: 'maroon' },
  {
    id: 'rapid_fire', kind: 'rapidFire', section: 'rapid-fire', answerKey: 'rapid', secondsPerPair: 10,
    prompt: 'what kind of person are you?',
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

  { id: 'glorious', kind: 'intro', section: 'opinions', heading: 'almost there', body: 'time to check your opinions. controversial you ask? it depends.', ctaLabel: 'Continue', theme: 'maroon' },
  {
    id: 'opinions', kind: 'opinions', section: 'opinions', answerKey: 'opinions', whyAnswerKey: 'opinions_why',
    pairs: [
      { prompt: 'on ai taking over:', a: 'it will replace everything we know.', b: "humans can't truly be replaced.", whyPrompt: 'what makes you think that?', whyAllowVoice: true },
      { prompt: 'when it comes to truth:', a: 'hard truth, always. no sugarcoating.', b: 'empathy matters more than brutal honesty.', whyPrompt: 'why do you feel that way?', whyAllowVoice: true },
      { prompt: 'you respect people who:', a: 'have a five year plan and stick to it.', b: 'live fully in the moment.', whyPrompt: 'what makes you respect that?', whyAllowVoice: true },
      { prompt: 'on how people show up:', a: 'word is bond.', b: 'action > words.', whyPrompt: "why's that?", whyAllowVoice: true },
    ],
  },

  { id: 'preferences_intro', kind: 'intro', section: 'preferences', heading: 'four quick questions about how you actually move through the world.', body: 'use the slider. no wrong answers.', ctaLabel: 'Continue', theme: 'maroon' },
  {
    id: 'preferences', kind: 'preferences', section: 'preferences', answerKey: 'preferences',
    sliders: [
      { prompt: 'i trust what i can see more than what i can’t explain but somehow feel.', leftLabel: 'what you can see', leftHint: 'see', rightLabel: 'what you sense', rightHint: 'sense' },
      { prompt: "when it's a big decision, my heart usually speaks before my head does.", leftLabel: 'your heart', leftHint: 'heart', rightLabel: 'your head', rightHint: 'head' },
      { prompt: "i'd rather go deep with a few things than wide across many.", leftLabel: 'going deeper', leftHint: 'deeper', rightLabel: 'going wider', rightHint: 'wider' },
      { prompt: "if i have to pick one, i'd rather be kind than brutally honest.", leftLabel: 'kind', leftHint: 'kind', rightLabel: 'honest', rightHint: 'honest' },
    ],
  },

  {
    id: 'last_question', kind: 'multiChoiceTags', section: 'final', answerKey: 'looking_for',
    prompt: 'what kind of people are you looking for?', subtext: 'be honest. nobody is judging.', min: 1,
    allowCustom: true, customPlaceholder: 'people who...',
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

/** Rapid Fire has no mid-round back navigation (there's nothing sane to land
 *  on between two 10-second pairs), so stepping back from the step right
 *  after it must skip both the timed round AND its own intro milestone —
 *  landing on whatever real question preceded the whole section instead. */
export function previousStep(id: StepId): StepId | null {
  const i = _stepIndex.get(id);
  if (i === undefined || i <= 0) return null;
  let j = i - 1;
  if (_activeSteps[j].kind === 'rapidFire') {
    j -= 1;
    if (j >= 0 && _activeSteps[j].kind === 'intro') j -= 1;
  }
  return j >= 0 ? _activeSteps[j].id : null;
}

/** How many counted questions a single step contributes. Most steps are one
 *  screen = one question. Rapid Fire re-renders once per pair (one screen
 *  per question); Opinions re-renders once per pick PLUS once more per
 *  pair that has a whyPrompt follow-up (each pick and each why-follow-up is
 *  now its own counted screen, not batched under one number); Preferences
 *  re-renders once per slider — same pattern, previously missed here, which
 *  left every slider screen reporting the SAME "Question N" (subIndex had
 *  nowhere to go, clamped to a single unit) and undercounted the total by
 *  the other 3 sliders. */
function unitsForStep(s: QuizStep): number {
  if (s.kind === 'rapidFire') return s.pairs.length;
  if (s.kind === 'opinions') return s.pairs.length + s.pairs.filter((p) => p.whyPrompt).length;
  if (s.kind === 'preferences') return s.sliders.length;
  return 1;
}

/** Counts only real quiz questions: the content steps (never
 *  ONBOARDING_PREFIX's gender/pronoun/city/age/social-verification, which
 *  aren't part of the quiz proper and never show a counter anyway), minus
 *  'intro' kind milestone/break screens. A multi-screen step (see
 *  unitsForStep) counts once per sub-screen, so `subIndex` (the 0-based
 *  sub-screen index, from the template's own in-progress state — the step id
 *  alone can't tell sub-screens apart) shifts both the current number and
 *  the total accordingly. */
export function stepProgress(id: StepId, subIndex = 0): { step: number; total: number } {
  const content = _activeSteps.slice(ONBOARDING_PREFIX.length);
  const counted = (s: QuizStep) => (s.kind === 'intro' ? 0 : unitsForStep(s));
  const total = content.reduce((sum, s) => sum + counted(s), 0);
  const i = content.findIndex((s) => s.id === id);
  if (i === -1) return { step: 0, total };
  let step = 0;
  for (let idx = 0; idx < i; idx++) step += counted(content[idx]);
  const cur = content[i];
  // A milestone/break screen is not a question, so it adds nothing to the
  // count — but it DOES report the progress already earned, so the wave keeps
  // its fill across the interstitial instead of blanking out. Its header is
  // 'plain', which suppresses the "Question N out of M" text either way.
  if (cur.kind === 'intro') return { step, total };
  step += Math.min(Math.max(subIndex, 0), unitsForStep(cur) - 1) + 1;
  return { step, total };
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
  const keys = answerKey === null ? [] : [answerKey];
  if (step.kind === 'opinions' && step.whyAnswerKey) {
    return [...keys, step.whyAnswerKey];
  }
  return keys;
}

/** All answer keys required by the currently installed quiz session. */
export function currentAnswerKeys(): readonly string[] {
  return _activeSteps.flatMap(answerKeysForStep);
}

export { FIXED_ANSWER_KEYS, FIXED_ANSWER_KEYS as ANSWER_KEYS };

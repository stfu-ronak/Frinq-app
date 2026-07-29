/** Label/value pairs for the `Gender` enum (app/schemas/user.py's
 *  Literal["male","female","non_binary","other"]) — single source shared by
 *  the quiz's gender step and EditProfileScreen so the two never drift.
 *  "Prefer not to say" is a label-only mapping onto the existing `other`
 *  value — no new enum value, no schema change. */
export const GENDER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non binary' },
  { value: 'other', label: 'Prefer not to say' },
];

import { FIXED_ANSWER_KEYS, LIMITS } from '../../../storage/quizDraftRepository';

export type { };
export { FIXED_ANSWER_KEYS, FIXED_ANSWER_KEYS as ANSWER_KEYS, LIMITS };

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

const ok: ValidationResult = { valid: true };
function fail(reason: string): ValidationResult {
  return { valid: false, reason };
}

/** Minimum age enforced by the DOB step — matches the web app's 18+ gate. */
export const MIN_AGE_YEARS = 18;

export function validateText(value: unknown, opts: { minLength?: number; required?: boolean } = {}): ValidationResult {
  const { minLength = 1, required = true } = opts;
  if (typeof value !== 'string') return required ? fail('required') : ok;
  const trimmed = value.trim();
  if (required && trimmed.length < minLength) return fail(`min_length_${minLength}`);
  if (trimmed.length > LIMITS.maxStringLen) return fail('too_long');
  return ok;
}

/** dd/mm/yyyy, same format as the web app's DOB field. */
export function validateDob(value: unknown): ValidationResult {
  if (typeof value !== 'string') return fail('required');
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return fail('bad_format');
  const [, dd, mm, yyyy] = m;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (date.getMonth() !== Number(mm) - 1 || date.getDate() !== Number(dd)) return fail('bad_date');
  const age = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (age < MIN_AGE_YEARS) return fail('under_18');
  return ok;
}

export function validateSingleChoice(value: unknown, options: readonly string[]): ValidationResult {
  if (typeof value !== 'string' || !value) return fail('required');
  if (!options.includes(value)) return fail('unknown_option');
  return ok;
}

export function validateMultiChoice(
  value: unknown,
  opts: { min?: number; max?: number } = {},
): ValidationResult {
  const { min = 1, max = LIMITS.maxArrayLen } = opts;
  if (!Array.isArray(value)) return fail('required');
  if (value.length < min) return fail(`min_${min}`);
  if (value.length > max) return fail(`max_${max}`);
  if (!value.every((v) => typeof v === 'string')) return fail('bad_item_type');
  return ok;
}

export function validateRapidFire(value: unknown, count: number): ValidationResult {
  if (!Array.isArray(value) || value.length !== count) return fail(`expected_${count}_answers`);
  return ok;
}

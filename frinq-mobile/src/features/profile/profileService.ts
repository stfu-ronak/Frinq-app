import { ApiClient } from '../../services/api/apiClient';
import { UserResponse } from '../../services/api/contracts';

export async function fetchProfile(apiClient: ApiClient): Promise<UserResponse> {
  return apiClient.request<UserResponse>({ path: '/api/v1/users/me' });
}

export interface ProfilePatch {
  display_name?: string;
  gender?: string;
  age?: number;
  ncr_zone?: string;
}

/** One combined PATCH for whatever fields changed — the endpoint already
 *  accepts all of them in a single request, so EditProfileScreen never fires
 *  more than one call regardless of how many fields are dirty. */
export async function updateProfile(apiClient: ApiClient, patch: ProfilePatch): Promise<UserResponse> {
  return apiClient.request<UserResponse>({
    path: '/api/v1/users/me',
    method: 'PATCH',
    body: patch,
  });
}

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;

/** Mirrors the web's exact masking (frinq-frontend/app/(app)/profile/page.tsx):
 *  last 10 digits, India country code, first 2 + last 2 visible. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return '—';
  return `+91 ${digits.slice(0, 2)}**** **${digits.slice(-2)}`;
}

/** Mirrors the web's exact error-code table (frinq-frontend/app/(app)/profile/edit/page.tsx)
 *  — matched against the ApiError's code, same as the backend's display_name_* rejections. */
const DISPLAY_NAME_ERRORS: Record<string, string> = {
  display_name_too_short: `name must be at least ${DISPLAY_NAME_MIN} characters`,
  display_name_too_long: `name must be ${DISPLAY_NAME_MAX} characters or fewer`,
  display_name_empty_after_normalization: "name can't be empty",
  display_name_control_characters: "that name contains characters that aren't allowed",
  display_name_excessive_repetition: 'too many repeated characters',
  display_name_too_many_urls: "links aren't allowed in your name",
  display_name_reserved_term: "that name isn't available",
  display_name_blocked_term: "that name isn't allowed",
  display_name_rate_limited: 'you can only change your name once every 3 months',
};

export function mapDisplayNameError(code: string): string {
  return DISPLAY_NAME_ERRORS[code] ?? "couldn't save — try a different name";
}

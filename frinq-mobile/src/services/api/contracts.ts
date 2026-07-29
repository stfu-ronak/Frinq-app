/**
 * TypeScript models for the FastAPI contract. Derived from the Phase 1-6
 * response schemas (app/schemas/*). Session/boot-relevant models live here now;
 * feature models (community messages, reports, quiz summary, etc.) are added by
 * the tasks that consume them. A contract-drift check (Task 29 Step 2) compares
 * these against committed response fixtures.
 *
 * The FastAPI backend is the sole authority — these mirror it, never redefine it.
 */

export type OnboardingState =
  | 'quiz_in_progress'
  | 'profile_processing'
  | 'active'
  | 'error'
  | (string & {}); // tolerate unknown/future server values without breaking types

/** GET /api/v1/users/me (UserResponse). Phone/supabase_uid are the user's own
 *  private self-view only; never rendered on any public surface. */
export interface UserResponse {
  id: string;
  supabase_uid?: string | null;
  phone?: string | null;
  display_name?: string | null;
  /** Last time display_name changed — server enforces a 3-month cooldown;
   *  mobile reads this to pre-emptively disable the field / show the date
   *  without a round-trip. */
  display_name_updated_at?: string | null;
  gender?: string | null;
  age?: number | null;
  ncr_zone?: string | null;
  max_travel_km?: number | null;
  schedule?: string[];
  onboarding_complete: boolean;
  onboarding_state: OnboardingState;
  community_slug?: string | null;
  banned: boolean;
  terms_version?: string | null;
  terms_accepted_at?: string | null;
  privacy_version?: string | null;
  privacy_accepted_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/v1/legal/current */
export interface LegalCurrent {
  terms_version: string;
  privacy_version: string;
}

/** A rotating session token pair. Refresh rotates on every use. */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

/** POST /api/v1/otp/verify — creates/resumes the account and returns the first
 *  token pair plus the server-authoritative user and any resumable prior quiz. */
export interface PriorSession {
  submission_id: string;
  answers: Record<string, unknown>;
  is_complete?: boolean;
  status?: string;
  last_page?: string | null;
}

export interface OtpVerifyResponse extends TokenPair {
  user: UserResponse;
  prior_session?: PriorSession | null;
}

/** POST /api/v1/auth/refresh */
export type RefreshResponse = TokenPair;

/** Reauth token for account deletion (POST /auth/reverify/verify). */
export interface ReauthTokenResponse {
  reauth_token: string;
  expires_in: number;
}

/** DELETE /api/v1/users/me request body — the single-use token from
 *  POST /auth/reverify/verify, bound to this account_delete action only. */
export interface DeleteAccountRequest {
  reauth_token: string;
}

/** DELETE /api/v1/users/me (UserDeleteResponse). */
export interface UserDeleteResponse {
  id: string;
  deleted_at: string;
}

/** GET /api/v1/quiz/summary/{id} (QuizSummaryResponse). All fields besides
 *  submission_id/status are AI-generated and not schema-guaranteed — the
 *  backend fills sensible defaults but a field can still be null/absent on
 *  older or partial rows. Render defensively, never assume presence. */
export interface InsightItem {
  label: string;
  text: string;
}

/** share_card is assembled server-side (app/core/ai/insights.py) with
 *  defaults for every field, so — when non-null — this exact shape is
 *  guaranteed, unlike deep_summary's freeform AI text. */
export interface ShareCardStats {
  social_energy: number;
  peak_time: string;
  group_role: string;
  group_effect: number;
  secret_edge: string;
  rarity: string;
}
export interface ShareCard {
  archetype: string;
  archetype_slug: string;
  nickname: string;
  description: string;
  archetype_desc: string;
  headline: string;
  pull_quote: string;
  share_quote: string;
  tags: string[];
  stats: ShareCardStats;
  love_language: string;
  ideal_hangout: string;
  compatibility: { clicks_with: string[]; clashes_with: string[] };
  friend_audit: { seek: string; avoid: string };
  growth_edge: string;
}

/** deep_summary is a separate, independently-failable AI call
 *  (generate_deep_report) — every field is genuinely optional; omit the
 *  section entirely when absent rather than rendering an empty placeholder. */
export interface DeepSummary {
  report_quote?: string;
  signal_trait?: { label: string; text: string };
  signal_archetype_text?: string;
  narrative?: string[];
  mirror?: string;
  first_impression?: string;
  hidden_pattern?: string;
  unspoken_need?: string;
  read_notes?: InsightItem[];
  closing_line?: string;
  snapshot?: { first_read?: string; after_time?: string; under_stress?: string; what_wins_you?: string };
}

export interface VibeReport {
  submission_id: string;
  status: string; // pending | processing | done | error
  name?: string | null;
  headline?: string | null;
  archetype?: string | null;
  archetype_desc?: string | null;
  share_quote?: string | null;
  spirit_animal?: string | null;
  spirit_desc?: string | null;
  insights: InsightItem[];
  tags: string[];
  share_card?: ShareCard | null;
  deep_summary?: DeepSummary | null;
}

/** GET /api/v1/community/me (CommunityMeResponse). */
export interface CommunityMe {
  archetype_slug: string;
  name: string;
  description: string;
  muted: boolean;
  joined_at: string;
}

/** Public author fields only — never phone/internal ids beyond the user's
 *  own id (PublicAuthor, app/schemas/message.py). */
export interface PublicAuthor {
  id: string;
  display_name?: string | null;
  avatar_key?: string | null;
  archetype_slug?: string | null;
}

/** GET /api/v1/community/messages item (MessageOut). */
export interface MessageOut {
  id: number;
  client_message_id: string;
  body: string;
  created_at: string;
  author: PublicAuthor;
}

/** GET /api/v1/community/messages (MessageHistoryResponse). Cursor pagination. */
export interface MessageHistoryResponse {
  messages: MessageOut[];
  next_cursor?: string | null;
}

/** POST /api/v1/community/ws-ticket (WsTicketResponse). Single-use, short-lived. */
export interface WsTicketResponse {
  ticket: string;
  expires_in?: number;
}

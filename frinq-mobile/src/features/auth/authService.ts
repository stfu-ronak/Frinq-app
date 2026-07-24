import { ApiClient } from '../../services/api/apiClient';
import { OtpVerifyResponse, LegalCurrent } from '../../services/api/contracts';

export interface SendOtpResult {
  ok: boolean;
  /** Seconds to wait before the next resend is allowed (429 rate limit). */
  retryAfter?: number;
  /** Safe error code for display, when ok is false and it isn't a rate limit. */
  code?: string;
}

export async function sendOtp(apiClient: ApiClient, phone: string): Promise<SendOtpResult> {
  try {
    await apiClient.request({ path: '/api/v1/otp/send', method: 'POST', body: { phone }, auth: false });
    return { ok: true };
  } catch (err: any) {
    if (err?.status === 429) return { ok: false, retryAfter: 60, code: 'rate_limited' };
    return { ok: false, code: err?.code ?? 'network_error' };
  }
}

export interface VerifyOtpResult {
  ok: boolean;
  data?: OtpVerifyResponse;
  /** 'invalid' (wrong code), 'expired', 'timeout', or a generic code. */
  code?: string;
}

export async function verifyOtp(apiClient: ApiClient, phone: string, code: string): Promise<VerifyOtpResult> {
  try {
    const data = await apiClient.request<OtpVerifyResponse>({
      path: '/api/v1/otp/verify',
      method: 'POST',
      body: { phone, code },
      auth: false,
    });
    return { ok: true, data };
  } catch (err: any) {
    if (err?.status === 410) return { ok: false, code: 'expired' };
    if (err?.status === 400) return { ok: false, code: 'invalid' };
    if (err?.status === 504) return { ok: false, code: 'timeout' };
    return { ok: false, code: err?.code ?? 'network_error' };
  }
}

export async function fetchCurrentLegal(apiClient: ApiClient): Promise<LegalCurrent> {
  return apiClient.request<LegalCurrent>({ path: '/api/v1/legal/current', auth: false });
}

export async function acceptLegal(
  apiClient: ApiClient,
  payload: { terms_version: string; privacy_version: string; locale: string; source: 'ios' | 'android' },
): Promise<boolean> {
  try {
    await apiClient.request({ path: '/api/v1/legal/accept', method: 'POST', body: payload });
    return true;
  } catch {
    return false;
  }
}

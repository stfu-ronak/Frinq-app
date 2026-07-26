import { verifyOtp, sendOtp } from '../authService';

describe('verifyOtp', () => {
  it('sends a platform field — backend VerifyOTPRequest requires it, missing it 422s', async () => {
    const request = jest.fn().mockResolvedValue({ ok: true });
    const apiClient = { request } as any;

    await verifyOtp(apiClient, '9876543210', '123456');

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/v1/otp/verify',
        body: expect.objectContaining({
          phone: '9876543210',
          code: '123456',
          platform: expect.stringMatching(/^(ios|android)$/),
        }),
      }),
    );
  });

  it('maps a 422 (or any unmapped status) to a generic error, never silently ok', async () => {
    const request = jest.fn().mockRejectedValue({ status: 422, code: 'validation_error' });
    const apiClient = { request } as any;

    const result = await verifyOtp(apiClient, '9876543210', '123456');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('validation_error');
  });
});

describe('sendOtp', () => {
  it('does not require a platform field (backend SendOTPRequest has none)', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    const apiClient = { request } as any;

    await sendOtp(apiClient, '9876543210');

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/v1/otp/send', body: { phone: '9876543210' } }),
    );
  });
});

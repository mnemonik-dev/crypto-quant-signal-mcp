import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockSend = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

describe('email module', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('maskEmail produces a***@domain shape', async () => {
    const { maskEmail } = await import('../src/lib/email.js');
    expect(maskEmail('alice@example.com')).toBe('a***@example.com');
    expect(maskEmail('bob+work@subdomain.test.org')).toBe('b***@subdomain.test.org');
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });

  it('getResendClient returns null when RESEND_API_KEY is unset (no crash)', async () => {
    delete process.env.RESEND_API_KEY;
    const { getResendClient } = await import('../src/lib/email.js');
    expect(getResendClient()).toBeNull();
  });

  it('sendWelcomeEmail no-ops when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendWelcomeEmail } = await import('../src/lib/email.js');
    await sendWelcomeEmail({ to: 'alice@example.com', apiKey: 'av_live_xyz', tier: 'starter' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sendWelcomeEmail invokes Resend with tier-titled subject + API key in body', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    process.env.RESEND_FROM_EMAIL = 'noreply@algovault.com';
    const { sendWelcomeEmail } = await import('../src/lib/email.js');
    await sendWelcomeEmail({ to: 'alice@example.com', apiKey: 'av_live_xyz123', tier: 'pro' });
    expect(mockSend).toHaveBeenCalledOnce();
    const args = mockSend.mock.calls[0][0];
    expect(args.from).toBe('noreply@algovault.com');
    expect(args.to).toBe('alice@example.com');
    expect(args.replyTo).toBe('support@algovault.com');
    expect(args.subject).toBe('Your AlgoVault Pro API key');
    expect(args.html).toContain('av_live_xyz123');
    expect(args.html).toContain('Pro plan');
    expect(args.html).toContain('Welcome to AlgoVault Pro');
    expect(args.html).toContain('https://api.algovault.com/account');
    expect(args.text).toContain('av_live_xyz123');
    expect(args.text).toContain('Welcome to AlgoVault Pro');
  });

  it('sendKeyRecoveryEmail uses the recovery subject + same API-key body shape', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    process.env.RESEND_FROM_EMAIL = 'noreply@algovault.com';
    const { sendKeyRecoveryEmail } = await import('../src/lib/email.js');
    await sendKeyRecoveryEmail({ to: 'bob@example.com', apiKey: 'av_live_abc456', tier: 'starter' });
    expect(mockSend).toHaveBeenCalledOnce();
    const args = mockSend.mock.calls[0][0];
    expect(args.subject).toBe('AlgoVault — your API key');
    expect(args.html).toContain('av_live_abc456');
    expect(args.html).toContain('Your AlgoVault API key');
    expect(args.text).toContain('av_live_abc456');
  });

  it('falls back to noreply@algovault.com when RESEND_FROM_EMAIL is unset', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    delete process.env.RESEND_FROM_EMAIL;
    const { sendWelcomeEmail } = await import('../src/lib/email.js');
    await sendWelcomeEmail({ to: 'alice@example.com', apiKey: 'av_live_xyz', tier: 'starter' });
    expect(mockSend.mock.calls[0][0].from).toBe('noreply@algovault.com');
  });
});

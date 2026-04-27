import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/stripe.js', () => ({
  getCustomerByApiKey: vi.fn(),
  getCustomerByEmail: vi.fn(),
  createBillingPortalSession: vi.fn(),
}));
vi.mock('../src/lib/email.js', () => ({
  sendKeyRecoveryEmail: vi.fn(),
}));

import {
  accountPortalHandler,
  accountRecoverKeyHandler,
} from '../src/lib/account-handlers.js';
import * as stripeMock from '../src/lib/stripe.js';
import * as emailMock from '../src/lib/email.js';

interface MockResponse {
  statusCode: number;
  body: string;
  redirectStatus: number | null;
  redirectUrl: string | null;
  status(code: number): MockResponse;
  send(html: string): MockResponse;
  redirect(status: number, url: string): MockResponse;
}

function mockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: '',
    redirectStatus: null,
    redirectUrl: null,
    status(code: number) { this.statusCode = code; return this; },
    send(html: string) { this.body = html; return this; },
    redirect(status: number, url: string) { this.redirectStatus = status; this.redirectUrl = url; this.statusCode = status; return this; },
  };
  return res;
}

function mockReq(body: Record<string, string>) {
  return {
    body,
    protocol: 'https',
    get: (h: string) => (h === 'host' ? 'api.algovault.com' : ''),
  } as never;
}

describe('/account/portal handler', () => {
  beforeEach(() => {
    vi.mocked(stripeMock.getCustomerByApiKey).mockReset();
    vi.mocked(stripeMock.createBillingPortalSession).mockReset();
  });

  it('valid API key → 303 redirect to Stripe Billing Portal', async () => {
    vi.mocked(stripeMock.getCustomerByApiKey).mockResolvedValue({ customerId: 'cus_test_123', tier: 'pro' });
    vi.mocked(stripeMock.createBillingPortalSession).mockResolvedValue('https://billing.stripe.com/session/abc123');
    const req = mockReq({ api_key: 'av_live_validkey' });
    const res = mockRes();
    await accountPortalHandler(req, res as never);
    expect(res.redirectStatus).toBe(303);
    expect(res.redirectUrl).toBe('https://billing.stripe.com/session/abc123');
    expect(stripeMock.createBillingPortalSession).toHaveBeenCalledWith({
      customerId: 'cus_test_123',
      returnUrl: 'https://api.algovault.com/account',
    });
  });

  it('invalid API key → 401 with error page mentioning "Invalid API key"', async () => {
    vi.mocked(stripeMock.getCustomerByApiKey).mockResolvedValue(null);
    const req = mockReq({ api_key: 'av_live_bogus' });
    const res = mockRes();
    await accountPortalHandler(req, res as never);
    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('Invalid API key');
  });

  it('empty API key → 400 with error page', async () => {
    const req = mockReq({ api_key: '' });
    const res = mockRes();
    await accountPortalHandler(req, res as never);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('paste your API key');
  });

  it('Billing Portal config missing (sentinel) → 503', async () => {
    vi.mocked(stripeMock.getCustomerByApiKey).mockResolvedValue({ customerId: 'cus_test_123', tier: 'pro' });
    vi.mocked(stripeMock.createBillingPortalSession).mockResolvedValue(null);
    const req = mockReq({ api_key: 'av_live_validkey' });
    const res = mockRes();
    await accountPortalHandler(req, res as never);
    expect(res.statusCode).toBe(503);
    expect(res.body).toContain('temporarily unavailable');
  });
});

describe('/account/recover-key handler', () => {
  beforeEach(() => {
    vi.mocked(stripeMock.getCustomerByEmail).mockReset();
    vi.mocked(emailMock.sendKeyRecoveryEmail).mockReset();
    vi.mocked(emailMock.sendKeyRecoveryEmail).mockResolvedValue(undefined);
  });

  it('matched email → 200 success page + sendKeyRecoveryEmail called once', async () => {
    vi.mocked(stripeMock.getCustomerByEmail).mockResolvedValue({ apiKey: 'av_live_xyz', tier: 'starter' });
    const req = mockReq({ email: 'real@example.com' });
    const res = mockRes();
    await accountRecoverKeyHandler(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Recovery email sent');
    expect(res.body).toContain('If an active subscription exists');
    // Wait a tick for the fire-and-forget async block to settle
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(emailMock.sendKeyRecoveryEmail).toHaveBeenCalledOnce();
    expect(emailMock.sendKeyRecoveryEmail).toHaveBeenCalledWith({
      to: 'real@example.com',
      apiKey: 'av_live_xyz',
      tier: 'starter',
    });
  });

  it('non-matching email → SAME 200 success page + sendKeyRecoveryEmail NOT called (no enumeration leak)', async () => {
    vi.mocked(stripeMock.getCustomerByEmail).mockResolvedValue(null);
    const req = mockReq({ email: 'unknown@example.com' });
    const res = mockRes();
    await accountRecoverKeyHandler(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Recovery email sent');
    expect(res.body).toContain('If an active subscription exists');
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(emailMock.sendKeyRecoveryEmail).not.toHaveBeenCalled();
  });

  it('empty email → 200 success page + no Stripe lookup (no enumeration even on empty)', async () => {
    const req = mockReq({ email: '' });
    const res = mockRes();
    await accountRecoverKeyHandler(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Recovery email sent');
    expect(stripeMock.getCustomerByEmail).not.toHaveBeenCalled();
    expect(emailMock.sendKeyRecoveryEmail).not.toHaveBeenCalled();
  });
});

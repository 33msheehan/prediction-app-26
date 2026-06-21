// @vitest-environment node
//
// Integration test for the actual protection layer (proxy.ts), not just the
// pure decision logic in lib/auth/route-guard.ts. Mocks Auth.js's `auth`
// higher-order function so we can control `req.auth` without a real signed
// JWT cookie, but otherwise exercises proxy.ts's real switch statement and
// real NextResponse construction.
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

let mockSession: { user: { id: string } } | null = null;

vi.mock('@/auth', () => ({
  auth:
    (handler: (req: NextRequest & { auth: typeof mockSession }) => unknown) =>
    async (req: NextRequest) => {
      (req as NextRequest & { auth: typeof mockSession }).auth = mockSession;
      return handler(req as NextRequest & { auth: typeof mockSession });
    },
}));

const { default: proxy } = await import('./proxy');

function makeRequest(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'));
}

// proxy's NextFetchEvent param is unused by our logic; cast a stub through.
async function callProxy(path: string) {
  const res = await proxy(makeRequest(path), {} as Parameters<typeof proxy>[1]);
  if (!res) throw new Error('proxy returned no response');
  return res;
}

describe('proxy', () => {
  afterEach(() => {
    mockSession = null;
  });

  it('redirects unauthenticated access to a protected page to sign-in with a callbackUrl', async () => {
    const res = await callProxy('/forecasts');

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/api/auth/signin');
    expect(location.searchParams.get('callbackUrl')).toBe('/forecasts');
  });

  it('returns 401 json for unauthenticated access to a protected api route', async () => {
    const res = await callProxy('/api/forecasts');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('allows authenticated access to a protected page through', async () => {
    mockSession = { user: { id: 'user-1' } };
    const res = await callProxy('/forecasts');

    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('allows authenticated access to a protected api route through', async () => {
    mockSession = { user: { id: 'user-1' } };
    const res = await callProxy('/api/forecasts');

    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('allows unauthenticated access to public routes through', async () => {
    const res = await callProxy('/api/health');

    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});

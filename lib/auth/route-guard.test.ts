import { describe, expect, it } from 'vitest';
import { decideAccess, isProtectedPath } from './route-guard';

describe('isProtectedPath', () => {
  it('protects /forecasts and its sub-routes', () => {
    expect(isProtectedPath('/forecasts')).toBe(true);
    expect(isProtectedPath('/forecasts/new')).toBe(true);
    expect(isProtectedPath('/forecasts/abc-123')).toBe(true);
  });

  it('protects /calibration', () => {
    expect(isProtectedPath('/calibration')).toBe(true);
  });

  it('protects /api routes by default', () => {
    expect(isProtectedPath('/api/forecasts')).toBe(true);
  });

  it('exempts /api/health and /api/auth/*', () => {
    expect(isProtectedPath('/api/health')).toBe(false);
    expect(isProtectedPath('/api/auth/signin')).toBe(false);
    expect(isProtectedPath('/api/auth/callback/github')).toBe(false);
  });

  it('does not exempt unrelated routes that merely share a prefix with a public route', () => {
    expect(isProtectedPath('/api/healthcheck')).toBe(true);
    expect(isProtectedPath('/api/authors')).toBe(true);
  });

  it('leaves public pages unprotected', () => {
    expect(isProtectedPath('/')).toBe(false);
  });
});

describe('decideAccess', () => {
  it('allows unauthed access to public routes', () => {
    expect(decideAccess('/', false)).toEqual({ type: 'allow' });
    expect(decideAccess('/api/health', false)).toEqual({ type: 'allow' });
  });

  it('redirects unauthed access to protected pages', () => {
    expect(decideAccess('/forecasts', false)).toEqual({ type: 'redirect-to-sign-in' });
    expect(decideAccess('/calibration', false)).toEqual({ type: 'redirect-to-sign-in' });
  });

  it('returns unauthorized for unauthed access to protected api routes', () => {
    expect(decideAccess('/api/forecasts', false)).toEqual({ type: 'unauthorized' });
  });

  it('allows authed access to protected routes', () => {
    expect(decideAccess('/forecasts', true)).toEqual({ type: 'allow' });
    expect(decideAccess('/api/forecasts', true)).toEqual({ type: 'allow' });
  });
});

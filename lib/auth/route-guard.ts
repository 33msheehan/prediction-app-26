// Pure access-decision logic for proxy.ts, factored out so it's testable
// without standing up the Edge runtime or a real JWT-decoded session.
export const PROTECTED_PAGE_PREFIXES = ['/forecasts', '/calibration'];
const PUBLIC_API_PREFIXES = ['/api/health', '/api/auth'];

export type AccessDecision =
  | { type: 'allow' }
  | { type: 'redirect-to-sign-in' }
  | { type: 'unauthorized' };

// Matches `prefix` itself or `prefix` followed by a `/`, so e.g. '/api/health'
// matches '/api/health/foo' but not '/api/healthcheck'.
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
  if (isProtectedPage) return true;

  const isApi = matchesPrefix(pathname, '/api');
  if (!isApi) return false;

  return !PUBLIC_API_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function decideAccess(pathname: string, isAuthed: boolean): AccessDecision {
  if (!isProtectedPath(pathname)) return { type: 'allow' };
  if (isAuthed) return { type: 'allow' };
  return pathname.startsWith('/api') ? { type: 'unauthorized' } : { type: 'redirect-to-sign-in' };
}

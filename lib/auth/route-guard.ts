// Pure access-decision logic for proxy.ts, factored out so it's testable
// without standing up the Edge runtime or a real JWT-decoded session.
export const PROTECTED_PAGE_PREFIXES = ['/forecasts', '/calibration'];
const PUBLIC_API_PREFIXES = ['/api/health', '/api/auth'];

export type AccessDecision =
  | { type: 'allow' }
  | { type: 'redirect-to-sign-in' }
  | { type: 'unauthorized' };

export function isProtectedPath(pathname: string): boolean {
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isProtectedPage) return true;

  const isApi = pathname === '/api' || pathname.startsWith('/api/');
  if (!isApi) return false;

  return !PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function decideAccess(pathname: string, isAuthed: boolean): AccessDecision {
  if (!isProtectedPath(pathname)) return { type: 'allow' };
  if (isAuthed) return { type: 'allow' };
  return pathname.startsWith('/api') ? { type: 'unauthorized' } : { type: 'redirect-to-sign-in' };
}

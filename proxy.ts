import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { decideAccess } from '@/lib/auth/route-guard';

export default auth((req) => {
  const decision = decideAccess(req.nextUrl.pathname, Boolean(req.auth));

  switch (decision.type) {
    case 'unauthorized':
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    case 'redirect-to-sign-in': {
      const url = new URL('/api/auth/signin', req.nextUrl.origin);
      url.searchParams.set('callbackUrl', req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
    case 'allow':
      return NextResponse.next();
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

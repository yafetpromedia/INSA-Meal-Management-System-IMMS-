import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC = ['/login', '/forgot-password', '/reset-password'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/brand') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // Tokens live in local/session storage (not cookies), so middleware cannot fully enforce auth.
  // Still block nothing wrongly — just ensure public routes are reachable and add security header.
  const res = NextResponse.next();
  res.headers.set('X-IMMS-Route', isPublic ? 'public' : 'app');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};

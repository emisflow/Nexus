import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/app(.*)',
  '/api/(.*)',
]);

export default clerkMiddleware((auth, req) => {
  const { userId } = auth();

  if (userId && req.nextUrl.pathname === '/') {
    const appUrl = new URL('/app', req.url);
    return NextResponse.redirect(appUrl);
  }

  if (isProtectedRoute(req)) {
    auth().protect();
  }
});

export const config = {
  matcher: ['/((?!_next|favicon.ico|public|api/webhooks).*)'],
};

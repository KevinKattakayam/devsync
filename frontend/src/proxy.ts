import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/signup(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/auth/reset(.*)',
]);

const authenticatedProxy = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname === '/healthz') return NextResponse.next();
  if (process.env.DEPLOYMENT_MODE === 'local' && !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return isPublicRoute(request)
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/login', request.url));
  }
  return authenticatedProxy(request, event);
}

export const config = {
  matcher: [
    // Exclude auth routes from middleware entirely to avoid clock-skew JWT loops
    '/((?!_next|login|signup|sign-in|sign-up|api/auth/reset|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api(?!/auth/reset)|trpc)(.*)',
  ],
};

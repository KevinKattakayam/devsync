import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resetDestination } from '@/lib/safe-redirect';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = resetDestination(url.searchParams.get('redirect'), request.url);
  const response = NextResponse.redirect(destination);
  // Relative Location preserves the browser origin even when the server URL is normalized by a proxy.
  response.headers.set(
    'Location',
    `${destination.pathname}${destination.search}${destination.hash}`,
  );

  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** A navigation or prefetch must never change authentication state. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let trustedOrigin: string;
  try {
    const trusted = new URL(process.env.AUTH_TRUSTED_ORIGIN || url.origin);
    if (
      !['http:', 'https:'].includes(trusted.protocol) ||
      trusted.username ||
      trusted.password ||
      trusted.pathname !== '/' ||
      trusted.search ||
      trusted.hash
    )
      throw new Error('Invalid origin');
    trustedOrigin = trusted.origin;
  } catch {
    return NextResponse.json(
      { error: 'Reset origin is not configured correctly' },
      { status: 403 },
    );
  }
  if (
    request.headers.get('origin') !== trustedOrigin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    return NextResponse.json({ error: 'Same-origin request required' }, { status: 403 });
  }
  const response = await GET(request);
  // POST must not be replayed at the destination.
  const result = new NextResponse(null, { status: 303, headers: response.headers });
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (/^__(?:session(?:_|$)|client_uat$|clerk_)/.test(cookie.name)) {
      result.cookies.set({
        name: cookie.name,
        value: '',
        path: '/',
        maxAge: 0,
        expires: new Date(0),
      });
    }
  }
  for (const name of [
    '__session',
    '__client_uat',
    '__clerk_db_jwt',
    '__clerk_handshake',
    '__clerk_auth_status',
    '__clerk_auth_reason',
  ]) {
    result.cookies.set({ name, value: '', path: '/', maxAge: 0, expires: new Date(0) });
  }
  return result;
}

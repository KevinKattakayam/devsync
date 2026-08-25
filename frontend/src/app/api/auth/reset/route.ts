import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirect") || "/login";
  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  // Clear all cookies found on the domain
  for (const cookie of allCookies) {
    response.cookies.set({
      name: cookie.name,
      value: "",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  }

  // Explicitly clear standard Clerk cookies including HttpOnly variants
  const clerkCookieNames = [
    "__session",
    "__client_uat",
    "__clerk_db_jwt",
    "__clerk_handshake",
    "__clerk_auth_status",
    "__clerk_auth_reason",
  ];

  for (const name of clerkCookieNames) {
    response.cookies.set({
      name,
      value: "",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  }

  return response;
}

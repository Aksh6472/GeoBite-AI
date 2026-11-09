import { NextResponse, type NextRequest } from "next/server";

// Early redirect for protected portals when no session cookie is present.
// Authorisation itself is always enforced by the API on every request.
export function proxy(request: NextRequest) {
  if (!request.cookies.get("gb_token")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/hospital/:path*", "/console/:path*"] };

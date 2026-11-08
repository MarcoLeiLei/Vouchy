import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/einladung", "/api/calendar", "/api/cron", "/setup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasDb = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  if (!hasDb) {
    if (pathname.startsWith("/setup") || pathname.startsWith("/api")) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const loggedIn = Boolean(request.cookies.get("vouchy_session")?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!loggedIn && !isPublic) {
    if (pathname.startsWith("/api")) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-touch-icon|sw.js|manifest.webmanifest|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)"],
};

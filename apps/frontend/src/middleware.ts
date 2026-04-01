import { type NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/setup"]

export function middleware(request: NextRequest) {
  const token = request.cookies.get("fitcoach_token")
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (token && isPublic) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

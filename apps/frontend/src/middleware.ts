import { type NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/setup"]
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  const valid = await isAuthenticated(request)

  if (!valid && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (valid && isPublic) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

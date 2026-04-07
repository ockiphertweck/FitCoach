import { jwtVerify } from "jose"
import { type NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/setup"]

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-secret-for-build-only"
)

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get("fitcoach_token")?.value
  if (!token) return false
  try {
    await jwtVerify(token, JWT_SECRET)
    return true
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

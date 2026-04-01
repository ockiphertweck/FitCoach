import { jwtVerify } from "jose"
import { type NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/setup"]

async function isValidToken(token: string): Promise<boolean> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    await jwtVerify(token, secret)
    return true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const tokenCookie = request.cookies.get("fitcoach_token")
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  const valid = tokenCookie ? await isValidToken(tokenCookie.value) : false

  if (!valid && !isPublic) {
    const response = NextResponse.redirect(new URL("/login", request.url))
    if (tokenCookie) response.cookies.delete("fitcoach_token")
    return response
  }

  if (valid && isPublic) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

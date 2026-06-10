/**
 * Next.js Proxy(Next 16+ 替代 middleware.ts)— Supabase session 自动 refresh
 * plan §8.24 §D.1
 *
 * @supabase/ssr 必备:每次请求时调 supabase.auth.getUser(),
 * 让 cookie 里的 JWT 自动续期。否则用户 session 会因 token 过期被踢。
 *
 * Matcher 排除静态资源 / image / API(API 自己处理 auth)
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { guardApiRequest } from "@/lib/api-guard";

export async function proxy(request: NextRequest) {
  // /api 写请求:同源校验 + 限流(挡 curl 刷 token / 跨站盗用),不阻断站内游客
  if (request.nextUrl.pathname.startsWith("/api")) {
    return guardApiRequest(request) ?? NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 触发 refresh token(必须,不调 getUser session 不会续期)
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * 页面路径(走 Supabase session refresh),排除:
     * - _next/static / _next/image(Next.js 内建)
     * - favicon / 图片资源
     * - /api(走下面的 api 同源 guard,不做 session refresh)
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    /*
     * /api 路径(走同源 guard + 限流)
     */
    "/api/:path*",
  ],
};

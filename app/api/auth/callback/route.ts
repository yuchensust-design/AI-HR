/**
 * Supabase auth callback — plan §8.24 §D.1
 *
 * 用于:
 *   1. 邮箱验证链接回跳(v1 不开邮箱验证,但留口子)
 *   2. v2 OAuth(GitHub / Google)回跳
 *
 * 流程:Supabase 把 ?code=xxx 带回来,我们 exchange 成 session cookie 后 redirect
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

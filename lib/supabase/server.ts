/**
 * Supabase 服务端 client — plan §8.24 §D.1
 *
 * 用于:Server Components / Route Handlers / Server Actions
 *
 * Next.js 16 起 cookies() 是异步的,必须 await。
 * 用 @supabase/ssr 自动同步 session cookie。
 *
 * 用法:
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 在 Server Component 中调用会触发,可以忽略
            // 因为 middleware 会处理 session 刷新
          }
        },
      },
    },
  );
}

/**
 * 后端管理员 client — 用 service_role key,绕过 RLS
 * 仅在 API Route 内部使用,绝不在客户端 / Server Component 直接调用
 * 用于:用户注册后插入 profiles row 等需要 elevated 权限的操作
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

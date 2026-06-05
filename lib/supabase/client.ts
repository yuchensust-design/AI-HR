/**
 * Supabase 浏览器端 client — plan §8.24 §D.1
 *
 * 用于:Client Components / 用户事件 handler
 * 不能用于:Server Components / API Routes(那边用 ./server.ts)
 *
 * 自动管理 cookie session(@supabase/ssr 负责),
 * 跟 Next.js 16 App Router 兼容
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

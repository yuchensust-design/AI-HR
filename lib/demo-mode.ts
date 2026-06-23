/**
 * 账号级演示模式(直播专用)
 *
 * 思路:只有登录为「林舟」演示账号时,相关 AI 接口才走「2s 假思考 + 返回冻结结果」,
 * 其他所有用户 / 整个生产流程行为完全不变。demo 逻辑集中在这里,各 route 只调一行。
 *
 * 为什么不用全局 env:这样生产站和演示站是同一份部署,登录哪个号决定看到真跑还是冻结,
 * 评委想看「真的」随时切回普通账号即可。
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 演示账号邮箱(种数据脚本 scripts/seed-demo.mjs 里一致) */
export const DEMO_EMAIL = "linzhou.demo@offercatcher.app";

/** 仅开发环境生效的测试口令:curl 带 header `x-demo-user: <这个值>` 即可命中 demo 分支,方便本地验证 */
const DEV_DEMO_HEADER = "x-demo-user";
const DEV_DEMO_VALUE = "linzhou";

/**
 * 判断当前请求是否来自演示账号。
 * - 生产/线上:唯一依据 = 登录用户邮箱 === DEMO_EMAIL
 * - 本地 dev:额外允许 header 测试口(不会进生产逻辑)
 */
export async function isDemoRequest(req?: Request): Promise<boolean> {
  if (
    process.env.NODE_ENV !== "production" &&
    req?.headers.get(DEV_DEMO_HEADER) === DEV_DEMO_VALUE
  ) {
    return true;
  }
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    return user?.email === DEMO_EMAIL;
  } catch {
    return false;
  }
}

/** 假装 AI 在思考的时延(默认 2s) */
export function demoSleep(ms = 2000): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * demo 命中时的统一出口:睡 ms 毫秒再返回冻结 JSON。
 * 用法:`const d = await demoFreeze(req, fixture); if (d) return d;`
 */
export async function demoFreeze(
  req: Request | undefined,
  fixture: unknown,
  ms = 2000,
): Promise<NextResponse | null> {
  if (!(await isDemoRequest(req))) return null;
  await demoSleep(ms);
  return NextResponse.json(fixture);
}

import type { Platform, PlatformAdapter } from "./types.js";
import { c51jobAdapter } from "./51job.js";
import { liepinAdapter } from "./liepin.js";
import { zhilianAdapter } from "./zhilian.js";

export const adapters: Record<Platform, PlatformAdapter> = {
  "51job": c51jobAdapter,
  liepin: liepinAdapter,
  zhilian: zhilianAdapter,
};

/**
 * 三平台并行抓取(Promise.allSettled 任一成功就返回)
 *
 * 选型(2026-06 实测):
 * - 51job 前程无忧:免登录,反爬温和,数据量中等
 * - liepin 猎聘:免登录,白领岗位全,字段最丰富
 * - zhilian 智联招聘:免登录,BEM 命名稳定,综合数据
 *
 * (BOSS 直聘 2026-06 起强制登录,游客通道完全封堵,已从平台列表移除)
 */
export const ALL_PLATFORMS: Platform[] = ["51job", "liepin", "zhilian"];

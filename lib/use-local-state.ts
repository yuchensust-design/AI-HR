"use client";

import { useEffect, useState, useCallback } from "react";
import { M5_STORAGE_KEYS } from "@/lib/interview-types";

/**
 * useLocalState — localStorage 状态 hook
 *
 * 用法:
 *   const [profile, setProfile, clearProfile] = useLocalState('user_profile', { name: '' });
 *
 * 自动:
 * - hydrate 从 localStorage 读初值(SSR safe)
 * - 任何 setState 自动同步到 localStorage(JSON 序列化)
 * - clearState 移除该 key
 *
 * v1 游客模式 — 所有用户数据通过这个 hook 持久化(PRD §3.9.2)
 */

export function useLocalState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // 初始化:server 端 + 客户端 hydration 时都用 defaultValue
  const [state, setState] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);

  // 客户端首次加载从 localStorage 读
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setState(JSON.parse(raw));
      }
    } catch (err) {
      console.warn(`useLocalState read error for "${key}":`, err);
    }
    setLoaded(true);
  }, [key]);

  // 写入(state 变化时同步 localStorage)
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
      console.warn(`useLocalState write error for "${key}":`, err);
    }
  }, [key, state, loaded]);

  // 清除
  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn(`useLocalState clear error for "${key}":`, err);
    }
    setState(defaultValue);
  }, [key, defaultValue]);

  return [state, setState, clear];
}

/**
 * 全项目 localStorage 键名常量(避免硬编码字符串散落)
 */
export const STORAGE_KEYS = {
  USER_PROFILE: "user_profile", // { persona_tag, selected_at }
  RIASEC_RESULT: "riasec_result", // { riasec, riasecCode, answers, completedAt }
  PARSED_RESUME: "parsed_resume", // 解析后的简历结构
  JD_CONTEXT: "jd_context", // 当前 JD + 拆解
  HIDDEN_EXPERIENCES: "hidden_experience_candidates",
  LEARNING_PLAN: "learning_plan",
  FINAL_RESUME: "final_resume", // { markdown, lastUpdated }
  M3_REJECTION_REASONS: "m3_rejection_reasons", // { [editId]: { reason, note?, ts } } — PM 06 §3.4
  INTERVIEW_SESSIONS: "interview_sessions", // 最近 5 场
  PROJECT_BRIEF: "project_brief",
  LEARNING_CARDS: "learning_cards", // 学习卡组进度
  // M6 智能岗位匹配
  DISCOVER_FILTERS: "discover_filters", // { role, city }
  DISCOVER_SEARCH_JOBS: "discover_search_jobs", // 搜索 tab 结果
  DISCOVER_SEARCH_PAGE: "discover_search_page", // 搜索 tab 已加载到第几页(加载更多用)
  DISCOVER_RECOMMENDED_JOBS: "discover_recommended_jobs", // 推荐 tab 结果
  DISCOVER_TAB: "discover_tab", // 'search' | 'recommend'
  DISCOVER_MATCH_META: "discover_match_meta", // { keywords, city, reasoning, stats }
  DISCOVER_RECOMMEND_SIG: "discover_recommend_sig", // 生成推荐时所依据简历的内容签名 — 简历变了即失效缓存
  /**
   * M6 → M3/M5 的"待消费" raw JD 输入(M3 解析后存 JD_CONTEXT;M5 直接填 JD 字段后清除)
   * Schema: { jdText?, roleName, company, salary?, city?, jdUrl, from_m6: true, sourceJobId, platform }
   */
  M6_PENDING_JD: "m6_pending_jd",
  /**
   * M4 项目陪练 — 用户已经生成 / 在做的项目集合。
   * Schema: M4Project[],见 lib/m4-types.ts。
   */
  M4_PROJECTS: "m4_projects",
  /**
   * M2 经历挖掘 — intake_artifact 主键名
   */
  M2_INTAKE: "intake_artifact",
  M2_BULLETS: "candidate_bullets",
  M2_CATEGORIES: "m2_categories",
  M2_DEPTH: "m2_depth",
  /**
   * M1→M4 直通 — 用户从 M1 result 点击的目标岗位
   * Schema: { role_type, industry, employability_level, saved_at }
   */
  M1_TARGET_ROLE: "m1_target_role",
  /**
   * M3 优化目标多选 chip — M3OptimizationGoalKey[]
   */
  M3_OPTIMIZATION_GOALS: "m3_optimization_goals",
} as const;

/**
 * 模块前缀:所有 m1~m5 / 看岗位(discover)的本地缓存键都以这些开头,
 * 包括动态拼接的会话级缓存(m3_decisions_<conv>、m3_edits_*、m5_live_progress、
 * m4_master_conv_id、m1_quiz_draft 等)。前缀扫描 = 对将来同规范的新键自动生效。
 */
const PERSONAL_KEY_PREFIXES = ["m1_", "m2_", "m3_", "m4_", "m5_", "discover_"];

/**
 * 隐私:清掉本地所有"个人数据"localStorage 键。
 * 登出 / 切换账号时调用,防止公用电脑上下一个人看到上一个登录用户的
 * 简历 / 测评 / 面试 / 挖经历 / 补项目 / 看岗位推荐等。
 *
 * 覆盖:① STORAGE_KEYS 全量固定键(parsed_resume / final_resume / riasec_result 等);
 *       ② 所有按模块前缀命名的键(含动态会话级缓存)。
 * 不动 Supabase 自身的 sb-* 鉴权键(signOut 已处理),也不动与个人无关的键。
 */
export function clearLocalUserData(): void {
  if (typeof window === "undefined") return;
  try {
    // STORAGE_KEYS 全量 + M5 独立命名空间(interview_session_config /
    // from_debrief_highlight 等不带模块前缀、又含个人数据的键)
    const exact = new Set<string>([
      ...Object.values(STORAGE_KEYS),
      ...Object.values(M5_STORAGE_KEYS),
    ]);
    // Object.keys 返回快照数组,遍历中 removeItem 安全
    for (const key of Object.keys(window.localStorage)) {
      if (exact.has(key) || PERSONAL_KEY_PREFIXES.some((p) => key.startsWith(p))) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* localStorage 不可用时静默 */
  }
}

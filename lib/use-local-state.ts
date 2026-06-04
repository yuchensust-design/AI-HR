"use client";

import { useEffect, useState, useCallback } from "react";

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
} as const;

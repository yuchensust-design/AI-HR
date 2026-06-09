/**
 * useLatestResume — 跨模块统一读「用户最近一份简历」
 *
 * 背景:m3(改简历)登录时把简历落库到 m3_resumes(按 conversation 多份),游客存 localStorage。
 * 但 m5/m4/m6 之前各自只读 localStorage、没读 DB → 登录用户换设备/清缓存后,账号里
 * 明明有简历却读不到。这个 hook 统一成:
 *   - 游客:读 localStorage(final_resume / parsed_resume),与历史行为一致
 *   - 登录:从 m3_resumes 取**最近一份有简历的会话**(updated_at desc),RLS 保证只看到自己的
 *
 * 注意:m5/m4/m6 自己的 convId 是它们各自模块的会话,跟 m3 简历会话无关,所以这里
 * **不按当前页 convId 读**,而是取该用户最新的一份 m3 简历(等价于 localStorage 里那份"当前简历")。
 *
 * 返回 parsedResume(对象,给 m4/m6 用)+ resumeText(字符串,给 m5 出题用)。
 * fail-safe:任何异常 → 退回 localStorage,绝不抛。
 */
"use client";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_KEYS } from "@/lib/use-local-state";
import type { ParsedResume } from "@/lib/sync/useM3Data";
import { resumeTextFrom } from "@/lib/resume-text";

export type LatestResume = {
  /** auth/DB 是否还在确定中 —— 消费方应在 loading 时不要判定"没简历" */
  loading: boolean;
  parsedResume: ParsedResume;
  finalMarkdown: string | null;
  /** 简历正文字符串(final markdown 优先,否则 parsed 摊平),给 m5 出题用 */
  resumeText: string;
  hasResume: boolean;
  source: "db" | "local" | "none";
};

const EMPTY: LatestResume = {
  loading: true,
  parsedResume: null,
  finalMarkdown: null,
  resumeText: "",
  hasResume: false,
  source: "none",
};

function readLocal(): LatestResume {
  if (typeof window === "undefined") return EMPTY;
  let parsedResume: ParsedResume = null;
  let finalMarkdown: string | null = null;
  try {
    parsedResume = JSON.parse(
      window.localStorage.getItem(STORAGE_KEYS.PARSED_RESUME) || "null",
    ) as ParsedResume;
  } catch {
    /* ignore */
  }
  try {
    const finalRaw = window.localStorage.getItem(STORAGE_KEYS.FINAL_RESUME);
    if (finalRaw) {
      const f = JSON.parse(finalRaw) as { markdown?: string } | null;
      finalMarkdown = f?.markdown ?? null;
    }
  } catch {
    /* ignore */
  }
  const resumeText = resumeTextFrom(finalMarkdown, parsedResume);
  return {
    loading: false,
    parsedResume,
    finalMarkdown,
    resumeText,
    hasResume: resumeText.trim().length > 20,
    source: resumeText.trim().length > 20 ? "local" : "none",
  };
}

export function useLatestResume(): LatestResume {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id ?? null;
  const [state, setState] = useState<LatestResume>(EMPTY);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    let cancelled = false;
    if (userLoading) {
      setState((s) => ({ ...s, loading: true }));
      return () => {
        cancelled = true;
      };
    }

    // 游客 → localStorage
    if (!userId) {
      if (!cancelled) setState(readLocal());
      return () => {
        cancelled = true;
      };
    }

    // 登录 → 取最近一份有简历的 m3 会话(RLS 只返回自己的)
    setState((s) => ({ ...s, loading: true }));
    const supabase = createClient();
    supabase
      .from("m3_resumes")
      .select("parsed_resume_json, final_resume_md, updated_at")
      .not("parsed_resume_json", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          // DB 没拿到 → 退回 localStorage(可能是刚迁移、或 guest 残留),不让用户"无简历可用"
          setState(readLocal());
          return;
        }
        const parsedResume = (data.parsed_resume_json ?? null) as ParsedResume;
        const finalMarkdown = (data.final_resume_md ?? null) as string | null;
        const resumeText = resumeTextFrom(finalMarkdown, parsedResume);
        if (resumeText.trim().length > 20) {
          setState({
            loading: false,
            parsedResume,
            finalMarkdown,
            resumeText,
            hasResume: true,
            source: "db",
          });
        } else {
          // DB 那份也太短/空 → 再看 localStorage 兜底
          setState(readLocal());
        }
      });

    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [userId, userLoading]);

  return state;
}

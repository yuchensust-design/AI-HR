/**
 * m3 多会话数据双轨 hook — plan §8.24 §B
 *
 * 游客:沿用 localStorage 4 key(单轨,plan §E.4 lock)
 * 登录 + 有 convId:从 m3_resumes 表按 conversation_id 读
 * 登录 + 没 convId:返 null 让 UI 引导用户选/新建
 */
"use client";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_KEYS } from "@/lib/use-local-state";

export type ParsedResume = {
  basic?: { name?: string | null; major?: string | null; year_level?: string | null };
  experience?: unknown[];
  projects?: unknown[];
  meta?: { parse_quality?: string };
} | null;

export type JdCtx = {
  jd_summary?: string;
  jd_keywords?: string[];
  must_have?: string[];
  nice_to_have?: string[];
  jd_requirements_parsed?: { type?: string; text?: string }[];
  gaps?: { jd_requirement?: string; why_gap?: string; fixable?: string }[];
  priority_score?: number;
  role_name?: string;
  company?: string;
  rawJdText?: string;
  raw_jd_text?: string;
  meta?: { mode?: string; confidence?: string; parsed_at?: string };
} | null;

export type FinalResume = {
  markdown?: string;
  lastUpdated?: string;
} | null;

export type M3Data = {
  parsed: ParsedResume;
  jd: JdCtx;
  hidden: unknown[];
  final: FinalResume;
  updatedAt: string | null;
  /** 已生成过分析结果(edits 已缓存)— 用于"点会话直达结果页"判断 */
  analyzed: boolean;
};

const EMPTY: M3Data = { parsed: null, jd: null, hidden: [], final: null, updatedAt: null, analyzed: false };

function readLocal(): M3Data {
  if (typeof window === "undefined") return EMPTY;
  try {
    return {
      parsed: JSON.parse(window.localStorage.getItem(STORAGE_KEYS.PARSED_RESUME) || "null"),
      jd: JSON.parse(window.localStorage.getItem(STORAGE_KEYS.JD_CONTEXT) || "null"),
      hidden: JSON.parse(window.localStorage.getItem(STORAGE_KEYS.HIDDEN_EXPERIENCES) || "[]"),
      final: JSON.parse(window.localStorage.getItem(STORAGE_KEYS.FINAL_RESUME) || "null"),
      updatedAt: null,
      analyzed: false,
    };
  } catch {
    return EMPTY;
  }
}

export function useM3Data(convId: string | null) {
  const { user, loading: userLoading } = useUser();
  const [data, setData] = useState<M3Data>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (userLoading) return;

    // 游客:从 localStorage 读
    if (!user) {
      if (!cancelled) {
        setData(readLocal());
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    // 登录无 conv id:显示空,让 UI 提示选/新建
    if (!convId) {
      if (!cancelled) {
        setData(EMPTY);
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    // 登录 + conv id:从 DB 读
    const supabase = createClient();
    setLoading(true);
    supabase
      .from("m3_resumes")
      .select("*")
      .eq("conversation_id", convId)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled) return;
        setData({
          parsed: row?.parsed_resume_json ?? null,
          jd: row?.jd_context_json ?? null,
          hidden: Array.isArray(row?.hidden_experience_json) ? row.hidden_experience_json : [],
          final: row?.final_resume_md
            ? { markdown: row.final_resume_md, lastUpdated: row.updated_at }
            : null,
          updatedAt: row?.updated_at ?? null,
          analyzed: !!(row?.edits_json || row?.final_resume_md),
        });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, userLoading, convId]);

  return { data, loading, isGuest: !user, hasConv: !!convId };
}

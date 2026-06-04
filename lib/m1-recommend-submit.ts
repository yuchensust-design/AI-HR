"use client";

import { migrateAnswersSchema } from "@/lib/quiz-data";
import { M1_SAMPLE } from "@/lib/m1-sample";

export type M1Evidence = {
  source: "resume" | "chat" | "skip";
  summary: string;
  tags: string[];
  rawSnippet?: string;
  userNotes?: string;
  quality?: "high" | "mid" | "low";
  createdAt: string;
};

export const EMPTY_EVIDENCE: M1Evidence = {
  source: "skip",
  summary: "",
  tags: [],
  createdAt: new Date(0).toISOString(),
};

function readQuizAnswers(): unknown | null {
  try {
    const raw = window.localStorage.getItem("m1_quiz_answers");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSampleFallback() {
  try {
    window.localStorage.setItem(
      "riasec_result",
      JSON.stringify({
        ...M1_SAMPLE,
        completedAt: new Date().toISOString(),
        fallback: "api-error",
      })
    );
    window.localStorage.removeItem("m1_evidence");
  } catch {
    // ignore
  }
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string; fellBackToSample: boolean };

/**
 * 客户端通用:把 answers + evidence 提交给 /api/m1/recommend,
 * 成功后写 riasec_result + m1_evidence,失败兜底 sample。
 *
 * 用法 — 三条路径(resume / chat / skip)共用此函数。
 */
export async function submitM1Recommendation(opts: {
  answers?: unknown;
  evidence: M1Evidence;
}): Promise<SubmitResult> {
  const rawAnswers = opts.answers ?? readQuizAnswers();
  const sanitized = migrateAnswersSchema(rawAnswers);

  if (Object.keys(sanitized).length === 0) {
    return {
      ok: false,
      error: "没读到测评答案,请回 /m1/quiz 重新答",
      fellBackToSample: false,
    };
  }

  // skip 路径不传 evidence 给后端,让 LLM 走二段融合逻辑
  const body =
    opts.evidence.source === "skip"
      ? { answers: sanitized }
      : { answers: sanitized, evidence: opts.evidence };

  try {
    const res = await fetch("/api/m1/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `请求失败: ${res.status}`);
    }
    const data = await res.json();
    try {
      window.localStorage.setItem(
        "riasec_result",
        JSON.stringify({
          ...data,
          answers: sanitized,
          evidence: opts.evidence,
          refineCount: 0,
        })
      );
      window.localStorage.setItem(
        "m1_evidence",
        JSON.stringify(opts.evidence)
      );
      window.localStorage.removeItem("m1_quiz_draft");
    } catch {
      // localStorage quota 满之类的边缘情况,忽略
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeSampleFallback();
    return { ok: false, error: msg, fellBackToSample: true };
  }
}

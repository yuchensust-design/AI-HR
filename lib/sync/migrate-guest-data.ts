/**
 * 游客 → 登录数据迁移 — plan §8.24 §F
 *
 * 触发:useUser 检测 user 从 null 变为 not-null + localStorage 无 data_migrated_at flag
 * 行为:扫所有 localStorage key,批量上传到对应 DB 表,然后写 flag 防重复
 *
 * 冲突策略(v1 简化):
 *   - m1_assessments:upsert by user_id(用户首次登录通常 DB 空)
 *   - m3:create 1 个新 conv + m3_resumes(标"我的简历 · 迁移")
 *   - m5:每场 interview_sessions 各 create 1 conv + m5_interviews
 *   - diary / tracker:批量 insert
 *
 * localStorage 不删 — 即使迁移失败用户本地数据仍在
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_KEYS } from "@/lib/use-local-state";
import { createConversation } from "@/lib/conversations";

const MIGRATED_AT_KEY = "data_migrated_at";

type MigrateReport = {
  m1: boolean;
  m3: boolean;
  m5: number;
  diary: number;
  tracker: number;
  errors: string[];
};

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function hasMigrated(): boolean {
  if (typeof window === "undefined") return true;
  return !!window.localStorage.getItem(MIGRATED_AT_KEY);
}

export async function migrateGuestDataOnLogin(
  userId: string,
  supabase: SupabaseClient,
): Promise<MigrateReport> {
  const report: MigrateReport = {
    m1: false,
    m3: false,
    m5: 0,
    diary: 0,
    tracker: 0,
    errors: [],
  };

  // ===== m1 测评 =====
  const riasec = readLocal<unknown>(STORAGE_KEYS.RIASEC_RESULT, null);
  if (riasec) {
    const { error } = await supabase
      .from("m1_assessments")
      .upsert({ user_id: userId, riasec_json: riasec });
    if (error) report.errors.push(`m1: ${error.message}`);
    else report.m1 = true;
  }

  // ===== m3 简历 =====
  const parsed = readLocal<unknown>(STORAGE_KEYS.PARSED_RESUME, null);
  const jd = readLocal<unknown>(STORAGE_KEYS.JD_CONTEXT, null);
  const hidden = readLocal<unknown[]>(STORAGE_KEYS.HIDDEN_EXPERIENCES, []);
  const finalResume = readLocal<{ markdown?: string } | null>(STORAGE_KEYS.FINAL_RESUME, null);
  if (parsed || jd || (hidden && hidden.length > 0) || finalResume?.markdown) {
    const convId = await createConversation("m3", "我的简历 · 迁移", supabase);
    if (convId) {
      const { error } = await supabase
        .from("m3_resumes")
        .update({
          parsed_resume_json: parsed,
          jd_context_json: jd,
          hidden_experience_json: hidden,
          final_resume_md: finalResume?.markdown ?? null,
        })
        .eq("conversation_id", convId);
      if (error) report.errors.push(`m3: ${error.message}`);
      else report.m3 = true;
    }
  }

  // ===== m5 面试历史(每场各 1 conv)=====
  type InterviewSession = {
    id: string;
    config: { jd_text?: string; type?: string };
    questions?: unknown[];
    answers?: unknown[];
    turn_evaluations?: unknown[];
    debrief?: unknown;
  };
  const sessions = readLocal<InterviewSession[]>(STORAGE_KEYS.INTERVIEW_SESSIONS, []);
  for (const s of sessions) {
    const title = `${(s.config?.type ?? "面试").slice(0, 8)} · ${(s.config?.jd_text ?? "").slice(0, 12) || "迁移"}`;
    const convId = await createConversation("m5", title, supabase);
    if (!convId) {
      report.errors.push("m5: create conv failed");
      continue;
    }
    const { error } = await supabase
      .from("m5_interviews")
      .update({
        config_json: s.config,
        turns_json: {
          questions: s.questions ?? [],
          answers: s.answers ?? [],
          turn_evaluations: s.turn_evaluations ?? [],
        },
        debrief_md: s.debrief ? JSON.stringify(s.debrief) : null,
      })
      .eq("conversation_id", convId);
    if (error) report.errors.push(`m5: ${error.message}`);
    else report.m5++;
  }

  // ===== 日记 =====
  type DiaryEntry = {
    id?: string;
    createdAt?: string;
    content?: string;
    title?: string;
    source?: string;
    rawDialog?: unknown;
    metadata?: unknown;
    summary_meta?: unknown;
    highlights?: unknown;
    imageBase64?: string | null;
  };
  const diary = readLocal<DiaryEntry[]>("buer_diary_entries", []);
  if (diary && diary.length > 0) {
    const rows = diary.map((e) => ({
      user_id: userId,
      content: e.content ?? "",
      title: e.title ?? null,
      source: e.source ?? null,
      raw_dialog_json: e.rawDialog ?? null,
      metadata_json: e.metadata ?? null,
      summary_meta_json: e.summary_meta ?? null,
      highlights_json: e.highlights ?? null,
      image_url: e.imageBase64 ?? null,
      created_at: e.createdAt ?? new Date().toISOString(),
    }));
    const { error } = await supabase.from("diary_entries").insert(rows);
    if (error) report.errors.push(`diary: ${error.message}`);
    else report.diary = rows.length;
  }

  // ===== Tracker 投递 =====
  type TrackerApp = {
    id?: string;
    appliedAt?: string;
    statusUpdatedAt?: string;
    [k: string]: unknown;
  };
  const tracker = readLocal<TrackerApp[]>("tracker_applications_v1", []);
  if (tracker && tracker.length > 0) {
    const rows = tracker.map((a) => ({
      user_id: userId,
      applied_at: a.appliedAt ?? null,
      status_updated_at: a.statusUpdatedAt ?? null,
      data_json: a,
    }));
    const { error } = await supabase.from("tracker_applications").insert(rows);
    if (error) report.errors.push(`tracker: ${error.message}`);
    else report.tracker = rows.length;
  }

  // 写 flag 防重复(即使部分失败也写,避免重复 insert 重复数据)
  try {
    window.localStorage.setItem(MIGRATED_AT_KEY, new Date().toISOString());
  } catch {
    // ignore
  }

  return report;
}

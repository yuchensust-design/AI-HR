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
  m2: boolean;
  m3: boolean;
  m4: boolean;
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
    m2: false,
    m3: false,
    m4: false,
    m5: 0,
    diary: 0,
    tracker: 0,
    errors: [],
  };

  // ===== m1 测评 =====
  // 游客 riasec_result 是扁平 RecommendResult(见 lib/m1-recommend-submit.ts);必须拆成
  // m1_assessments 的两列 riasec_json + recommendation_json,否则 recommendation_json 为 NULL,
  // result 页守卫(要求两列都非空)失败 → 清缓存 / 换设备后回退 SAMPLE 样例。对齐
  // app/api/m1/recommend/route.ts 登录态写库的形状。
  const riasec = readLocal<Record<string, unknown> | null>(STORAGE_KEYS.RIASEC_RESULT, null);
  if (riasec && typeof riasec === "object") {
    const { error } = await supabase.from("m1_assessments").upsert({
      user_id: userId,
      riasec_json: {
        scores: riasec.scores ?? null,
        code: riasec.code ?? null,
        confidence: riasec.confidence ?? null,
      },
      recommendation_json: {
        positive: riasec.positive ?? null,
        negative: riasec.negative ?? null,
        refine_chips: riasec.refine_chips ?? null,
        rationale: riasec.rationale ?? null,
        evidence: riasec.evidence ?? null,
        disclaimer: riasec.disclaimer ?? null,
      },
      completed_at: new Date().toISOString(),
    });
    if (error) report.errors.push(`m1: ${error.message}`);
    else report.m1 = true;
  }

  // ===== m2 挖经历 =====
  // 游客 m2 数据按 scope='guest' 存 localStorage(intake_artifact:guest 等);迁移前无任何 m2 分支
  // → 登录后 getOrCreateConversation 选到的新会话读空行,挖出的角色/bullets/对话全丢。
  // 这里建一个 m2 会话并写 m2_intakes.intake_json={intake,bullets,fills,messages}(对齐 useM2DBSync)。
  const m2Intake = readLocal<{ roles?: unknown[]; stories?: unknown[] } | null>(
    `${STORAGE_KEYS.M2_INTAKE}:guest`,
    null,
  );
  const m2Bullets = readLocal<unknown[]>(`${STORAGE_KEYS.M2_BULLETS}:guest`, []);
  const m2Fills = readLocal<unknown>(`m2_bullet_fills:guest`, null);
  const m2Messages = readLocal<unknown[]>(`m2_messages:guest`, []);
  const hasM2 =
    (Array.isArray(m2Bullets) && m2Bullets.length > 0) ||
    (Array.isArray(m2Messages) && m2Messages.length > 0) ||
    !!(m2Intake && (((m2Intake.roles?.length ?? 0) > 0) || ((m2Intake.stories?.length ?? 0) > 0)));
  if (hasM2) {
    const convId = await createConversation("m2", "我的挖经历 · 迁移", supabase);
    if (convId) {
      const { error } = await supabase
        .from("m2_intakes")
        .upsert(
          {
            conversation_id: convId,
            intake_json: {
              intake: m2Intake,
              bullets: m2Bullets,
              fills: m2Fills,
              messages: m2Messages,
            },
          },
          { onConflict: "conversation_id" },
        );
      if (error) report.errors.push(`m2: ${error.message}`);
      else report.m2 = true;
    }
  }

  // ===== m4 补项目 =====
  // 游客 m4 卡片单轨存 localStorage(m4_projects);迁移前无 m4 分支 → 登录后 listConversations→convs[0]
  // 选到的新会话读空行,卡片消失。建 m4 会话并写 m4_projects.learning_cards_json(对齐 useM4Projects)。
  const m4Projects = readLocal<unknown[]>(STORAGE_KEYS.M4_PROJECTS, []);
  if (Array.isArray(m4Projects) && m4Projects.length > 0) {
    const convId = await createConversation("m4", "我的补项目 · 迁移", supabase);
    if (convId) {
      const { error } = await supabase
        .from("m4_projects")
        .upsert(
          { conversation_id: convId, learning_cards_json: m4Projects },
          { onConflict: "conversation_id" },
        );
      if (error) report.errors.push(`m4: ${error.message}`);
      else report.m4 = true;
    }
  }

  // ===== m3 简历 =====
  const parsed = readLocal<unknown>(STORAGE_KEYS.PARSED_RESUME, null);
  const jd = readLocal<unknown>(STORAGE_KEYS.JD_CONTEXT, null);
  const hidden = readLocal<unknown[]>(STORAGE_KEYS.HIDDEN_EXPERIENCES, []);
  const finalResume = readLocal<{ markdown?: string } | null>(STORAGE_KEYS.FINAL_RESUME, null);
  if (parsed || jd || (hidden && hidden.length > 0) || finalResume?.markdown) {
    const convId = await createConversation("m3", "我的简历 · 迁移", supabase);
    if (convId) {
      // upsert(create-or-update):即便子表行因偶发失败没被预插,也能补建,
      // 避免 update 0 行命中导致迁移的简历/JD/素材静默丢失。
      const { error } = await supabase
        .from("m3_resumes")
        .upsert(
          {
            conversation_id: convId,
            parsed_resume_json: parsed,
            jd_context_json: jd,
            hidden_experience_json: hidden,
            final_resume_md: finalResume?.markdown ?? null,
          },
          { onConflict: "conversation_id" },
        );
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
    // 关键:带上本地 id 作 DB 主键 + upsert onConflict id。
    // 原来 insert 不带 id → DB 生成新 UUID,而 useDiarySync 同步时用的是本地 id,
    // 两套 id 并存 → mergeEntriesFromDB 按 id 去重失效 → 登录后每篇日记重复显示两条。
    // 与 useDiarySync「local id = DB id」的不变式对齐,迁移与实时同步互相幂等。
    const rows = diary.map((e) => ({
      ...(e.id ? { id: e.id } : {}),
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
    const { error } = await supabase
      .from("diary_entries")
      .upsert(rows, { onConflict: "id" });
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

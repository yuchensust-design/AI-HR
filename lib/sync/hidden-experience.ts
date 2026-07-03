/**
 * 飞轮喂料总线 — 统一往「改简历」的素材池 hidden_experience_json 回写
 *
 * 背景(见 docs/superpowers/specs/2026-06-10-flywheel-module-connections-design.md):
 * 练面试 / 挖经历 / 补项目 都要把"挖出来的素材"喂进 改简历 的 suggest-edits。
 * 这三条共用同一条已验证的总线 = m3_resumes.hidden_experience_json,而不是各发明一套。
 *
 * 这个模块把那条总线的三个易错点收成公共函数,三个来源都调它,避免各写各的:
 *   A. 写哪一行   —— resolveResumeRow():永远落在"看岗位/练面试用的那份简历"所在会话
 *                    (= useLatestResume 同一条查询:最新一行有简历的 m3_resumes)。
 *   B. 去重       —— mergeHiddenExperience():按 question_id 去重 merge,反复采纳不堆重复。
 *   C. 游客/登录  —— appendHiddenToLocal()(localStorage) vs backfillHiddenToLatestResume()(DB)。
 *
 * mergeHiddenExperience 是纯函数,单测覆盖(hidden-experience.test.ts)。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_KEYS } from "@/lib/use-local-state";

/** 改简历素材池的统一条目格式(与 app/m3/excavate 的 HiddenExperience 对齐,suggest-edits 直接消费)。 */
export type HiddenExperience = {
  question_id: string;
  topic_name: string;
  raw_user_material: string;
  star_breakdown:
    | { situation?: string; task?: string; action?: string; result?: string }
    | null;
  candidate_bullets: { text: string; anti_fab_note: string | null }[];
  skeptical_flags?: string[];
  /**
   * 飞轮素材类型 — 让 suggest-edits 的 callHiddenBucket 按字段【确定性】分流落点,
   * 不再只靠 topic_name 前缀猜(m2「挖经历·」/m5「M5 复盘亮点·」原本都不带「补项目/补能力」前缀,会落点误判)。
   * - "project"    → 真做了项目,落 new:projects(STAR 成果)
   * - "experience" → 真实经历亮点(挖经历 / 面试回流),同样落 new:projects(成果 bullet)
   * - "learning"   → 只学了概念/入门,落 new:skills / new:self_eval,不冒充项目
   * 旧数据没有此字段 → callHiddenBucket 退回 topic_name 前缀启发式。
   */
  material_kind?: "project" | "experience" | "learning";
  /** 项目类素材的项目名称(让简历能以「项目格式」显示名称) */
  project_name?: string;
  /** 项目类素材的时间(起止),如 "2026.05 – 2026.05" 或 "约 3 周" */
  project_period?: string;
};

/**
 * 按 question_id 去重 merge:existing 在前、保序;toAdd 里 question_id 已存在的丢弃。
 * 缺 question_id 的条目一律保留(不参与去重),避免误删。纯函数 → 可单测。
 */
export function mergeHiddenExperience(
  existing: HiddenExperience[],
  toAdd: HiddenExperience[],
): HiddenExperience[] {
  const seen = new Set<string>();
  for (const e of existing) {
    if (e?.question_id) seen.add(e.question_id);
  }
  const fresh = toAdd.filter((he) => {
    const id = he?.question_id;
    if (!id) return true; // 无 id → 不去重,保留
    if (seen.has(id)) return false; // 已存在 → 丢弃
    seen.add(id); // 同一批里也去重
    return true;
  });
  return [...existing, ...fresh];
}

/** 从未知值安全取出 HiddenExperience[](DB jsonb / localStorage 解析后都可能是任意值)。 */
export function asHiddenList(v: unknown): HiddenExperience[] {
  return Array.isArray(v) ? (v as HiddenExperience[]) : [];
}

/**
 * 解析"该写哪一行 m3_resumes":最新一行有简历的会话。
 * 与 lib/sync/useLatestResume.ts 同一条查询 → 回写落在用户当前在用的那份简历上,
 * 不会跑到空会话(飞轮报告 §3 风险A)。没有任何带简历的会话 → 返回 null,调用方走兜底。
 */
export async function resolveResumeRow(
  supabase: SupabaseClient,
): Promise<{ conversation_id: string; hidden_experience_json: HiddenExperience[] } | null> {
  const { data } = await supabase
    .from("m3_resumes")
    .select("conversation_id, hidden_experience_json")
    .not("parsed_resume_json", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const convId = (data as { conversation_id?: string } | null)?.conversation_id;
  if (!convId) return null;
  return {
    conversation_id: convId,
    hidden_experience_json: asHiddenList(
      (data as { hidden_experience_json?: unknown }).hidden_experience_json,
    ),
  };
}

/**
 * 登录态:把素材去重 merge 进"最新那份简历"会话的 hidden_experience_json(DB)。
 * 返回目标 conversation_id(供跳 /m3/result?c=&backfill=1);没有带简历的会话 → null。
 */
export async function backfillHiddenToLatestResume(
  supabase: SupabaseClient,
  toAdd: HiddenExperience[],
): Promise<string | null> {
  if (toAdd.length === 0) {
    const row = await resolveResumeRow(supabase);
    return row?.conversation_id ?? null;
  }
  const row = await resolveResumeRow(supabase);
  if (!row) return null;
  const next = mergeHiddenExperience(row.hidden_experience_json, toAdd);
  const { error } = await supabase
    .from("m3_resumes")
    .update({ hidden_experience_json: next })
    .eq("conversation_id", row.conversation_id);
  if (error) {
    console.error("[hidden-experience] DB backfill failed", error);
    return null;
  }
  return row.conversation_id;
}

/**
 * 游客态:把素材去重 merge 进 localStorage 素材池。返回是否成功。
 */
export function appendHiddenToLocal(toAdd: HiddenExperience[]): boolean {
  if (toAdd.length === 0) return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.HIDDEN_EXPERIENCES);
    const existing = asHiddenList(raw ? JSON.parse(raw) : []);
    const next = mergeHiddenExperience(existing, toAdd);
    window.localStorage.setItem(STORAGE_KEYS.HIDDEN_EXPERIENCES, JSON.stringify(next));
    return true;
  } catch (e) {
    console.error("[hidden-experience] local append failed", e);
    return false;
  }
}

/**
 * M3 简历稳定 ID 辅助工具(offer-1-sparkling-hippo P0-B)
 *
 * 设计:
 *   LLM 解析简历时不会输出稳定 ID;前端在加载 parsedResume 时,递归为每个
 *   experience/projects/activities item 注入 _id,为每条 bullet 注入 _id。
 *   ID 一旦写入 storage,后续不会重新生成(stable across reloads)。
 *
 *   suggest-edits 服务端在返回 edits 前,根据 edit.target 字符串("experience[0].bullets[2]")
 *   lookup 对应 bullet 的 _id,写到 edit.bullet_id 字段。
 *
 *   m3/result Live Preview lookup 时优先 by bullet_id;找不到再 fallback by target 字符串;
 *   再找不到再 fallback by edit.original_text 模糊匹配。
 *
 *   这套机制让:
 *     A) 简历重新解析(章节顺序可能变)后,旧 edits 仍能写回正确 bullet
 *     B) LLM 偶尔写错 target 时,通过 original_text 兜底纠正
 */

type AnyBullet =
  | string
  | {
      id?: string;
      text?: string;
      narrative_tag?: string;
      [k: string]: unknown;
    };

type SectionItem = {
  id?: string;
  bullets?: AnyBullet[];
  [k: string]: unknown;
};

type ParsedLike = {
  experience?: SectionItem[];
  projects?: SectionItem[];
  activities?: SectionItem[];
  self_eval?: SectionItem[];
  [k: string]: unknown;
} | null | undefined;

type Section = "experience" | "projects" | "activities" | "self_eval";

const SECTIONS: Section[] = ["experience", "projects", "activities", "self_eval"];

/** 生成稳定 ID — UUID v4 简化版,12 字符就够全简历去重 */
function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * 检测 parsedResume 是否所有 section item / bullet 都已经有 stable id。
 * 用于避免重复 ensureResumeIds 造成无限渲染。
 */
export function hasAllResumeIds(resume: ParsedLike): boolean {
  if (!resume) return true;
  for (const section of SECTIONS) {
    const items = (resume as Record<Section, unknown>)[section];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const it = item as SectionItem;
      if (!it.id) return false;
      const bullets = Array.isArray(it.bullets) ? it.bullets : [];
      for (const b of bullets) {
        if (typeof b === "string") return false; // 字符串 bullet 需升级为 object 带 id
        if (b && typeof b === "object" && !b.id) return false;
      }
    }
  }
  return true;
}

/**
 * 递归补全简历的稳定 ID。
 * 已有 id 的不动;没有的注入一个新 id。
 * **幂等**:如果已经所有 ID 都齐全,返回 same reference(不触发 React 重新渲染)。
 */
export function ensureResumeIds<T extends ParsedLike>(resume: T): T {
  if (!resume) return resume;
  if (hasAllResumeIds(resume)) return resume;

  const next: ParsedLike = { ...resume };
  for (const section of SECTIONS) {
    const items = (resume as Record<Section, unknown>)[section];
    if (!Array.isArray(items)) continue;
    next[section] = items.map((item, idx) => {
      const it = item as SectionItem;
      const itemId = it.id ?? genId(`${section[0]}${idx}`);
      const bullets = Array.isArray(it.bullets) ? it.bullets : undefined;
      const newBullets = bullets?.map((b, bIdx): AnyBullet => {
        if (typeof b === "string") {
          // 字符串型 bullet 升级为 object 携带 id
          return { id: `${itemId}-b${bIdx}-${Math.random().toString(36).slice(2, 6)}`, text: b };
        }
        if (b && typeof b === "object" && !b.id) {
          return {
            ...b,
            id: `${itemId}-b${bIdx}-${Math.random().toString(36).slice(2, 6)}`,
          };
        }
        return b;
      });
      return { ...it, id: itemId, bullets: newBullets };
    });
  }
  return next as T;
}

/** 从 ParsedResume 中按 (section, sectionIdx, bulletIdx) 取出 bullet 的稳定 id */
export function lookupBulletId(
  resume: ParsedLike,
  section: Section,
  sectionIdx: number,
  bulletIdx: number,
): string | null {
  if (!resume) return null;
  const items = (resume as Record<Section, unknown>)[section];
  if (!Array.isArray(items)) return null;
  const item = items[sectionIdx] as SectionItem | undefined;
  if (!item) return null;
  const bullets = item.bullets;
  if (!Array.isArray(bullets)) return null;
  const b = bullets[bulletIdx];
  if (!b) return null;
  if (typeof b === "string") return null;
  return (b.id as string | undefined) ?? null;
}

/**
 * 解析 target 字符串 "experience[0].bullets[2]" → { section, sectionIdx, bulletIdx }
 * 返回 null 表示格式不合法或不是 bullet 改写型 target(eg "alert:" / "new:")
 */
export function parseBulletTarget(
  target: string,
): { section: Section; sectionIdx: number; bulletIdx: number } | null {
  const m = target.match(/^(experience|projects|activities|self_eval)\[(\d+)\]\.bullets\[(\d+)\]$/);
  if (!m) return null;
  return {
    section: m[1] as Section,
    sectionIdx: Number(m[2]),
    bulletIdx: Number(m[3]),
  };
}

/**
 * 按稳定 ID 在 parsedResume 里找到 bullet 的当前位置。
 * 返回 { section, sectionIdx, bulletIdx, text } 或 null(找不到)。
 */
export function findBulletById(
  resume: ParsedLike,
  bulletId: string,
): { section: Section; sectionIdx: number; bulletIdx: number; text: string } | null {
  if (!resume || !bulletId) return null;
  for (const section of SECTIONS) {
    const items = (resume as Record<Section, unknown>)[section];
    if (!Array.isArray(items)) continue;
    for (let sIdx = 0; sIdx < items.length; sIdx++) {
      const it = items[sIdx] as SectionItem;
      const bullets = Array.isArray(it.bullets) ? it.bullets : [];
      for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
        const b = bullets[bIdx];
        if (typeof b !== "string" && b?.id === bulletId) {
          return {
            section,
            sectionIdx: sIdx,
            bulletIdx: bIdx,
            text: (b.text as string) ?? "",
          };
        }
      }
    }
  }
  return null;
}

/**
 * 按原文模糊匹配在 parsedResume 里找到最相似的 bullet。
 * 用 Jaccard-like 字符集相似度,阈值 0.6。
 * 适用场景:LLM 写错 target 时的 original_text 兜底。
 */
export function findBulletByText(
  resume: ParsedLike,
  text: string,
  minSimilarity = 0.6,
): { section: Section; sectionIdx: number; bulletIdx: number; text: string; similarity: number } | null {
  if (!resume || !text || text.length < 10) return null;
  const targetChars = new Set(text.replace(/\s/g, ""));
  let best: { section: Section; sectionIdx: number; bulletIdx: number; text: string; similarity: number } | null = null;

  for (const section of SECTIONS) {
    const items = (resume as Record<Section, unknown>)[section];
    if (!Array.isArray(items)) continue;
    for (let sIdx = 0; sIdx < items.length; sIdx++) {
      const it = items[sIdx] as SectionItem;
      const bullets = Array.isArray(it.bullets) ? it.bullets : [];
      for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
        const b = bullets[bIdx];
        const bt = typeof b === "string" ? b : (b?.text as string) ?? "";
        if (!bt) continue;
        const candChars = new Set(bt.replace(/\s/g, ""));
        const inter = [...candChars].filter((c) => targetChars.has(c)).length;
        const union = new Set([...candChars, ...targetChars]).size;
        const sim = union === 0 ? 0 : inter / union;
        if (sim >= minSimilarity && (!best || sim > best.similarity)) {
          best = {
            section,
            sectionIdx: sIdx,
            bulletIdx: bIdx,
            text: bt,
            similarity: sim,
          };
        }
      }
    }
  }
  return best;
}

/**
 * 在 parsedResume 里取出 bullet 的实际文本(用 string|object 都支持)。
 */
export function getBulletText(
  resume: ParsedLike,
  section: Section,
  sectionIdx: number,
  bulletIdx: number,
): string {
  if (!resume) return "";
  const items = (resume as Record<Section, unknown>)[section];
  if (!Array.isArray(items)) return "";
  const item = items[sectionIdx] as SectionItem | undefined;
  if (!item?.bullets) return "";
  const b = item.bullets[bulletIdx];
  if (!b) return "";
  return typeof b === "string" ? b : (b.text as string) ?? "";
}

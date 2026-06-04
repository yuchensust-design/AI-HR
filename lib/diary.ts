/**
 * 日记 helper — localStorage 持久化
 *
 * 跟 PRD §3.8.6 协调:
 *   「不二」chat 会话本身 = 内存模式刷新即清(情绪倾诉敏感,不存)
 *   日记 entries = 用户主动写入(事实记录,可存)
 *   → 两条数据线分开,用户对什么进日记有完全控制权
 *
 * 走 localStorage,后端零持久化(沿用 plan §I lock)。
 *
 * plan §8.19 §B.1 lock
 */

export type DiaryEntrySource = "diary-page" | "buer-chat" | "manual";

export type DiaryEntry = {
  /** crypto.randomUUID */
  id: string;
  /** ISO timestamp */
  createdAt: string;
  /** 用户主动写入 */
  content: string;
  /** 可选:简短一行标签(用户自填或留空) */
  title?: string;
  /** base64 data URL,图片可选 */
  imageBase64?: string | null;
  /** 来源:/diary 直写 / 从「不二」 chat 桥接 / 其他 */
  source: DiaryEntrySource;
  /** LLM 挖素材时可填(eg "organization"、"leadership"),v1 留空 */
  tags?: string[];
};

const STORAGE_KEY = "buer_diary_entries";
const CONSENT_KEY = "buer_diary_consent";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function read(): DiaryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) =>
        typeof x === "object" &&
        x !== null &&
        typeof x.id === "string" &&
        typeof x.createdAt === "string" &&
        typeof x.content === "string"
    ) as DiaryEntry[];
  } catch {
    return [];
  }
}

function write(entries: DiaryEntry[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn("[diary] localStorage write failed:", e);
  }
}

/** 返回按 createdAt 倒序的所有日记(新 → 旧) */
export function getDiaryEntries(): DiaryEntry[] {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 新建并写入,返回完整 entry */
export function addEntry(
  partial: Omit<DiaryEntry, "id" | "createdAt">
): DiaryEntry {
  const entry: DiaryEntry = {
    ...partial,
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const all = read();
  all.push(entry);
  write(all);
  return entry;
}

/** 按 id 删除一条 */
export function deleteEntry(id: string): void {
  write(read().filter((e) => e.id !== id));
}

/** 清空全部 */
export function clearAllEntries(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** 导出 JSON 字符串(供用户下载备份) */
export function exportDiaryJson(): string {
  return JSON.stringify(getDiaryEntries(), null, 2);
}

/** 统计当前条数 */
export function countEntries(): number {
  return read().length;
}

/** 取本周 / 本月条数(用 createdAt 比较 ISO 字符串前缀) */
export function countByPeriod(): { week: number; month: number; total: number } {
  const all = read();
  const now = new Date();
  const monthPrefix = now.toISOString().slice(0, 7); // "2026-06"
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const weekStartIso = weekStart.toISOString();
  return {
    week: all.filter((e) => e.createdAt >= weekStartIso).length,
    month: all.filter((e) => e.createdAt.startsWith(monthPrefix)).length,
    total: all.length,
  };
}

/* ---------- 隐私同意 flag ---------- */

export function hasDiaryConsent(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(CONSENT_KEY) === "1";
}

export function setDiaryConsent(): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CONSENT_KEY, "1");
}

export function revokeDiaryConsent(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(CONSENT_KEY);
}

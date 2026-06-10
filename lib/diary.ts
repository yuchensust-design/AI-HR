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

export type DiaryEntrySource =
  | "diary-page"     // /diary 手动写
  | "buer-chat"      // chat 单条桥接(用户点"记成日记"按钮)
  | "ai-summary"     // v2 §8.20: chat 多轮 → LLM 整理成第一人称日记
  | "manual";

export type DiaryEntry = {
  /** crypto.randomUUID */
  id: string;
  /** ISO timestamp */
  createdAt: string;
  /** 日记正文 — 用户写入 或 LLM 重写 */
  content: string;
  /** 可选:简短一行标签(用户自填或 LLM 生成) */
  title?: string;
  /** base64 data URL,图片可选(单图,客户端 Canvas 压缩到 < 500KB) */
  imageBase64?: string | null;
  /** 来源 */
  source: DiaryEntrySource;
  /** LLM 挖素材时可填,v1 留空 */
  tags?: string[];
  /**
   * v2 §8.20 anti-fab 第 3 层防护 —
   * source = "ai-summary" 时必填:用户原始对话精简(只存 user 的话,assistant 的省去)
   * 让用户随时能"看原始对话"对照 AI 整理版,验证没幻觉
   */
  rawDialog?: string[];
  /**
   * v2 §8.20 留口子 — v1 游客 UUID,v2 加登录后换成真 user id
   * 用于:① 后端 DB 隔离用户 ② 跨设备同步 hydration
   */
  sessionId?: string;
  /**
   * v3 §8.21 — 温馨小窝 metadata(全部可选,用户用 chip 选,非 free-text)
   * 仅 source = "diary-page" 时使用,ai-summary 不会填(LLM 不感知)
   */
  metadata?: DiaryEntryMetadata;
  /**
   * v5 §8.23 — 仪式感日记本 highlights(3-5 个亮点短句)
   * 仅 source = "ai-summary" 时填,LLM 从对话抽
   */
  highlights?: string[];
  /**
   * v5 §8.23 — LLM 从对话推断的 meta(weather/mood/place)
   * 仅 source = "ai-summary" 时填,跟用户手动的 metadata 分开(避免冲突)
   * 推不出留空,**严禁瞎编**
   */
  summary_meta?: {
    weather?: WeatherEmoji;
    mood?: MoodEmoji;
    place?: string;
  };
};

/** v3 §8.21 §C.3 — 自己写日记的元数据(chip 选择,零打字承诺只放宽地点) */
export type DiaryEntryMetadata = {
  /** YYYY-MM-DD,日记日期(覆盖 createdAt 显示),默认 today */
  date?: string;
  /** 天气 emoji,7 选 1 */
  weather?: WeatherEmoji;
  /** 心情 emoji,5 选 1 */
  mood?: MoodEmoji;
  /** 地点,可选自由文本(单行) */
  place?: string;
};

export const WEATHER_OPTIONS = ["☀️", "⛅", "☁️", "🌧️", "⛈️", "❄️", "🌫️"] as const;
export type WeatherEmoji = (typeof WEATHER_OPTIONS)[number];

export const MOOD_OPTIONS = ["✨", "🙂", "😐", "😣", "😴"] as const;
export type MoodEmoji = (typeof MOOD_OPTIONS)[number];

export const WEATHER_LABELS: Record<WeatherEmoji, string> = {
  "☀️": "晴",
  "⛅": "多云",
  "☁️": "阴",
  "🌧️": "小雨",
  "⛈️": "暴雨",
  "❄️": "下雪",
  "🌫️": "雾",
};

export const MOOD_LABELS: Record<MoodEmoji, string> = {
  "✨": "超棒",
  "🙂": "还行",
  "😐": "一般",
  "😣": "不太好",
  "😴": "累瘫",
};

const STORAGE_KEY = "buer_diary_entries";
const CONSENT_KEY = "buer_diary_consent";
const SESSION_KEY = "buer_session_id";

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

/**
 * 把 DB 拉回的日记并进 localStorage(跨设备 / 清缓存后的恢复)。
 * 按 id 去重(本地已有的保留本地版,避免覆盖未同步的本地编辑),写回后返回倒序全量。
 */
export function mergeEntriesFromDB(dbEntries: DiaryEntry[]): DiaryEntry[] {
  const local = read();
  const byId = new Map<string, DiaryEntry>();
  for (const e of dbEntries) byId.set(e.id, e);
  for (const e of local) byId.set(e.id, e); // 本地优先
  const merged = [...byId.values()];
  write(merged);
  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 新建并写入,返回完整 entry — sessionId 自动注入(v2 登录留口子)*/
export function addEntry(
  partial: Omit<DiaryEntry, "id" | "createdAt">
): DiaryEntry {
  const entry: DiaryEntry = {
    sessionId: getOrCreateSessionId(),
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

/* ---------- session id(v2 登录留口子)---------- */

/**
 * 取或生成游客 sessionId(localStorage 持久)
 * v1 用 UUID(游客),v2 加登录后:登录时把此 sessionId 替换为真 user id
 */
export function getOrCreateSessionId(): string {
  if (!isBrowser()) return "";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const fresh =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `guest_${crypto.randomUUID()}`
      : `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(SESSION_KEY, fresh);
  return fresh;
}

/**
 * m5 v5 — 纯函数校验门（借鉴竞品 interviewforge/loop/verify.py）
 *
 * 追问候选必须过这道门才会被采用；任一不过 → 调用方丢弃追问、进下一题（优雅降级）。
 * 纯函数、零 IO、易单测。
 */

/** 追问题面长度上限（语音热路径，问题要短，便于 TTS 念） */
export const FOLLOW_UP_MAX_LEN = 80;

/** 归一化：小写 + 去标点空白（CJK 保留），用于重复判定 */
export function normalizeForDup(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * 字符二元组 Jaccard 相似度（0-1），用于"换汤不换药"判重。
 * 纯启发式：足够挡住明显重复，又不误杀正常追问。
 */
export function similarity(a: string, b: string): number {
  const na = normalizeForDup(a);
  const nb = normalizeForDup(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    if (s.length === 1) {
      set.add(s);
      return set;
    }
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const sa = bigrams(na);
  const sb = bigrams(nb);
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 与一组已问题目是否重复（任一相似度 ≥ 阈值即判重） */
export function isDuplicate(
  candidate: string,
  askedTexts: string[],
  threshold = 0.6,
): boolean {
  return askedTexts.some((t) => similarity(candidate, t) >= threshold);
}

export type VerifyResult = { ok: boolean; reason: string };

/**
 * 校验追问候选。
 * @param candidate 追问题面
 * @param askedTexts 本场已问过的所有题面（含主题 + 已生成追问）
 */
export function verifyFollowUp(
  candidate: string,
  askedTexts: string[],
): VerifyResult {
  const text = (candidate || "").trim();
  if (text.length < 3) return { ok: false, reason: "empty_or_too_short" };
  if (text.length > FOLLOW_UP_MAX_LEN)
    return { ok: false, reason: "too_long" };
  if (isDuplicate(text, askedTexts))
    return { ok: false, reason: "duplicate" };
  return { ok: true, reason: "ok" };
}

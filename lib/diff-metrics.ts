/**
 * 简历差异客观指标 — 4 维纯规则 + 2 维 LLM(在 /api/m3/diff-metrics)
 *
 * 用户 2026-06-04 决策:
 *   - 顶部永久区展示 6 维差异(v1 = 原简历;v2 = accept edits 后)
 *   - 4 维规则算法实时(每次 accept/reject 重算)
 *   - 2 维 LLM 评估(用户主动刷新 + 下载前自动 refresh)
 *
 * 设计原则:不是 score,是「客观可验证的指标」— 每个有明确算法,用户能 audit
 */

export type Bullet = string;

// ============ 1. JD 关键词命中数 ============

export function countJdKeywordHits(
  bullets: Bullet[],
  jdKeywords: string[]
): { hits: number; total: number; hit_keywords: string[] } {
  const total = jdKeywords.length;
  if (total === 0) {
    return { hits: 0, total: 0, hit_keywords: [] };
  }
  const allText = bullets.join(" ").toLowerCase();
  const hit_keywords = jdKeywords.filter((k) => {
    if (!k) return false;
    return allText.includes(k.toLowerCase());
  });
  return { hits: hit_keywords.length, total, hit_keywords };
}

// ============ 2. 量化 bullet 占比 ============

/**
 * 量化 = bullet 含具体数字 / metric / impact
 *
 * 算法:
 *   - 必须含 \d+
 *   - 排除纯日期模式(YYYY.MM / YYYY-MM / YYYY 年)
 *   - 排除纯电话(11 位数字)
 */
export function countQuantifiedBullets(bullets: Bullet[]): {
  quantified: number;
  total: number;
  ratio: number;
} {
  const total = bullets.length;
  if (total === 0) return { quantified: 0, total: 0, ratio: 0 };

  let quantified = 0;
  for (const b of bullets) {
    const text = b ?? "";
    if (!/\d/.test(text)) continue; // 无数字
    // 剥离日期模式后再判数字
    const stripped = text
      .replace(/\d{4}[.\-\/年]\d{1,2}([.\-\/月]\d{1,2}日?)?/g, "")
      .replace(/\d{4}\s*[-至到]\s*(至今|今|现在|\d{4}([.\-\/]\d{1,2})?)/g, "")
      .replace(/\d{4}\s*年/g, "")
      .replace(/1[3-9]\d{9}/g, ""); // 手机号
    if (/\d+/.test(stripped)) {
      quantified++;
    }
  }
  return {
    quantified,
    total,
    ratio: +(quantified / total).toFixed(2),
  };
}

// ============ 3. 强动词占比 ============

const STRONG_VERBS = [
  "主导", "设计", "优化", "推动", "落地", "验证", "重构", "建立", "上线",
  "增长", "缩短", "提升", "主持", "主理", "独立完成", "搭建", "构建", "开发",
  "分析", "挖掘", "迭代", "规划", "驱动", "支撑", "实现", "完成",
];

export function countStrongVerbBullets(bullets: Bullet[]): {
  strong: number;
  total: number;
  ratio: number;
} {
  const total = bullets.length;
  if (total === 0) return { strong: 0, total: 0, ratio: 0 };

  let strong = 0;
  for (const b of bullets) {
    const text = (b ?? "").trim();
    // 检查开头(允许 "- " "· " bullet 标记)
    const head = text.replace(/^[\-·•\s]+/, "").slice(0, 6);
    if (STRONG_VERBS.some((v) => head.startsWith(v))) {
      strong++;
    }
  }
  return {
    strong,
    total,
    ratio: +(strong / total).toFixed(2),
  };
}

// ============ 4. 平均 bullet 字数 ============

export function avgBulletLen(bullets: Bullet[]): number {
  if (bullets.length === 0) return 0;
  const total = bullets.reduce((sum, b) => sum + (b ?? "").length, 0);
  return Math.round(total / bullets.length);
}

// ============ 综合 v1 vs v2 比较 ============

export type RuleMetrics = {
  jd_keyword_hits: { hits: number; total: number };
  quantified_bullets: { quantified: number; total: number; ratio: number };
  strong_verb_bullets: { strong: number; total: number; ratio: number };
  avg_bullet_len: number;
};

export function computeRuleMetrics(
  bullets: Bullet[],
  jdKeywords: string[]
): RuleMetrics {
  return {
    jd_keyword_hits: countJdKeywordHits(bullets, jdKeywords),
    quantified_bullets: countQuantifiedBullets(bullets),
    strong_verb_bullets: countStrongVerbBullets(bullets),
    avg_bullet_len: avgBulletLen(bullets),
  };
}

// ============ 从 parsedResume + acceptedEdits 提 bullets[] ============

type ParsedRes = {
  experience?: { bullets?: ({ text?: string } | string)[] }[];
  projects?: { bullets?: ({ text?: string } | string)[] }[];
  activities?: { bullets?: ({ text?: string } | string)[] }[];
};

type Edit = {
  target: string;          // "experience[0].bullets[0]" 或 "new:..."
  original_text: string;
  suggested_text: string;
};

function bulletText(b: { text?: string } | string): string {
  return typeof b === "string" ? b : b.text ?? "";
}

/**
 * v1:从 parsedResume 抽出所有原始 bullets
 */
export function extractV1Bullets(parsedResume: ParsedRes | null): Bullet[] {
  if (!parsedResume) return [];
  const out: Bullet[] = [];
  for (const sec of ["experience", "projects", "activities"] as const) {
    const arr = parsedResume[sec] ?? [];
    for (const item of arr) {
      for (const b of item.bullets ?? []) {
        const t = bulletText(b);
        if (t) out.push(t);
      }
    }
  }
  return out;
}

/**
 * v2:apply accepted edits 到 v1,产 v2 bullets
 *
 * - target = "experience[i].bullets[j]" → 替换原 bullet
 * - target = "new:..." → 加新 bullet 到末尾
 */
export function extractV2Bullets(
  parsedResume: ParsedRes | null,
  acceptedEdits: Edit[]
): Bullet[] {
  if (!parsedResume) return [];

  // 索引 edits by target
  const byTarget = new Map<string, string>();
  const newBullets: string[] = [];
  for (const e of acceptedEdits) {
    if (e.target.startsWith("new:") || e.target.startsWith("alert:")) {
      if (!e.target.startsWith("alert:")) {
        newBullets.push(e.suggested_text);
      }
    } else {
      byTarget.set(e.target, e.suggested_text);
    }
  }

  const out: Bullet[] = [];
  for (const sec of ["experience", "projects", "activities"] as const) {
    const arr = parsedResume[sec] ?? [];
    for (let i = 0; i < arr.length; i++) {
      const bullets = arr[i].bullets ?? [];
      for (let j = 0; j < bullets.length; j++) {
        const target = `${sec}[${i}].bullets[${j}]`;
        const replaced = byTarget.get(target);
        const t = replaced ?? bulletText(bullets[j]);
        if (t) out.push(t);
      }
    }
  }
  out.push(...newBullets);
  return out;
}

// ============ 变化格式化(给 UI 用) ============

export type DeltaDisplay = {
  raw: number;         // signed numeric delta
  display: string;     // "+26 ↑" / "-14 ↓" / "+47pp ↑"
  direction: "up" | "down" | "flat";
};

export function formatDelta(
  v1: number,
  v2: number,
  unit: "count" | "ratio" | "len" = "count"
): DeltaDisplay {
  const delta = v2 - v1;
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const direction: "up" | "down" | "flat" =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  let display: string;
  if (unit === "ratio") {
    const ppDelta = Math.round((v2 - v1) * 100);
    display = `${ppDelta >= 0 ? "+" : ""}${ppDelta}pp ${arrow}`;
  } else {
    display = `${delta >= 0 ? "+" : ""}${delta} ${arrow}`;
  }
  return { raw: delta, display, direction };
}

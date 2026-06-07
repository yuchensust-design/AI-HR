/**
 * 确定性 JD 关键词命中匹配
 *
 * 为什么不再用 LLM 算命中(keyword-fix 2026-06-07):
 *  - LLM 每次现生成关键词集合 + 现判命中 → 分数忽高忽低,不可复现
 *  - 把简历技能词漏当成 JD 关键词 → 出现"JD 里根本没有"的词
 * 改为:
 *  - JD 关键词在 parse-jd 一次性抽好存进 jdContext.jd_keywords(只忠于 JD)
 *  - 命中判定在代码里做:归一化 + 子串 + 小同义词表 → 同输入同输出
 *  - 这也更贴近真实 ATS(招聘系统就是字面关键词匹配)
 */

/** 归一化:小写 + 去掉空白 / 斜杠 / 点 / 横线 / 常见中英标点,便于 "A/B 测试" ↔ "AB测试" 对齐 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s/\\.\-_·、,，。;；:：()()\[\]【】"'`]/g, "");
}

/**
 * 小同义词表(归一化后)。key = 规范词,value = 等价别名组。
 * 命中规范词或任一别名即算命中。只放高价值的、字面不同但确为同一概念的。
 */
const SYNONYM_GROUPS: string[][] = [
  ["ab测试", "abtest", "abtesting", "a/btest", "对照实验", "灰度实验", "ab实验"],
  ["数据分析", "dataanalysis", "数据驱动", "数据敏感"],
  ["用户访谈", "用户调研", "用户研究", "userinterview", "userresearch"],
  ["产品需求文档", "prd", "需求文档"],
  ["竞品分析", "竞品调研", "竞品研究"],
  ["大语言模型", "llm", "大模型"],
  ["检索增强", "rag", "检索增强生成"],
  ["产品规划", "产品路线图", "roadmap", "产品路线"],
  ["数据可视化", "可视化", "datavisualization"],
  ["机器学习", "machinelearning", "ml"],
  ["人工智能", "ai", "artificialintelligence"],
];

// 归一化后的别名 → 该组所有归一化别名
const SYNONYM_INDEX: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    const normed = group.map(norm);
    for (const alias of normed) m.set(alias, normed);
  }
  return m;
})();

function isHit(keyword: string, normHaystack: string): boolean {
  const nk = norm(keyword);
  if (nk.length < 2) return false;
  if (normHaystack.includes(nk)) return true;
  const aliases = SYNONYM_INDEX.get(nk);
  if (aliases) {
    for (const a of aliases) {
      if (a !== nk && normHaystack.includes(a)) return true;
    }
  }
  return false;
}

export type KeywordMatchResult = {
  matched: string[];
  missing: string[];
};

/**
 * 确定性命中匹配。
 * @param jdKeywords JD 关键词(来自 jdContext.jd_keywords)
 * @param resumeText 简历全文(bullets + 技能 + 技术栈 + 课程拼成一段)
 */
export function matchKeywords(
  jdKeywords: string[],
  resumeText: string
): KeywordMatchResult {
  const haystack = norm(resumeText);
  const matched: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const kw of jdKeywords) {
    const k = String(kw ?? "").trim();
    if (!k) continue;
    const dedup = k.toLowerCase();
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    if (isHit(k, haystack)) matched.push(k);
    else missing.push(k);
  }
  return { matched, missing };
}

type JdCtxLike = {
  jd_keywords?: unknown;
  must_have?: unknown;
  nice_to_have?: unknown;
  jd_requirements_parsed?: unknown;
} | null;

/**
 * 取 JD 关键词清单。优先用 parse-jd 存好的 jd_keywords;
 * 老数据没有时,从 must_have + nice_to_have + jd_requirements_parsed 派生(都是 JD 派生字段,不含简历)。
 */
export function getJdKeywords(jdContext: JdCtxLike): string[] {
  if (!jdContext) return [];
  const direct = jdContext.jd_keywords;
  if (Array.isArray(direct) && direct.length > 0) {
    return dedupKeep(direct.map((k) => String(k).trim()).filter(Boolean));
  }
  // 兜底派生(老数据 / parse-jd 未产 jd_keywords)
  const out: string[] = [];
  if (Array.isArray(jdContext.must_have)) {
    for (const m of jdContext.must_have) out.push(String(m).trim());
  }
  if (Array.isArray(jdContext.nice_to_have)) {
    for (const n of jdContext.nice_to_have) out.push(String(n).trim());
  }
  if (Array.isArray(jdContext.jd_requirements_parsed)) {
    for (const r of jdContext.jd_requirements_parsed) {
      const t = (r as { text?: unknown })?.text;
      if (t) out.push(String(t).trim());
    }
  }
  return dedupKeep(out.filter(Boolean));
}

function dedupKeep(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * 技能分组归一化 —— 兼容新老 parsed 数据
 *
 * 新数据:parsedResume.skill_groups = [{category, items}]  (parse-resume 动态分类)
 * 老数据:parsedResume.skills = { languages, frameworks, tools, domain }  (固定 4 桶)
 *
 * 客户端(简历预览)和服务端(finalize-resume)都用这个,保证渲染一致。
 */

export type SkillGroup = { category: string; items: string[] };

const BUCKET_LABELS: Record<string, string> = {
  languages: "编程语言",
  frameworks: "框架与库",
  tools: "工具",
  domain: "领域知识",
};

export function skillGroupsOf(pr: unknown): SkillGroup[] {
  if (!pr || typeof pr !== "object") return [];
  const obj = pr as Record<string, unknown>;

  // 新结构优先
  const sg = obj.skill_groups;
  if (Array.isArray(sg)) {
    const out = sg
      .map((g) => {
        const gr = g as { category?: unknown; items?: unknown };
        return {
          category: String(gr?.category ?? "").trim(),
          items: Array.isArray(gr?.items)
            ? gr.items.map((x) => String(x).trim()).filter(Boolean)
            : [],
        };
      })
      .filter((g) => g.category && g.items.length > 0);
    if (out.length > 0) return out;
  }

  // 老 4 桶兜底
  const sk = obj.skills;
  if (sk && typeof sk === "object") {
    const skObj = sk as Record<string, unknown>;
    const out: SkillGroup[] = [];
    // 先按已知桶顺序
    for (const [key, label] of Object.entries(BUCKET_LABELS)) {
      const v = skObj[key];
      if (Array.isArray(v) && v.length > 0) {
        out.push({ category: label, items: v.map((x) => String(x)) });
      }
    }
    // 其它未知键也带上
    for (const [key, v] of Object.entries(skObj)) {
      if (key in BUCKET_LABELS) continue;
      if (Array.isArray(v) && v.length > 0) {
        out.push({ category: key, items: v.map((x) => String(x)) });
      }
    }
    return out;
  }

  return [];
}

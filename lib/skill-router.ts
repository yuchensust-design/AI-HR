/**
 * Phase 5 dynamic skill routing
 *
 * Step 0.5 A/B 实验验证(2026-06-01):
 *   - C(动态路由)总分 95 > B(全塞 7 段)89 > A(纯主框架)77
 *   - C 比 B 节省 ~22% token,质量更好
 *
 * 路由表来源:docs/B-skill-research-report.md §0.7
 *
 * 路由输入:
 *   - persona(可推断 / null)
 *   - target_role(从 JD 文本 / role name 推 / null)
 *   - resume_state(parsed_resume 的 narrative_tag_distribution)
 *
 * 路由输出:
 *   string[]  — 要加载的补充 skill 段名
 */

export type Persona = "林婷" | "陈昊" | "李明" | "王雯" | "小张" | "未判定";

export type ResumeState = {
  responsibility_driven?: number;
  lacks_metric?: number;
  vague_action?: number;
  strong?: number;
};

export type SkillSegmentKey =
  | "narrative-tools"          // #3 wyh0626 责任→成就
  | "bullet-writer"            // #4 STAR/X-Y-Z 模板
  | "ats-optimizer"            // #4 ATS 自检
  | "quantifier"               // #4 量化建议
  | "career-changer-translator"// #4 跨专业翻译
  | "tech-resume-optimizer"    // #4 技术岗模板
  | "tencent-resume-guide";    // #2 STAR + 6 误区

export type RouteInput = {
  persona?: Persona;
  targetRoleText?: string | null;  // 完整 JD / role name / null
  resumeState?: ResumeState;
};

/**
 * 决策表(详见 docs/B-skill-research-report.md §0.7.4)
 */
export function decideSkillRoute(input: RouteInput): SkillSegmentKey[] {
  const route = new Set<SkillSegmentKey>();

  // 通用四件套(99% 场景都加)
  // 2026-06-02 v2 修订:tencent-resume-guide 从 target-role 挪到通用层
  // 用户反馈:"这个 skill 写得挺好的,可以好好参考。不是说要腾讯的岗位才能用。"
  // 内容是 6 大常见简历误区 + STAR 通用规范,跟腾讯特化无关。
  route.add("bullet-writer");
  route.add("ats-optimizer");
  route.add("tencent-resume-guide");

  // === Persona 层 ===
  const persona = input.persona ?? "未判定";

  if (persona === "林婷") {
    route.add("career-changer-translator");
    route.add("narrative-tools");
  } else if (persona === "陈昊") {
    route.add("quantifier");
    route.add("narrative-tools"); // Step 0.5 实验后加(陈昊 case C vs B 差距小)
  } else if (persona === "李明") {
    route.add("narrative-tools");
    // ats-optimizer 已加,李明型主调
  } else if (persona === "王雯") {
    route.add("narrative-tools");
    route.add("quantifier");
  } else {
    // 未判定 → 通用三件套补 narrative
    route.add("narrative-tools");
  }

  // === Target role 层 ===
  // 2026-06-02 v2 修订:tencent-resume-guide 已挪到通用层(见上),此层只保留行业特化路由
  const roleText = (input.targetRoleText ?? "").toLowerCase();

  if (
    /(算法|swe|software|工程师|数据(?!分析)|ml|llm|ai (开发|工程)|后端|前端)/i.test(roleText)
  ) {
    route.add("tech-resume-optimizer");
  }

  // === Resume state 层 ===
  const state = input.resumeState ?? {};
  if ((state.responsibility_driven ?? 0) > 0.4) {
    route.add("narrative-tools");
  }
  if ((state.lacks_metric ?? 0) > 0.4) {
    route.add("quantifier");
  }

  return Array.from(route);
}

/**
 * 补充 skill 段的 prompt 文本(从 Step 0.5 A/B 实验脚本里 lift)
 */
export const SKILL_SEGMENTS: Record<SkillSegmentKey, string> = {
  "narrative-tools": `
【#3 wyh0626 narrative-tools 5 步重写】
责任 → 成就 5 步:
1. 找责任陈述句(开头是"负责" "协助" "参与" "完成")
2. 问"做了什么具体动作"(强 Action verb)
3. 问"产生了什么 measurable result"(量化)
4. 问"对业务 / 团队 / 用户的影响"(Impact)
5. 用 STAR 重写
反例:"负责数据分析" → 正例:"主导用户增长漏斗分析,定位关键流失节点,推动 DAU 留存率提升 18%"`,

  "bullet-writer": `
【#4 resume-bullet-writer STAR / X-Y-Z 模板】
STAR: Situation + Task + Action + Result
X-Y-Z: 通过 X(动作) 达到 Y(量化结果) 实现 Z(更大影响)
Action verb 库:主导 / 设计 / 优化 / 推动 / 落地 / 验证 / 重构 / 建立 / 上线 / 增长 / 缩短 / 提升`,

  "ats-optimizer": `
【#4 resume-ats-optimizer ATS 自检】
ATS 通过率自检 3 条:
- bullet 含 JD must_have 关键词 ≥ 60%(原词不变形)
- 章节标题用标准词:教育背景 / 实习经历 / 项目经验 / 专业技能
- 不用表格 / 图片 / 多列(markdown 纯文本 + 单层 bullet)`,

  quantifier: `
【#4 resume-quantifier 量化建议】
找量化机会的 3 维:
- 规模(用户数 / 数据量 / 流量 / 团队规模)
- 速度(时间缩短 / 频次提升)
- 质量(准确率 / 转化率 / 满意度 / 留存)
没有真实数字时:用"估算 X-Y"或"~"模糊化,或转质化描述,绝不编造精确数字。`,

  "career-changer-translator": `
【#4 career-changer-translator 跨专业翻译】
跨专业 / 转方向用户的 transferable skill 翻译表:
- 实验室经验 → 数据严谨度 / 实验设计 / 报告撰写 / lab notebook 习惯
- 教学 / 公益讲解 → 跨背景沟通 / 复杂概念简化 / 共情用户 / 用户访谈雏形
- 学生干部 → 跨部门协同 / 资源调度 / 利益协调 / stakeholder 管理
- 学术竞赛 / 课程项目 → 短期目标管理 / 压力下交付 / 团队协作
- 任何非目标领域经验 → 重新框定为"跨领域视角 / 用户共情 / 学习敏捷度"`,

  "tech-resume-optimizer": `
【#4 tech-resume-optimizer 技术岗模板】
技术岗 bullet 4 要素:
- 技术栈(语言 / 框架 / 工具,具体版本可加)
- 项目深度(架构选择 / trade-off / 关键决策)
- 度量(QPS / latency / 数据量 / 模型 metric / 业务 metric)
- 团队角色(独立 / leader / 协作,几人团队)`,

  "tencent-resume-guide": `
【#2 tencent resume-guide 6 大常见误区】
6 大常见误区(用户简历里出现就改写):
1. 职责陈述无成果("负责数据分析" → 必须给量化 result)
2. 主观形容词无证据("熟练 Python" → 应改"用 Pandas 完成 X 数据清洗")
3. 写公司业务不写自己("公司是 X 平台" → 应说"在 X 平台做了什么")
4. wall of text 大段长句 → 拆成 1 行 1 bullet
5. 工具罗列无场景("Excel / SQL / Python" → 应附 1-2 个场景)
6. 学校 / GPA 重复强调(教育栏写过就不再 bullet 里强调)`,
};

/**
 * Persona 简单推断(基于 parsed_resume.basic.major + JD vs major mismatch)
 *
 * 复杂场景下可让 LLM 推,这里规则版兜底
 */
export function inferPersona(
  parsedResume: { basic?: { major?: string | null } } | null,
  jdContext: { must_have?: string[]; jd_summary?: string } | null
): Persona {
  if (!parsedResume?.basic?.major) return "未判定";
  const major = parsedResume.basic.major;
  const jdText = `${jdContext?.jd_summary ?? ""} ${(jdContext?.must_have ?? []).join(" ")}`.toLowerCase();

  // 转专业 / 跨方向:专业是 STEM 之外但 JD 是互联网技术岗
  const isNonTechMajor = /化学|物理|生物|材料|哲学|历史|文学|外语|法学|教育/.test(major);
  const isTechJd = /产品|ai|算法|工程|数据|互联网|增长/i.test(jdText);
  if (isNonTechMajor && isTechJd) return "林婷";

  // 拔高型:CS 背景 + 大厂 JD
  const isCSMajor = /计算机|软件|信息|电子|通信|自动化/.test(major);
  const isBigCo = /字节|tencent|腾讯|阿里|美团|百度|head/i.test(jdText);
  if (isCSMajor && isBigCo) return "陈昊";

  return "未判定";
}

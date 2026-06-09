/**
 * m5 v5 — prompt 段装配 + 能力维度装配（原 rubric 折叠进来, 审核 C4）
 *
 * 被 prep-questions（出题）/ follow-up（追问）/ capability（能力评分）三处共用，
 * 保证它们用同一份 MethodologySpec → 维度单源、不漂移（审核 A3）。
 */

import type { CapabilityDimension, MethodologySpec } from "./methodology/specs";

/** 能力维度访问器（折叠的 rubric）：capability 雷达 / 评分 prompt 取这一份 */
export function getCapabilityDimensions(
  spec: MethodologySpec,
): CapabilityDimension[] {
  return spec.capabilityDimensions;
}

/**
 * 注入 prep-questions 的「本场岗位方法论」段：考察维度 + 出题节奏 + 能力维度配比。
 * 加载失败时调用方不调本函数、回退现有 TYPE_SPECS（spec §2.3）。
 */
export function buildMethodologyBlock(spec: MethodologySpec): string {
  const dims = spec.capabilityDimensions
    .map((d) => `  - ${d.label}(${d.weight}%)`)
    .join("\n");
  return [
    `【本场岗位方法论：${spec.id}】`,
    "",
    spec.examineGuide,
    "",
    spec.pacingGuide,
    "",
    "【能力维度配比（出题时按权重分配考察重心）】",
    dims,
    "",
    "【为每题预设挖掘点（A1 简历弱点驱动）】",
    "出每题时，结合候选人简历真实经历，在该题 whatItTests 写「考察哪个能力维度」、",
    "digHint 写「若答得浅该往哪挖」（挖简历里的真实细节，不要标准答案）。",
  ].join("\n");
}

/**
 * 注入 follow-up 路由的追问上下文：追问树 + 红旗信号。
 */
export function buildFollowUpContext(spec: MethodologySpec): string {
  return [
    `【本场岗位方法论：${spec.id}】`,
    "",
    spec.followUpTree,
    "",
    spec.redFlags,
  ].join("\n");
}

/**
 * 注入 capability 评分路由的能力维度 rubric：维度 + 权重 + strongIndicator 判定锚（A2）。
 * strongIndicator 是"强答案的质量特征"、非标准答案 → 不撞 anti-fabrication。
 */
export function buildCapabilityRubric(spec: MethodologySpec): string {
  const lines = spec.capabilityDimensions.map(
    (d) =>
      `- ${d.key}（${d.label}，权重 ${d.weight}%）：强答案特征 = ${d.strongIndicator}`,
  );
  return [
    `【${spec.id} 能力维度评分 rubric（1-5 分，对照"强答案特征"打分）】`,
    ...lines,
    "",
    "注意：强答案特征描述的是「长什么样算强」，不是标准答案；",
    "评分依据候选人 transcript 的真实表现，不要因为没说出某个预设答案就扣分（anti-fabrication）。",
  ].join("\n");
}

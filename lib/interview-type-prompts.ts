/**
 * 3 面试类型 prompt 模板
 *
 * 来源:plan §A.2 配套素材 + PRD §3.6.5/§3.6.6
 * 借鉴公开:noamseg/interview-coach-skill(题目结构)+ 0voice/interview_internal_reference(中文真题)
 *
 * 用于:prep-questions 出题大纲注入
 */

import type { InterviewType } from "./interview-types";

export type TypeSpec = {
  key: InterviewType;
  display_name: string;
  outline: string;
  category_mix: string;
  example_questions: string[];
};

export const TYPE_SPECS: Record<InterviewType, TypeSpec> = {
  semi: {
    key: "semi",
    display_name: "半结构化(国内校招主流)",
    outline:
      [
        "国内大厂校招主流形式:简历过 + 行为题 + 项目追问 + 1-2 题情景题",
        "结构:破冰 → 自我介绍 → 简历项目深挖 → 行为题穿插 → 选投原因 → 收尾",
        "每 1 题节奏 1-2 分钟",
        "题目分布:30% warmup / 50% 简历项目追问 / 20% 情景或动机",
      ].join("\n"),
    category_mix:
      "warmup(1 题自我介绍) + project(N×0.5 简历项目追问) + behavioral(N×0.2 经历类) + closing(1 题动机/反问)",
    example_questions: [
      "Q: 先做一个 30 秒自我介绍。(category=warmup)",
      "Q: 你简历里这个 [项目 X],你具体负责哪部分?有数据可以说一下吗?(category=project)",
      "Q: 如果让你重新做一次 [项目 X],你会改哪里?(category=project)",
      "Q: 为什么选择投这个岗位,而不是其他相关方向?(category=closing)",
    ],
  },
  bq: {
    key: "bq",
    display_name: "行为面 BQ(STAR 主导)",
    outline:
      [
        "外企 / 实习 / 校招二面常见:全部 STAR 结构题,挖具体行为细节",
        "8 大主题轮流(领导力 / 冲突 / 失败 / 主动 / 团队 / 客户 / 抗压 / 学习)",
        "每题:Situation → Task → Action → Result 4 要素都问",
        "结构:warmup(1) + 6-7 个 STAR 主题 + closing(1)",
      ].join("\n"),
    category_mix:
      "warmup(1) + behavioral(N - 2,8 大主题选 N-2 个) + closing(1)",
    example_questions: [
      "Q: 讲一次你跟同事(或同学)有分歧,你怎么处理的?(主题=冲突)",
      "Q: 讲一次你主动发现问题并解决的经历。(主题=主动)",
      "Q: 讲一次你失败的经历,你学到了什么?(主题=失败)",
      "Q: 讲一次你 under pressure 完成任务的经历。(主题=抗压)",
      "Q: 讲一次你快速学会一个新技能的经历。(主题=学习)",
    ],
  },
  tech: {
    key: "tech",
    display_name: "技术面(按 JD 推断 role)",
    outline:
      [
        "根据 JD 推断目标 role(SWE / DS / PM / AI Researcher 等),按 role 出技术题",
        "结构:warmup(1 题轻技术) + 基础概念(N×0.3) + 应用题(N×0.4) + open question(N×0.2) + closing(1 反问)",
        "至少 1 题压力题(stress)— Skeptical Recruiter 纪律,问 trade-off 或 benchmark",
        "技术深度按 LLM 自己判断,JD 资深 → 难;JD 实习 → 中",
        "v1 不出 LeetCode 算法题(太难评分)— 改成「描述思路」型",
      ].join("\n"),
    category_mix:
      "warmup(1) + technical(N - 3) + stress(1, trade-off 或 benchmark 反问) + closing(1)",
    example_questions: [
      "Q: 你说选了 Claude API 而不是 GPT-4 — 当时怎么测的成本?具体 benchmark 是什么?(category=stress)",
      "Q: 设计一个 [简单系统 X] 的核心数据流,关键决策是什么?(category=technical)",
      "Q: [JD 里提到的关键技术 Y] 解决了什么问题,有什么 trade-off?(category=technical)",
    ],
  },
};

export function buildTypeBlock(type: InterviewType): string {
  const spec = TYPE_SPECS[type];
  return `【面试类型:${spec.display_name}】

大纲:
${spec.outline}

类别配比要求:${spec.category_mix}

示例题(只参考结构,不照抄):
${spec.example_questions.map((q) => `  ${q}`).join("\n")}
`;
}

/**
 * m5 v5 — 岗位面试方法论库（可插拔，"加岗位=加一个 MethodologySpec"）
 *
 * 设计见 docs/superpowers/specs/2026-06-08-m5-mock-interview-upgrade-design.md §2。
 * 灵感来自竞品 InterviewForge 的 SKILL.md（考察维度/出题节奏/追问树/红旗信号），
 * 但按 offer-catcher 的 persona + 纪律体系重写、用 .ts 对象落地（零 YAML 解析依赖, 审核 R4）。
 *
 * 与现有 lib/interview-type-prompts.ts(格式) / lib/interviewer-personas.ts(语气) 互补:
 *   TYPE_SPECS 给"考什么形式"(semi/bq/tech)，PERSONA 给"什么语气"，
 *   MethodologySpec 给"按岗位考什么深度"(考察维度/追问树/能力雷达轴)。
 *
 * 三个种子: bq(通用行为面, role-agnostic) / backend(后端, role-specific) / generic-tech(技术兜底)。
 */

import type { InterviewType } from "@/lib/interview-types";

/**
 * 能力维度（双层评分第二层的雷达轴 + 出题配比依据）。
 * 单源：同一份 capabilityDimensions 同时驱动 出题(examineGuide 配比) / 追问 / 能力雷达，
 * 防止三处各写一份漂移（审核 A3，一致性由 specs.test.ts 守）。
 */
export type CapabilityDimension = {
  /** 维度 key，对齐 CapabilityScore.key */
  key: string;
  /** 中文名，能力雷达展示 */
  label: string;
  /** 权重（同一 spec 内总和应 = 100，由单测校验） */
  weight: number;
  /**
   * A2 判定锚：强答案的"质量特征"描述（**非标准答案/非事实**）。
   * 注入 capability 评分 prompt 作打分参照；描述的是"长什么样算强"，
   * 不逼用户真实经历去对标某个正确答案 → 不撞 anti-fabrication。
   */
  strongIndicator: string;
};

export type MethodologySpec = {
  /** "bq" | "backend" | "generic-tech" */
  id: string;
  /** 适用的面试类型 */
  appliesToType: InterviewType[];
  /**
   * 仅 type=tech 选岗用的关键词集（中英双覆盖，审核 G3）。
   * registry 用它对 JD 文本打分；与 lib/keyword-match.ts 的 PM 向同义词表无关、自带。
   */
  matchKeywords: string[];
  /** 能力维度（雷达轴 + 出题配比 + 追问依据），单源 */
  capabilityDimensions: CapabilityDimension[];
  /** 考察维度正文（注入 prep 出题 prompt） */
  examineGuide: string;
  /** 出题节奏（热身→主菜→换约束，注入 prep） */
  pacingGuide: string;
  /** 追问树（注入 follow-up 判断 + 生成） */
  followUpTree: string;
  /** 红旗信号（注入 follow-up：命中则倾向追问） */
  redFlags: string;
};

/** 通用行为面 BQ —— role-agnostic，覆盖所有用户（也作 semi 的方法论） */
export const BQ_METHODOLOGY: MethodologySpec = {
  id: "bq",
  appliesToType: ["bq", "semi"],
  matchKeywords: [], // 按 type 选，不做 JD 关键词匹配
  capabilityDimensions: [
    {
      key: "star",
      label: "STAR完整度",
      weight: 30,
      strongIndicator:
        "情境(S)/任务(T)/行动(A)/结果(R)四要素齐全，行动部分讲清自己具体做了什么决定与动作，而非笼统描述团队。",
    },
    {
      key: "impact",
      label: "影响力量化",
      weight: 25,
      strongIndicator:
        "结果带可衡量的量化或对照（数字/比例/前后对比/影响范围），且能说清这个结果与自己行动的因果关系。",
    },
    {
      key: "ownership",
      label: "自主决策",
      weight: 25,
      strongIndicator:
        "在关键节点能讲出自己的判断、取舍和为什么这么选，体现主动性与 ownership，而非被动执行或随大流。",
    },
    {
      key: "reflection",
      label: "反思深度",
      weight: 20,
      strongIndicator:
        "能复盘做得不好的地方、若重来会怎么改、从中学到什么，反思具体可落地，而非套话或归咎外部。",
    },
  ],
  examineGuide: [
    "【行为面 BQ 考察维度（权重）】",
    "1. STAR完整度(30%)：能把一段经历讲成完整故事，重点在 Action 讲清个人贡献。",
    "2. 影响力量化(25%)：结果有数字/对照，且与本人行动有因果。",
    "3. 自主决策(25%)：关键节点有自己的判断与取舍，体现 ownership。",
    "4. 反思深度(20%)：能复盘不足、讲清若重来怎么改。",
    "出题围绕这 4 维：让候选人讲具体经历，每题锚定其中 1-2 维，避免假设性空想题。",
  ].join("\n"),
  pacingGuide: [
    "【出题节奏】",
    "1. 热身(1 题)：轻松的自我介绍 / 最想聊的一段经历，建立状态。",
    "2. 主菜(N-2 题)：8 大主题轮取（领导力/冲突/失败/主动/团队/客户/抗压/学习），每题一段真实经历。",
    "3. 收尾(1 题)：动机 / 反问 / 你最想让我们记住你哪一点。",
  ].join("\n"),
  followUpTree: [
    "【BQ 追问树（依据回答缺口选分支，本场只追 1 个最关键缺口）】",
    "- 缺 Result/数字 → 追：「这件事最后的结果是什么？有没有数字或对照能说明？」",
    "- 行动笼统/全程「我们」 → 追：「这里面你个人具体做了什么决定和动作？」",
    "- 只讲做了什么、没讲为什么 → 追：「当时为什么这么选？有没有别的选项？」",
    "- 一帆风顺无波折 → 追：「过程里最难/最让你犹豫的点是什么？」",
    "- 没有反思 → 追：「如果重来一次，你会改哪里？」",
  ].join("\n"),
  redFlags: [
    "【红旗信号（命中则倾向追问）】",
    "- 全程「我们」，分不清自己做了什么 → 挖个人贡献",
    "- 结果空泛无数字（「效果挺好」「提升很多」） → 要量化",
    "- 把功劳全归他人 / 把问题全归外部环境 → 挖 ownership 与反思",
    "- 经历过于完美无波折 → 大概率美化，挖真实困难",
  ].join("\n"),
};

/** 后端工程师 —— role-specific（消化竞品 backend/algorithm 内容并重写） */
export const BACKEND_METHODOLOGY: MethodologySpec = {
  id: "backend",
  appliesToType: ["tech"],
  // 中英双覆盖（审核 G3）：中文 JD「后端/高并发/微服务」也要能命中，不漏落 generic-tech
  matchKeywords: [
    "redis", "mysql", "postgresql", "mongodb", "kafka", "rabbitmq", "rocketmq",
    "jvm", "java", "golang", "go", "spring", "mybatis", "nginx",
    "后端", "服务端", "服务器端", "高并发", "并发", "分布式", "微服务",
    "缓存", "消息队列", "线程池", "索引", "事务", "数据库", "中间件",
    "幂等", "限流", "熔断", "网关", "rpc", "grpc", "服务治理", "可用性", "一致性",
  ],
  capabilityDimensions: [
    {
      key: "clarify",
      label: "问题澄清",
      weight: 15,
      strongIndicator:
        "动手前主动确认输入规模/边界/约束/一致性要求，与面试官对齐假设，而不是直接脑补开做。",
    },
    {
      key: "reasoning",
      label: "思路推导",
      weight: 30,
      strongIndicator:
        "能从朴素方案逐步推到合理方案，讲清每一步为什么优化、瓶颈在哪，展示思维过程而非直接抛结论。",
    },
    {
      key: "selection",
      label: "方案选型",
      weight: 20,
      strongIndicator:
        "能在多种存储/中间件/数据结构之间按场景选型，说清各自时空与适用边界，选错代价能讲清。",
    },
    {
      key: "tradeoff",
      label: "复杂度/权衡",
      weight: 15,
      strongIndicator:
        "主动给时间/空间复杂度或容量/延迟估算，能讲清一致性vs可用性、性能vs成本等关键 trade-off。",
    },
    {
      key: "reliability",
      label: "可靠性/落地",
      weight: 20,
      strongIndicator:
        "考虑失败/重试/幂等/并发/数据一致与边界，方案能落到可运行细节，而非停在概念。",
    },
  ],
  examineGuide: [
    "【后端考察维度（权重）】",
    "1. 问题澄清(15%)：动手前确认规模/边界/一致性要求。",
    "2. 思路推导(30%)：朴素方案→优化，讲清每步为什么、瓶颈在哪。",
    "3. 方案选型(20%)：存储/中间件/数据结构按场景选，说清取舍。",
    "4. 复杂度/权衡(15%)：给复杂度或容量估算，讲清一致性/可用性等 trade-off。",
    "5. 可靠性/落地(20%)：失败/重试/幂等/并发/一致性，落到可运行细节。",
    "出题：以候选人简历真实项目为锚，结合 JD 技术栈出「描述思路/设计」型题（v1 不出纯 LeetCode）。",
  ].join("\n"),
  pacingGuide: [
    "【出题节奏（参考竞品 SKILL）】",
    "1. 热身(1 题)：一个高频基础概念，建立信心（如缓存/索引/线程池基础）。",
    "2. 主菜(N-3 题)：结合简历项目深挖一个设计/优化问题，看完整思维过程。",
    "3. 换约束追加(stress 1 题)：把规模×1000 / 改成流式 / 加一致性要求，看应变（Skeptical 纪律）。",
    "4. 收尾(1 题)：trade-off 反问或动机。",
  ].join("\n"),
  followUpTree: [
    "【后端追问树（依据回答选分支，本场只追 1 个最关键缺口）】",
    "- 思路对 → 引导优化：「能再优化一个数量级吗？瓶颈现在在哪？」",
    "- 卡住 → 递进提示（不直接给答案）：先「这里最重复/最慢的一步是什么？」，再点数据结构方向。",
    "- 一上来就最优/像背的 → 换约束验证：「数据规模×1000 / 改成在线流式，你的方案还成立吗？」",
    "- 含糊（「用缓存就行」「加机器」） → 要具体：「具体怎么设计？key 怎么定？失效和一致性怎么处理？」",
    "- 只会用不知原理 → 追根源：「它底层为什么能做到？有什么前提/代价？」",
  ].join("\n"),
  redFlags: [
    "【红旗信号（命中则倾向追问）】",
    "- 不澄清规模/边界就直接开做 → 工程习惯，追澄清",
    "- 一上来给最优解但讲不出推导 → 疑似背题，换约束验证",
    "- 复杂度/容量说错或答不上 → 追基础",
    "- 只会调用不懂原理与代价 → 追根源",
    "- 「用缓存/加机器就行」式万能答案 → 逼具体设计与一致性处理",
  ].join("\n"),
};

/** 通用技术兜底 —— tech 类型但 JD 未命中具体岗位时用 */
export const GENERIC_TECH_METHODOLOGY: MethodologySpec = {
  id: "generic-tech",
  appliesToType: ["tech"],
  matchKeywords: [], // 兜底，从不靠关键词命中，仅在其他 tech 岗都 0 分时启用
  capabilityDimensions: [
    {
      key: "understanding",
      label: "技术理解",
      weight: 30,
      strongIndicator:
        "对所用技术/概念理解到位，能讲清它解决什么问题、适用场景与前提，而非停在名词。",
    },
    {
      key: "tradeoff",
      label: "方案权衡",
      weight: 25,
      strongIndicator:
        "面对选择能给出多个方案并说清取舍依据，而非只有一个「就这么做」。",
    },
    {
      key: "communication",
      label: "沟通表达",
      weight: 20,
      strongIndicator:
        "把技术问题讲得有条理、层次清晰，对方能听懂，关键处会主动澄清。",
    },
    {
      key: "execution",
      label: "落地能力",
      weight: 25,
      strongIndicator:
        "能把想法推进到可运行/可验证，考虑边界与失败情况，而非停在设想。",
    },
  ],
  examineGuide: [
    "【通用技术考察维度（权重）】",
    "1. 技术理解(30%)：讲清所用技术解决什么、适用边界。",
    "2. 方案权衡(25%)：能给多方案并说清取舍。",
    "3. 沟通表达(20%)：有条理、能澄清。",
    "4. 落地能力(25%)：推进到可运行、考虑边界。",
    "出题：以候选人简历项目 + JD 技术点为锚，出「描述思路/取舍」型题。",
  ].join("\n"),
  pacingGuide: [
    "【出题节奏】",
    "1. 热身(1 题)：JD/简历里一个轻技术点。",
    "2. 主菜(N-3 题)：结合简历项目深挖技术决策与取舍。",
    "3. 换约束追加(stress 1 题)：改变一个约束看应变。",
    "4. 收尾(1 题)：trade-off 反问或动机。",
  ].join("\n"),
  followUpTree: [
    "【通用技术追问树（本场只追 1 个最关键缺口）】",
    "- 讲清楚了 → 追取舍：「有没有别的做法？为什么选这个？」",
    "- 含糊 → 要具体：「具体怎么做的？关键决策是什么？」",
    "- 只讲是什么没讲为什么 → 追动机与边界：「为什么这么选？什么情况下不适用？」",
    "- 卡住 → 给一个角度引导，不直接给答案。",
  ].join("\n"),
  redFlags: [
    "【红旗信号（命中则倾向追问）】",
    "- 停在名词、讲不清原理或适用边界",
    "- 只有单一方案、说不出取舍",
    "- 技术叙述含糊、关键决策一带而过",
  ].join("\n"),
};

/** 全部方法论（registry 遍历用）。新增岗位 = 往这里加一条。 */
export const ALL_METHODOLOGIES: MethodologySpec[] = [
  BQ_METHODOLOGY,
  BACKEND_METHODOLOGY,
  GENERIC_TECH_METHODOLOGY,
];

export const METHODOLOGY_BY_ID: Record<string, MethodologySpec> = {
  bq: BQ_METHODOLOGY,
  backend: BACKEND_METHODOLOGY,
  "generic-tech": GENERIC_TECH_METHODOLOGY,
};

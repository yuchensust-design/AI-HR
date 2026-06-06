/**
 * Sample 投递数据 — 全部 isSample = true,前端会明显标"示例数据"。
 *
 * 角色设定: 理工背景 + 半年心理咨询师助理实习的学生,
 * 同时投 AI PM / 数据分析 / 心理咨询 / 用户研究 几个方向。
 *
 * 设计意图: 让指标卡和诊断同时有信号可读 —
 *   - 数据分析方向投得多,回复率一般 -> 简历可能不够对口
 *   - 心理咨询方向投得少但回复率高 -> 体现"方向差距"诊断信号
 *   - AI PM 进了面试但 offer 还没出 -> 体现 "已投递 -> 面试" 漏斗
 *   - 有几条 ghosted -> 让 ghostedRate 不为 0,体现现实节奏
 */

import { Application } from "./tracker-types";

export const SAMPLE_APPLICATIONS: Application[] = [
  {
    id: "sample-001",
    industry: "互联网 / AI 工具",
    role: "AI 产品经理(实习)",
    direction: "ai_pm",
    appliedAt: "2026-04-10",
    resumeVersion: "v3 · AI PM 主投版",
    status: "interview",
    statusUpdatedAt: "2026-05-12",
    notes: "三面已过,等部门评议,主考关注 AI 应用落地经验。",
    isSample: true,
  },
  {
    id: "sample-002",
    industry: "互联网 / 电商",
    role: "用户增长数据分析(实习)",
    direction: "data_analysis",
    appliedAt: "2026-04-14",
    resumeVersion: "v2 · 数据分析主投版",
    status: "rejected",
    statusUpdatedAt: "2026-05-02",
    notes: "笔试 SQL 题答完进了一面,被反馈缺少 A/B test 项目经验。",
    isSample: true,
    rounds: [
      { id: "r-002-1", type: "written_test", outcome: "passed", date: "2026-04-18" },
      {
        id: "r-002-2",
        type: "first_round",
        outcome: "failed",
        failReason: "tech_depth",
        note: "A/B test 实验设计没做过,被追问统计显著性卡住",
        date: "2026-05-02",
      },
    ],
    finalFailReason: "tech_depth",
  },
  {
    id: "sample-003",
    industry: "互联网 / 内容社区",
    role: "数据分析师(实习)",
    direction: "data_analysis",
    appliedAt: "2026-04-20",
    resumeVersion: "v2 · 数据分析主投版",
    status: "ghosted",
    statusUpdatedAt: "2026-05-25",
    notes: "投完一直没有反馈,简历未读。",
    isSample: true,
    rounds: [
      {
        id: "r-003-1",
        type: "written_test",
        outcome: "failed",
        failReason: "no_response",
        note: "简历投了 5 周没动静,推测初筛挂",
      },
    ],
    finalFailReason: "no_response",
  },
  {
    id: "sample-004",
    industry: "互联网 / SaaS",
    role: "增长策略分析(实习)",
    direction: "data_analysis",
    appliedAt: "2026-04-22",
    resumeVersion: "v2 · 数据分析主投版",
    status: "applied",
    statusUpdatedAt: "2026-04-22",
    notes: "JD 强调 Python + SQL + 业务理解,简历里业务部分较弱。",
    isSample: true,
  },
  {
    id: "sample-005",
    industry: "医疗健康 / EAP 心理服务",
    role: "心理咨询师助理 / 用户体验",
    direction: "psych_counseling",
    appliedAt: "2026-05-02",
    resumeVersion: "v4 · 心理咨询主投版",
    status: "interview",
    statusUpdatedAt: "2026-05-28",
    notes: "二面面试官关注共情表达 + 来访登记数据,反馈正向。",
    isSample: true,
  },
  {
    id: "sample-006",
    industry: "教育 / 青少年心理",
    role: "心理评估实习生",
    direction: "psych_counseling",
    appliedAt: "2026-05-08",
    resumeVersion: "v4 · 心理咨询主投版",
    status: "written_test",
    statusUpdatedAt: "2026-05-26",
    notes: "笔试以案例为主,涉及 SCL-90 解读。",
    isSample: true,
  },
  {
    id: "sample-007",
    industry: "互联网 / 教育科技",
    role: "AI 学习产品经理(实习)",
    direction: "ai_pm",
    appliedAt: "2026-05-10",
    resumeVersion: "v3 · AI PM 主投版",
    status: "ghosted",
    statusUpdatedAt: "2026-06-01",
    notes: "面向应届的 JD,基本要求重合,但未收到笔试通知。",
    isSample: true,
    rounds: [
      {
        id: "r-007-1",
        type: "written_test",
        outcome: "failed",
        failReason: "no_response",
        note: "JD 要求 LLM 应用经验,简历项目偏前端,可能没过初筛",
      },
    ],
    finalFailReason: "no_response",
  },
  {
    id: "sample-008",
    industry: "互联网 / 用户研究",
    role: "用户研究助理(实习)",
    direction: "user_research",
    appliedAt: "2026-05-15",
    resumeVersion: "v4 · 心理咨询主投版",
    status: "applied",
    statusUpdatedAt: "2026-05-15",
    notes: "看 JD 偏定性研究,跟心理咨询经历的访谈技能匹配。",
    isSample: true,
  },
];

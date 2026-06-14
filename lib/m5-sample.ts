/**
 * 模块 5 模拟面试 — 示例复盘数据(评委预览用)
 *
 * 对应 lib/tracker-sample.ts 的角色:给 /m5/debrief?demo=1 喂一份**结构完整、同构真实输出**
 * 的 mock 复盘,让评委不用真打一场面试就能看到 m5 的全部分析能力。
 *
 * 场景:产品经理实习 · 半结构化 · 🌸 亲切姐姐(用户选定)
 * 设计取向:
 *   - 表现中上(表达 4 维均分 4.0),既有亮点也露一处短板(口水话偏多 → 触发示范回答)
 *   - 覆盖真实复盘所有区块:表达 4 维 + 证据 / 岗位能力维度 / 简历回写候选 / 整场摘要 / 缺失信号 / 下一步
 *   - 全部文案 company-scrub(只到「行业 + 职位类型」),与线上一致
 */
import type { InterviewSession, DebriefResult } from "@/lib/interview-types";

/** 示例用的固定时间(lib 不能用 Date.now,写死即可) */
const STARTED_AT = "2026-06-12T14:00:00.000Z";
const FINISHED_AT = "2026-06-12T14:26:00.000Z"; // 用时约 26 分钟

export const SAMPLE_INTERVIEW_SESSION: InterviewSession = {
  id: "sample-m5-pm-intern",
  config: {
    resume_text:
      "某 985 高校 信息管理与信息系统 大三在读。校园二手交易小程序「拾光」联合创始人(负责产品):0→1 设计交易闭环,半年累计 8000+ 注册、月活 1200。某互联网公司 增长产品 实习:负责新人引导改版,把首日留存从 38% 提升到 47%。",
    jd_text:
      "AI 产品经理(实习)。职责:参与 AI 功能从需求到上线全流程;做用户调研与竞品分析;用数据驱动迭代,定义并跟踪核心指标;跨研发/设计/运营协作推进。要求:有产品实践、数据敏感、沟通清晰、对 AI 产品有热情。",
    type: "semi",
    persona: "gentle",
    num_questions: 10,
    mode: "audio_only",
    record: false,
    started_at: STARTED_AT,
    follow_up_budget: 6,
  },
  // questions 仅用于计数(摘要标题「N 题完整摘要」、hero「+N 追问」),内容与 transcript_summary 对应
  questions: [
    { id: "q1", text: "先做个简短自我介绍吧,重点讲你最想聊的那段经历就行~", intent: "暖场 + 抓主线", ideal_hints: [], category: "warmup", source: "main", interviewerStyle: "warm", sceneType: "semi_structured" },
    { id: "q2", text: "你为什么想做产品经理呀?", intent: "动机与岗位认知", ideal_hints: [], category: "behavioral", source: "main" },
    { id: "q3", text: "讲一个你主导的产品项目,从想法到落地的过程~", intent: "项目主导力 / STAR", ideal_hints: [], category: "project", source: "main" },
    { id: "q3f", text: "这个『首日留存 38%→47%』具体是怎么算的?改了哪几处?", intent: "数据真实性追问", ideal_hints: [], category: "project", source: "follow_up", parent_id: "q3" },
    { id: "q4", text: "需求总是做不完,你一般怎么排优先级?", intent: "优先级方法论", ideal_hints: [], category: "behavioral", source: "main" },
    { id: "q5", text: "讲一次你和开发或设计意见不一致、最后怎么解决的~", intent: "跨团队协作 / 冲突处理", ideal_hints: [], category: "behavioral", source: "main" },
    { id: "q5f", text: "要是对方坚持不让步,你会怎么办?", intent: "抗压 / 推进力", ideal_hints: [], category: "stress", source: "follow_up", parent_id: "q5" },
    { id: "q6", text: "最近有没有让你觉得『设计得真好』的产品?说说为什么~", intent: "产品品味 / 表达", ideal_hints: [], category: "project", source: "main" },
    { id: "q7", text: "一个功能上线后,你怎么判断它到底成不成功?", intent: "指标定义 / 数据驱动", ideal_hints: [], category: "technical", source: "main" },
    { id: "q8", text: "好啦,最后~ 你有什么想问我的吗?", intent: "收尾 / 反问质量", ideal_hints: [], category: "closing", source: "main" },
  ],
  answers: [],
  turn_evaluations: [],
};

export const SAMPLE_DEBRIEF: DebriefResult = {
  evaluable: true,
  avg: 4.0,
  answeredCount: 10,
  totalCount: 10,
  finished_at: FINISHED_AT,
  scores: [
    {
      dim: "逻辑性",
      score: 5,
      evidence:
        "讲『拾光』时你用了完整 STAR:先点明『二手交易信息不对称』的背景,再说你做了交易闭环和信用分,最后落到『8000 注册、月活 1200』,结尾还回扣了最初的问题,结构很清楚。",
      improvement_example: null,
    },
    {
      dim: "具体性",
      score: 4,
      evidence:
        "留存项目你给了『38%→47%』『首日』这种硬数字,很加分;但讲优先级时停在『看重要性和紧急度』,没有举一个真实排过的例子,稍显笼统。",
      improvement_example: null,
    },
    {
      dim: "应答清晰度",
      score: 5,
      evidence:
        "整场句子完整、层次分明,基本没有卡顿重启,追问『留存怎么算的』时也能顺着接住、条理清楚地拆开讲。",
      improvement_example: null,
    },
    {
      dim: "口水话频次",
      score: 2,
      evidence:
        "全程『嗯…』『就是』『然后然后』偏多(粗估单题 20+ 次),尤其在 Q4、Q7 思考时密集,会冲淡你本来很扎实的内容。",
      improvement_example:
        "下次卡壳时,与其用『嗯…就是…然后』填空,不如停半秒先给结论再展开。比如 Q7 可以这样:『我会先定一个北极星指标——比如这个功能的次日留存;再看两个护栏指标,确保没有牺牲整体体验。上线后我会拉 A/B 对比,留存提升且统计显著,才算成功。』短停顿比口水话更显沉稳。",
    },
  ],
  evidence: {
    logic: "『拾光』项目 STAR 四要素完整且结尾呼应。",
    specific: "留存项目有『38%→47%』硬数字,但优先级问题缺真实例子。",
    clarity: "句子完整、层次分明,追问也能条理清楚地接住。",
    filler: "『嗯/就是/然后』单题约 20+ 次,思考时密集。",
  },
  highlights: [], // 与 resumeBackfillCandidates 同步(UI 优先读后者)
  resumeBackfillCandidates: [
    {
      question: "Q3 — 讲一个你主导的产品项目",
      excerpt:
        "我做新人引导改版时,先看了漏斗发现 60% 的人卡在第一步授权,就把授权挪到产生价值之后,首日留存从 38% 提到了 47%。",
      why:
        "这段同时有『定位问题(漏斗)→ 给方案(调整时机)→ 拿结果(留存+9pt)』的完整链路和硬数字,正好命中 JD 的『数据驱动迭代』,但你现在简历只写了一句『负责新人引导改版』,太亏。",
      suggestedBullet:
        "主导新人引导改版:基于漏斗分析定位首步授权流失(60%),将授权时机后置到价值点之后,首日留存 38%→47%(+9pt)。",
    },
    {
      question: "Q5 — 和开发/设计意见不一致怎么解决",
      excerpt:
        "我没有直接说我要这个,而是把两个方案都做成小样,拉了 20 个同学做了次轻量测试,用数据让大家一起看,最后开发也认可了。",
      why:
        "用『小样 + 轻量用户测试 + 数据对齐』化解冲突,体现了协作里的『用证据而非职级说话』,这是 PM 很值钱的软实力,简历里完全没体现。",
      suggestedBullet:
        "面对方案分歧,用双方案灰度小样 + 20 人轻量用户测试拿数据对齐,推动跨职能达成共识并落地。",
    },
    {
      question: "Q7 — 怎么判断一个功能成不成功",
      excerpt:
        "我会先定一个核心指标,再配一两个护栏指标,怕的是核心涨了但把别的体验搞坏了。",
      why:
        "主动提到『护栏指标』说明你有体系化的指标思维,不是只盯单一数字,这点很多候选人答不出来,值得在简历的项目描述里点一句。",
      suggestedBullet:
        "建立『北极星 + 护栏指标』的功能评估口径,以 A/B 实验验证迭代效果,避免单点指标优化伤害整体体验。",
    },
  ],
  capabilityScores: [
    {
      key: "user_insight",
      label: "用户洞察",
      score: 4,
      evidence: "能从『60% 卡在授权』的漏斗数据反推用户心理,把授权后置,说明你会从行为数据读用户。",
    },
    {
      key: "requirement_priority",
      label: "需求拆解与优先级",
      score: 3,
      evidence: "优先级答得偏框架(重要/紧急),缺一个真实排序案例;拆解能力有,但还没用具体场景证明。",
    },
    {
      key: "data_driven",
      label: "数据驱动决策",
      score: 4,
      evidence: "留存 38%→47%、漏斗定位、A/B 验证都主动提及,数字敏感度和实验意识在线。",
    },
    {
      key: "cross_team",
      label: "跨团队协作",
      score: 4,
      evidence: "用『双方案小样 + 用户测试拿数据对齐』化解与开发的分歧,体现了用证据推进的协作方式。",
    },
  ],
  missedSignals: [
    "JD 强调的『竞品分析』本场没主动展开 —— 可以准备一个『我对比过 X 类两款产品、得出什么取舍』的小故事。",
    "对『AI 产品』的理解只停在工具层,没聊到 AI 功能特有的体验/评估难点,面 AI 岗前值得补一句。",
  ],
  nextPractice:
    "逻辑和清晰度已经是你的亮点,下一场重点压两件事:① 把『嗯…就是…』换成半秒停顿 + 先给结论;② 优先级和竞品各准备一个带数字的真实例子。准备好后,可以挑战一次『⚡ 严厉压力』面练练抗压。",
  summary:
    "整体中上,表达 4 维均分 4.0:逻辑与清晰度是亮点,数据敏感度也不错;主要短板是口水话偏多,容易冲淡扎实的内容。注意:这是单场练习的诊断,建议看多场趋势、别盯单次绝对分。",
  transcript_summary: [
    { no: 1, q: "简短自我介绍", summary: "信管专业大三,二手交易小程序联创(产品)+ 增长产品实习,主线清晰。", score: 4, hasHighlight: false },
    { no: 2, q: "为什么想做产品经理", summary: "从『自己做的东西被同学真的用起来』讲动机,真诚但稍长。", score: 4, hasHighlight: false },
    { no: 3, q: "讲一个你主导的产品项目", summary: "新人引导改版:漏斗定位首步授权流失→授权后置→首日留存 38%→47%,STAR 完整。", score: 5, hasHighlight: true },
    { no: 4, q: "(追问)留存怎么算的、改了哪几处", summary: "解释了口径(注册当日活跃/注册)与两处改动,数据经得起追问。", score: 5, hasHighlight: false },
    { no: 5, q: "需求怎么排优先级", summary: "答到重要性/紧急度框架,但没给真实排过的例子,偏笼统。", score: 3, hasHighlight: false },
    { no: 6, q: "和开发/设计意见不一致怎么解决", summary: "双方案小样 + 20 人轻量测试拿数据对齐,推动达成共识。", score: 4, hasHighlight: true },
    { no: 7, q: "(追问)对方坚持不让步怎么办", summary: "回到共同目标 + 约定小范围灰度验证,展现推进力。", score: 4, hasHighlight: false },
    { no: 8, q: "最近觉得设计好的产品", summary: "举了一款笔记类产品,讲到『降低记录门槛』,品味在线但分析偏短。", score: 3, hasHighlight: false },
    { no: 9, q: "怎么判断功能成不成功", summary: "提出核心指标 + 护栏指标 + A/B 验证,体系化指标思维。", score: 4, hasHighlight: true },
    { no: 10, q: "有什么想问我的", summary: "问了团队如何衡量实习生成长,反问有质量。", score: 4, hasHighlight: false },
  ],
};

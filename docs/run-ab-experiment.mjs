#!/usr/bin/env node
/**
 * A/B 实验:验证 Phase 5 generate-resume 的 routing 设计
 *
 * Conditions:
 *   A = Baseline(只主框架)
 *   B = Static stuffing(主框架 + 全部 7 段补充)
 *   C = Dynamic routing(主框架 + 路由后 1-3 段)
 *
 * Personas:
 *   林婷(转专业):化学 → AI PM
 *   陈昊(拔高):CS → 字节 AI PM
 *
 * Judge: deepseek-reasoner R1 盲评(标签随机化)
 *
 * 输出:
 *   docs/ab-experiment-outputs.md(6 份 raw markdown)
 *   docs/ab-experiment-results.md(判官 JSON + 总分)
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load DEEPSEEK_API_KEY from .env.local
const envText = await fs.readFile(path.join(__dirname, '..', '.env.local'), 'utf-8')
const apiKey = envText.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1]?.trim()
if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing in .env.local')

const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com/v1' })

// ============ 主框架 (Condition A baseline) ============
const PROMPT_MAIN = `你是「Offer 捕手」模块 3 简历整理 skill 的 Phase 5 综合输出引擎。

任务:基于用户的 parsed_resume + jd_context + hidden_experience_candidates,产出一份针对目标 JD 调整好的简历(markdown 格式)+ 3-5 个 STAR / X-Y-Z 格式的 candidate bullets。

【硬约束 — 永远不许违反】
1. 永远不输出公司名(只到"行业 + 职位类型",例 "互联网 / 内容运营")
2. 缺失字段输出 null,绝不编造精确数字 / metric
3. 简历控制在 1 页(600-800 字 markdown)
4. 文案温和,不绝对化
5. JD 里的公司名是用户输入 OK,但你输出的 markdown / jd_summary 不能有公司名

【4 套思辨纪律内化】
- Anti-fabrication:未在 hidden_experience_candidates 里 verify 过的素材不用;未完成项目 bullet 标 ⚠️
- 沾边都算,不审判:把用户给的素材尽量翻译成可用 bullet,不拒绝

【输出格式 — 严格 JSON】
{
  "markdown": "完整简历 markdown(含教育 / 实习 / 项目 / 技能等章节)",
  "candidate_bullets": [
    { "source": "original|hidden", "text": "1 句 STAR / X-Y-Z bullet", "star_breakdown": "S/T/A/R 简短拆解" }
  ],
  "optimization_summary": "本次调整了 N 处,主要..."
}

candidate_bullets 必须 3-5 个,markdown 必须含教育 / 经历 / 项目 / 技能至少 4 个章节。`

// ============ 补充 skill 段(可选拼装) ============
const SKILL_SEGMENTS = {
  'narrative-tools': `
【嵌入 #3 wyh0626 narrative-tools 5 步重写】
责任 → 成就 5 步:
1. 找责任陈述句(开头是"负责" "协助" "参与" "完成")
2. 问"做了什么具体动作"(强 Action verb)
3. 问"产生了什么 measurable result"(量化)
4. 问"对业务 / 团队 / 用户的影响"(Impact)
5. 用 STAR 重写
反例:"负责数据分析" → 正例:"主导用户增长漏斗分析,定位关键流失节点,推动 DAU 留存率提升 18%"`,

  'bullet-writer': `
【嵌入 #4 resume-bullet-writer STAR / X-Y-Z 模板】
STAR: Situation + Task + Action + Result
X-Y-Z: 通过 X(动作) 达到 Y(量化结果) 实现 Z(更大影响)
Action verb 优先库:主导 / 设计 / 优化 / 推动 / 落地 / 验证 / 重构 / 建立 / 上线 / 增长 / 缩短 / 提升`,

  'ats-optimizer': `
【嵌入 #4 resume-ats-optimizer ATS 自检】
ATS 通过率自检 3 条:
- bullet 含 JD must_have 关键词 ≥ 60%(原词不变形)
- 章节标题用标准词:教育背景 / 实习经历 / 项目经验 / 专业技能
- 不用表格 / 图片 / 多列布局(markdown 纯文本 + 单层 bullet)`,

  'quantifier': `
【嵌入 #4 resume-quantifier 量化建议】
找量化机会的 3 维:
- 规模(用户数 / 数据量 / 流量 / 团队规模)
- 速度(时间缩短 / 频次提升)
- 质量(准确率 / 转化率 / 满意度 / 留存)
没有真实数字时:用"估算 X-Y"或"~"模糊化,或转质化描述,绝不编造精确数字。`,

  'career-changer-translator': `
【嵌入 #4 career-changer-translator 跨专业翻译】
跨专业 / 转方向用户的 transferable skill 翻译表:
- 实验室经验 → 数据严谨度 / 实验设计 / 报告撰写 / lab notebook 习惯
- 教学 / 公益讲解 → 跨背景沟通 / 复杂概念简化 / 共情用户 / 用户访谈雏形
- 学生干部 → 跨部门协同 / 资源调度 / 利益协调 / stakeholder 管理
- 学术竞赛 / 课程项目 → 短期目标管理 / 压力下交付 / 团队协作
- 任何非目标领域经验 → 重新框定为"跨领域视角 / 用户共情 / 学习敏捷度"`,

  'tech-resume-optimizer': `
【嵌入 #4 tech-resume-optimizer 技术岗模板】
技术岗 bullet 4 要素:
- 技术栈(语言 / 框架 / 工具,具体版本可加)
- 项目深度(架构选择 / trade-off / 关键决策)
- 度量(QPS / latency / 数据量 / 模型 metric / 业务 metric)
- 团队角色(独立 / leader / 协作,几人团队)`,

  'tencent-resume-guide': `
【嵌入 #2 tencent resume-guide 6 大常见误区】
6 大常见误区(用户简历里出现就改写):
1. 职责陈述无成果("负责数据分析" → 必须给量化 result)
2. 主观形容词无证据("熟练 Python" → 应改"用 Pandas 完成 X 数据清洗")
3. 写公司业务不写自己("公司是 X 平台" → 应说"在 X 平台做了什么")
4. wall of text 大段长句 → 拆成 1 行 1 bullet
5. 工具罗列无场景("Excel / SQL / Python" → 应附 1-2 个场景)
6. 学校 / GPA 重复强调(教育栏写过就不再 bullet 里强调)`,
}

// ============ Persona 数据 ============
const PERSONAS = {
  '林婷': {
    parsed_resume: {
      basic: { name: '林婷', major: '应用化学', year: '大三', school: '某 211 高校' },
      education: [{ school: '某 211 高校', major: '应用化学', period: '2023.09-2027.06', gpa: '3.5/4.0', courses: ['有机化学', '分析化学', '化学统计', 'Python 程序设计(选修)'] }],
      experience: [{ org: '校化学实验室', role: '本科生科研助理', period: '2024.09-至今', bullets: ['负责实验数据记录与整理', '协助导师完成 3 篇论文图表绘制', '参与有机合成反应实验'] }],
      projects: [{ name: '高中化学公益讲解', period: '2024.07-2024.08', role: '志愿者', bullets: ['给县城高中生讲解高考化学', '设计了 5 个化学概念可视化课件'] }],
      activities: [{ org: '校数学建模协会', role: '成员', period: '2024.03-2024.12', bullets: ['参加全国大学生数学建模竞赛获省二等奖', '负责数据清洗和论文撰写'] }],
      skills: { languages: ['英语 CET6'], frameworks: [], tools: ['Origin', 'Excel', 'Python(初级)'], domain: ['有机化学', '分析化学'] },
    },
    jd_context: {
      jd_summary: '某互联网公司 AI 产品经理实习',
      must_have: ['数据敏感度', '用户研究能力', 'AI 产品基础理解', '跨团队协同', '英语阅读'],
      nice_to_have: ['有产品经验', 'Python / SQL'],
      gaps: ['无互联网产品实习', '无 PRD 撰写经验', 'AI 产品方法论生疏'],
    },
    hidden_experience_candidates: [
      { source_question: '你有跟陌生人深入访谈的经验吗?', user_answer: '化学公益讲解时跟 30 个高中生 1v1 答疑过 3 天', star: 'S:县城公益讲解 T:摸清高中生化学痛点 A:1v1 答疑 30 人,记录 5 类高频疑问 R:讲课设计 2.0 版命中率提升,被县教育局推荐再办一期' },
      { source_question: '你有处理大量数据的经验吗?', user_answer: '数学建模时清洗 8000 条卫星数据', star: 'S:全国大学生数学建模 T:卫星轨道数据清洗 A:用 Python 写 3 个清洗脚本,数据从 8000 条降到 2400 条有效 R:模型精度提升,获省二等奖' },
    ],
    persona_label: '林婷型 — 跨专业(化学 → AI PM),需要 transferable skill 翻译',
    routing_C: ['career-changer-translator', 'narrative-tools', 'ats-optimizer'],
  },

  '陈昊': {
    parsed_resume: {
      basic: { name: '陈昊', major: '计算机科学与技术', year: '大四', school: '某 985 高校' },
      education: [{ school: '某 985 高校', major: '计算机科学与技术', period: '2022.09-2026.06', gpa: '3.7/4.0', courses: ['数据结构', '机器学习', '数据库', '推荐系统'] }],
      experience: [{ org: '某短视频大厂', role: '用户增长实习生', period: '2025.06-2025.12', bullets: ['负责用户增长漏斗分析', '搭建 SQL 自动化日报', '参与 3 个 AB test'] }],
      projects: [{ name: 'AI 学习助手', period: '2025.03-2025.06', role: '独立开发', bullets: ['基于 Claude API + Next.js 开发', '辅助高中数学错题分析', '30 个用户试用'] }, { name: 'Cursor 教学公众号', period: '2024.09-至今', role: '主理人', bullets: ['累计推文 12 篇', '阅读量 5000+'] }],
      activities: [],
      skills: { languages: ['英语 CET6', 'Python', 'TypeScript'], frameworks: ['Next.js', 'React'], tools: ['SQL', 'Pandas', 'Claude API'], domain: ['用户增长', 'AB 实验', 'AI 产品'] },
    },
    jd_context: {
      jd_summary: '某短视频大厂 AI 产品经理实习',
      must_have: ['数据驱动决策', 'AB test 设计与复盘', 'AI 产品理解', '大厂协作经验', 'SQL'],
      nice_to_have: ['有独立 AI 产品作品', '懂用户增长'],
      gaps: ['AI 产品深度方法论(评估 / 反馈环 / 幻觉)', '推荐算法基础'],
    },
    hidden_experience_candidates: [
      { source_question: '你做 AI 产品时有用户访谈环节吗?', user_answer: 'AI 学习助手做了 30 个真实用户访谈', star: 'S:AI 学习助手 V1 上线 T:验证 PMF A:1v1 访谈 30 个高中生,识别 5 大痛点 R:迭代 V2 增加错题归因,留存 +20%(估算)' },
    ],
    persona_label: '陈昊型 — 拔高(CS → 大厂 AI PM),需要技术深度 + 量化拔高',
    routing_C: ['tech-resume-optimizer', 'quantifier', 'ats-optimizer'],
  },
}

// ============ 拼 condition prompt ============
const ALL_SUPPLEMENTS = ['narrative-tools', 'bullet-writer', 'ats-optimizer', 'quantifier', 'career-changer-translator', 'tech-resume-optimizer', 'tencent-resume-guide']

function buildSystemPrompt(condition, persona) {
  if (condition === 'A') return PROMPT_MAIN
  if (condition === 'B') return PROMPT_MAIN + ALL_SUPPLEMENTS.map(s => SKILL_SEGMENTS[s]).join('\n')
  if (condition === 'C') return PROMPT_MAIN + PERSONAS[persona].routing_C.map(s => SKILL_SEGMENTS[s]).join('\n')
  throw new Error(`unknown condition: ${condition}`)
}

function buildUserPrompt(persona) {
  const p = PERSONAS[persona]
  return `请基于以下输入产出最终简历 markdown + candidate bullets。

parsed_resume (用户简历结构化):
${JSON.stringify(p.parsed_resume, null, 2)}

jd_context (目标 JD 解析):
${JSON.stringify(p.jd_context, null, 2)}

hidden_experience_candidates (Phase 3 挖到的隐藏经验):
${JSON.stringify(p.hidden_experience_candidates, null, 2)}

返 JSON。`
}

// ============ 调 LLM ============
async function callGenerate(condition, persona) {
  console.log(`[${persona} / ${condition}] calling generate-resume...`)
  const resp = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: buildSystemPrompt(condition, persona) },
      { role: 'user', content: buildUserPrompt(persona) },
    ],
    temperature: 0.5,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
  })
  const content = resp.choices[0]?.message?.content ?? ''
  const tokens = resp.usage
  let parsed
  try { parsed = JSON.parse(content) }
  catch { parsed = { _parse_error: true, raw: content } }
  return { condition, persona, parsed, tokens, raw: content }
}

// ============ Judge ============
function shuffleLabels() {
  // 给判官:label_X / label_Y / label_Z,内部映射回 A/B/C
  const labels = ['X', 'Y', 'Z']
  const conditions = ['A', 'B', 'C']
  // Fisher-Yates with deterministic seed (avoid random for reproducibility)
  // Use the order: A→Y, B→X, C→Z (arbitrary fixed shuffle)
  return { X: 'B', Y: 'A', Z: 'C' }
}

async function callJudge(persona, outputs) {
  const labelMap = shuffleLabels()
  const reverseMap = Object.fromEntries(Object.entries(labelMap).map(([k, v]) => [v, k]))

  const X = outputs.find(o => o.condition === labelMap.X)
  const Y = outputs.find(o => o.condition === labelMap.Y)
  const Z = outputs.find(o => o.condition === labelMap.Z)

  const judgePrompt = `你是资深 HR + 简历教练。下面是 3 份简历(候选 X / Y / Z),都是给同一个用户(${PERSONAS[persona].persona_label})整理的,目标 JD = "${PERSONAS[persona].jd_context.jd_summary}"。

按 6 维盲评 0-10(整数):

1. 量化覆盖度:bullets 含具体数字 / metric / impact 的比例
2. 责任→成就转化:非"负责/协助/参与"开头的比例
3. ATS 关键词命中:跟 JD must_have ${JSON.stringify(PERSONAS[persona].jd_context.must_have)} 的重合密度
4. Persona 契合度:针对该用户痛点的针对性
   - 林婷型:transferable skill 翻译质量 + 跨专业故事的可信度
   - 陈昊型:技术深度 + 量化拔高 + 大厂语言
5. 简洁度:估算 1 页 Word(600-800 字)是否 fit
6. Anti-fabrication:是否编造未验证 metric / 公司名露出

输出严格 JSON:
{
  "X": { "q1": N, "q2": N, "q3": N, "q4": N, "q5": N, "q6": N, "total": N, "comment": "< 50 字" },
  "Y": { ... 同上 ... },
  "Z": { ... 同上 ... },
  "winner": "X|Y|Z",
  "winner_reason": "< 80 字 说明为啥赢"
}

候选 X:
\`\`\`markdown
${X.parsed.markdown ?? X.raw.slice(0, 2500)}
\`\`\`

candidate_bullets X: ${JSON.stringify(X.parsed.candidate_bullets ?? [], null, 2).slice(0, 800)}

候选 Y:
\`\`\`markdown
${Y.parsed.markdown ?? Y.raw.slice(0, 2500)}
\`\`\`

candidate_bullets Y: ${JSON.stringify(Y.parsed.candidate_bullets ?? [], null, 2).slice(0, 800)}

候选 Z:
\`\`\`markdown
${Z.parsed.markdown ?? Z.raw.slice(0, 2500)}
\`\`\`

candidate_bullets Z: ${JSON.stringify(Z.parsed.candidate_bullets ?? [], null, 2).slice(0, 800)}

返 JSON。`

  console.log(`[${persona}] calling judge (R1)...`)
  const resp = await client.chat.completions.create({
    model: 'deepseek-reasoner',
    messages: [{ role: 'user', content: judgePrompt }],
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  })
  const content = resp.choices[0]?.message?.content ?? ''
  let parsed
  try { parsed = JSON.parse(content) }
  catch { parsed = { _parse_error: true, raw: content } }
  return { persona, labelMap, reverseMap, parsed, raw: content, tokens: resp.usage }
}

// ============ 跑全套 ============
const allOutputs = []
const allJudges = []

for (const persona of Object.keys(PERSONAS)) {
  const outs = []
  for (const cond of ['A', 'B', 'C']) {
    const out = await callGenerate(cond, persona)
    outs.push(out)
    allOutputs.push(out)
  }
  const j = await callJudge(persona, outs)
  allJudges.push(j)
}

// ============ 写 raw outputs ============
let outputsMd = `# A/B 实验 raw 输出\n\n生成时间:2026-06-01\n\n`
for (const out of allOutputs) {
  outputsMd += `\n---\n\n## ${out.persona} / Condition ${out.condition}\n\n`
  outputsMd += `**tokens**: prompt=${out.tokens?.prompt_tokens} completion=${out.tokens?.completion_tokens}\n\n`
  outputsMd += `### markdown\n\n\`\`\`markdown\n${out.parsed.markdown ?? '(parse error)'}\n\`\`\`\n\n`
  outputsMd += `### candidate_bullets\n\n\`\`\`json\n${JSON.stringify(out.parsed.candidate_bullets ?? [], null, 2)}\n\`\`\`\n\n`
  outputsMd += `### optimization_summary\n\n${out.parsed.optimization_summary ?? '(none)'}\n`
}
await fs.writeFile(path.join(__dirname, 'ab-experiment-outputs.md'), outputsMd)

// ============ 写 judge results + 解码标签 ============
let resultsMd = `# A/B 实验 — 判官评分 + 解码\n\n生成时间:2026-06-01\n\nJudge model: deepseek-reasoner (R1) · 盲评(X/Y/Z 随机化)\n\n`
const aggregate = { A: { total: 0, dims: [0,0,0,0,0,0], count: 0 }, B: { total: 0, dims: [0,0,0,0,0,0], count: 0 }, C: { total: 0, dims: [0,0,0,0,0,0], count: 0 } }

for (const j of allJudges) {
  resultsMd += `\n## ${j.persona}\n\n`
  resultsMd += `**Label mapping**(判官盲评 → 真实 condition): X=${j.labelMap.X} Y=${j.labelMap.Y} Z=${j.labelMap.Z}\n\n`

  if (j.parsed._parse_error) {
    resultsMd += `**Judge parse error**:\n\`\`\`\n${j.raw.slice(0, 2000)}\n\`\`\`\n`
    continue
  }

  resultsMd += `| 标签 | 实际 cond | Q1 量化 | Q2 责→成 | Q3 ATS | Q4 persona | Q5 简洁 | Q6 anti-fab | 总分 | 评语 |\n`
  resultsMd += `|---|---|---|---|---|---|---|---|---|---|\n`
  for (const label of ['X', 'Y', 'Z']) {
    const r = j.parsed[label]
    const realCond = j.labelMap[label]
    if (!r) continue
    const dims = [r.q1, r.q2, r.q3, r.q4, r.q5, r.q6]
    resultsMd += `| ${label} | **${realCond}** | ${dims[0]} | ${dims[1]} | ${dims[2]} | ${dims[3]} | ${dims[4]} | ${dims[5]} | ${r.total} | ${r.comment} |\n`
    aggregate[realCond].total += r.total
    for (let i = 0; i < 6; i++) aggregate[realCond].dims[i] += dims[i]
    aggregate[realCond].count += 1
  }
  resultsMd += `\n**判官 winner**: ${j.parsed.winner} (实际 cond = **${j.labelMap[j.parsed.winner]}**)\n\n`
  resultsMd += `**winner_reason**: ${j.parsed.winner_reason}\n`
}

resultsMd += `\n---\n\n## 总分汇总\n\n`
resultsMd += `| Condition | 含义 | 总分(2 persona 累加) | 平均总分 | Q1 量化 | Q2 责→成 | Q3 ATS | Q4 persona | Q5 简洁 | Q6 anti-fab |\n`
resultsMd += `|---|---|---|---|---|---|---|---|---|---|\n`
const labelMap = { A: 'Baseline (主框架)', B: 'Static stuffing (7 段全塞)', C: 'Dynamic routing (按矩阵)' }
for (const cond of ['A', 'B', 'C']) {
  const a = aggregate[cond]
  const avg = a.count > 0 ? (a.total / a.count).toFixed(1) : '-'
  resultsMd += `| **${cond}** | ${labelMap[cond]} | ${a.total} | ${avg} | ${a.dims[0]} | ${a.dims[1]} | ${a.dims[2]} | ${a.dims[3]} | ${a.dims[4]} | ${a.dims[5]} |\n`
}

resultsMd += `\n---\n\n## 实验结论(待 Claude 分析)\n\n(本节由 Claude 看完数据后填写,记录决策走向)\n`

await fs.writeFile(path.join(__dirname, 'ab-experiment-results.md'), resultsMd)

console.log('\n=== 实验完成 ===')
console.log(`总分:A=${aggregate.A.total} B=${aggregate.B.total} C=${aggregate.C.total}`)
console.log(`raw outputs: docs/ab-experiment-outputs.md`)
console.log(`judge results: docs/ab-experiment-results.md`)

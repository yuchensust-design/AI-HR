#!/usr/bin/env node
/**
 * 修复林婷判官调用 — R1 reasoner 的 JSON mode 返了空。
 * 改用 deepseek-chat (V3.1) + 显式"必须返 JSON"指令。
 * 重读 outputs.md,定位林婷的 3 份,重跑判官,把结果 append 到 results.md。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envText = await fs.readFile(path.join(__dirname, '..', '.env.local'), 'utf-8')
const apiKey = envText.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1]?.trim()
const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com/v1' })

// 读 outputs.md,parse 林婷的 3 份 markdown
const outputsText = await fs.readFile(path.join(__dirname, 'ab-experiment-outputs.md'), 'utf-8')

function extractMarkdown(personaCond) {
  const re = new RegExp(`## ${personaCond}\\n[\\s\\S]*?### markdown\\n\\n\`\`\`markdown\\n([\\s\\S]*?)\\n\`\`\`\\n\\n### candidate_bullets\\n\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``, 'm')
  const m = outputsText.match(re)
  if (!m) throw new Error(`no match for ${personaCond}`)
  return { markdown: m[1], bullets: m[2] }
}

const linA = extractMarkdown('林婷 / Condition A')
const linB = extractMarkdown('林婷 / Condition B')
const linC = extractMarkdown('林婷 / Condition C')

// 同样的盲评 mapping: X=B Y=A Z=C
const X = linB
const Y = linA
const Z = linC
const labelMap = { X: 'B', Y: 'A', Z: 'C' }

const judgePrompt = `你是资深 HR + 简历教练。下面是 3 份简历(候选 X / Y / Z),都是给同一个学生(林婷型 — 应用化学大三转 AI PM,需要 transferable skill 翻译)整理的,目标 JD = "某互联网公司 AI 产品经理实习",must_have = ["数据敏感度", "用户研究能力", "AI 产品基础理解", "跨团队协同", "英语阅读"]。

请按 6 维盲评 0-10(整数):

1. 量化覆盖度:bullets 含具体数字 / metric / impact 的比例
2. 责任→成就转化:非"负责/协助/参与"开头的比例
3. ATS 关键词命中:跟 JD must_have 的重合密度
4. Persona 契合度:transferable skill 翻译质量 + 跨专业故事可信度
5. 简洁度:估算 1 页 Word(600-800 字)是否 fit
6. Anti-fabrication:是否编造未验证 metric / 公司名露出

**必须返严格 JSON,无任何 markdown 包裹**:
{
  "X": { "q1": N, "q2": N, "q3": N, "q4": N, "q5": N, "q6": N, "total": N, "comment": "< 50 字" },
  "Y": { ... 同上 ... },
  "Z": { ... 同上 ... },
  "winner": "X|Y|Z",
  "winner_reason": "< 80 字 说明为啥赢"
}

候选 X:
\`\`\`markdown
${X.markdown}
\`\`\`

candidate_bullets X: ${X.bullets.slice(0, 600)}

候选 Y:
\`\`\`markdown
${Y.markdown}
\`\`\`

candidate_bullets Y: ${Y.bullets.slice(0, 600)}

候选 Z:
\`\`\`markdown
${Z.markdown}
\`\`\`

candidate_bullets Z: ${Z.bullets.slice(0, 600)}

返 JSON。`

console.log('[林婷] re-running judge with deepseek-chat...')
const resp = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: [{ role: 'user', content: judgePrompt }],
  temperature: 0.2,
  max_tokens: 2000,
  response_format: { type: 'json_object' },
})
const content = resp.choices[0]?.message?.content ?? ''
console.log('tokens:', resp.usage)

let parsed
try { parsed = JSON.parse(content) }
catch (e) {
  console.log('parse error, raw:', content)
  process.exit(1)
}

console.log('Judge result:')
console.log(JSON.stringify(parsed, null, 2))

// 写到 results.md 替换林婷段落
let resultsMd = await fs.readFile(path.join(__dirname, 'ab-experiment-results.md'), 'utf-8')

const newLinSection = `
## 林婷(重跑,deepseek-chat judge)

**Label mapping**(判官盲评 → 真实 condition): X=B Y=A Z=C

| 标签 | 实际 cond | Q1 量化 | Q2 责→成 | Q3 ATS | Q4 persona | Q5 简洁 | Q6 anti-fab | 总分 | 评语 |
|---|---|---|---|---|---|---|---|---|---|
| X | **B** | ${parsed.X.q1} | ${parsed.X.q2} | ${parsed.X.q3} | ${parsed.X.q4} | ${parsed.X.q5} | ${parsed.X.q6} | ${parsed.X.total} | ${parsed.X.comment} |
| Y | **A** | ${parsed.Y.q1} | ${parsed.Y.q2} | ${parsed.Y.q3} | ${parsed.Y.q4} | ${parsed.Y.q5} | ${parsed.Y.q6} | ${parsed.Y.total} | ${parsed.Y.comment} |
| Z | **C** | ${parsed.Z.q1} | ${parsed.Z.q2} | ${parsed.Z.q3} | ${parsed.Z.q4} | ${parsed.Z.q5} | ${parsed.Z.q6} | ${parsed.Z.total} | ${parsed.Z.comment} |

**判官 winner**: ${parsed.winner} (实际 cond = **${labelMap[parsed.winner]}**)

**winner_reason**: ${parsed.winner_reason}

`

// 替换原来 fail 的林婷段
resultsMd = resultsMd.replace(/## 林婷\n\n\*\*Label mapping\*\*[\s\S]*?(?=\n## 陈昊)/, newLinSection + '\n')

// 重新累加总分
const linDims = [parsed.A?.q1 ?? null, ...[1,2,3,4,5,6].map(i => null)] // placeholder
const aggregate = { A: { total: 0, dims: [0,0,0,0,0,0] }, B: { total: 0, dims: [0,0,0,0,0,0] }, C: { total: 0, dims: [0,0,0,0,0,0] } }
// 林婷 from new
for (const [label, cond] of [['X','B'],['Y','A'],['Z','C']]) {
  const r = parsed[label]
  aggregate[cond].total += r.total
  ;[r.q1,r.q2,r.q3,r.q4,r.q5,r.q6].forEach((v,i) => aggregate[cond].dims[i] += v)
}
// 陈昊 from old (hardcode from results.md)
aggregate.B.total += 52; [10,8,8,9,8,9].forEach((v,i) => aggregate.B.dims[i] += v)
aggregate.A.total += 43; [5,5,7,7,10,9].forEach((v,i) => aggregate.A.dims[i] += v)
aggregate.C.total += 54; [8,10,10,8,9,9].forEach((v,i) => aggregate.C.dims[i] += v)

const aggregateMd = `
---

## 总分汇总(2 persona 累加,修复林婷后)

| Condition | 含义 | 总分(2 persona) | 平均总分 | Q1 量化 | Q2 责→成 | Q3 ATS | Q4 persona | Q5 简洁 | Q6 anti-fab |
|---|---|---|---|---|---|---|---|---|---|
| **A** | Baseline (主框架) | ${aggregate.A.total} | ${(aggregate.A.total/2).toFixed(1)} | ${aggregate.A.dims[0]} | ${aggregate.A.dims[1]} | ${aggregate.A.dims[2]} | ${aggregate.A.dims[3]} | ${aggregate.A.dims[4]} | ${aggregate.A.dims[5]} |
| **B** | Static stuffing (7 段全塞) | ${aggregate.B.total} | ${(aggregate.B.total/2).toFixed(1)} | ${aggregate.B.dims[0]} | ${aggregate.B.dims[1]} | ${aggregate.B.dims[2]} | ${aggregate.B.dims[3]} | ${aggregate.B.dims[4]} | ${aggregate.B.dims[5]} |
| **C** | Dynamic routing (按矩阵) | ${aggregate.C.total} | ${(aggregate.C.total/2).toFixed(1)} | ${aggregate.C.dims[0]} | ${aggregate.C.dims[1]} | ${aggregate.C.dims[2]} | ${aggregate.C.dims[3]} | ${aggregate.C.dims[4]} | ${aggregate.C.dims[5]} |
`

// 替换原"总分汇总"section
resultsMd = resultsMd.replace(/---\n\n## 总分汇总[\s\S]*?(?=---\n\n## 实验结论)/, aggregateMd + '\n')

await fs.writeFile(path.join(__dirname, 'ab-experiment-results.md'), resultsMd)
console.log('\nresults.md updated. aggregate:')
console.log(`  A=${aggregate.A.total} B=${aggregate.B.total} C=${aggregate.C.total}`)

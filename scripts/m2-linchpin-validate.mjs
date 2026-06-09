// Task 0 地基验证 harness — plan 09 §0.7 E 步骤 4
// 验证:认领卡 + reframe 数据 → 真能产出可用 bullet,且守住 v2.2 反虚构边界。
// 跑法:node scripts/m2-linchpin-validate.mjs   (key 读自 ../offer-catcher-web/.env.local)
import { readFileSync } from "node:fs";

// 读 DeepSeek key(worktree 无 .env.local,从主仓库读)
const envText = readFileSync(
  new URL("../../offer-catcher-web/.env.local", import.meta.url),
  "utf8"
);
const KEY = envText.match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("DEEPSEEK_API_KEY not found");

const SYSTEM = `你是"挖经历"模块的素材整理 AI。学生通过"认领多选"告诉你他做过哪些动作,你把这些整理成 1 条能写进简历的 bullet。

【铁律 — 反虚构(违反即失败)】
1. 只能用用户"勾选"或"明确说出"的事实。绝不新增用户没说的行为 / 规模 / 数字 / 成果。
2. 未知的数字一律写【请补充】占位(如"覆盖【请补充】名同学"),绝不编造具体数字。
3. **成果/影响**(如"提升成绩""提高满意度""帮助通过考试""效率提升")**若用户没明说,一律不要写**;确需体现成果时用【请补充效果】占位,**绝不替用户断言任何效果/影响**。这是最容易犯的错:把动作偷偷脑补成"带来了好结果"。
4. reframe = 只给"已陈述的事实"贴能力标签(如 批改作业→评估能力);不得借贴标签新增任何未陈述的行为/规模/影响。凡含推断标签的 bullet,在结尾标注"(标签推断)"。
5. 永远不输出任何公司 / 学校具体名称。
6. 句式平实可信,不用"主导/牵头"夸大词,除非用户明确认领了主导类动作。
7. **只给主题/领域、没给具体动作时(如"做过 X 课题""参加过 Y 项目"),绝不替他脑补做了什么具体工作**(不要写"数据采集""需求分析""模块开发"等用户没说的动作)。bullet 用"参与 X,具体负责【请补充具体职责】"占位,并用 need_confirm 追问。

只输出 JSON:{"bullets":[{"text":"...","competency":"...","label_inferred":true/false}],"need_confirm":"若有高加分项需确认主导还是参与,写这句话,否则空"}`;

async function call(userPrompt) {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.4,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? JSON.stringify(j);
}

const CASES = [
  {
    name: "① 常见认领(teaching)— 该产出 bullet,数字用【请补充】",
    prompt: `经历类别:助教/教学
用户勾选的动作(含能力标签):
- 答疑解惑 [知识表达·沟通能力]
- 一对一帮同学补弱项 [因材施教·mentoring]
用户额外自由文本:(无)
请产出 bullet。`,
  },
  {
    name: "② 长尾 reframe(选了'别的'+科研自由文本)— 贴标签不造发现",
    prompt: `经历类别:社团/学生组织 → 用户选了"以上都不是/我做的是别的"
用户自由文本:"其实我大二跟着导师做过一个关于本地水质监测的科研课题"
命中的 reframe 规则:competency=研究能力·严谨求证;追问=你在课题里具体负责哪一块?有没有产出(论文/报告/数据)?
注意:用户只说了"跟着做过水质监测课题",没说负责什么、没说产出。请贴能力标签产出 bullet,但不得编造负责内容/产出/数据。`,
  },
  {
    name: "③ 造假陷阱 — 只说'帮同学讲过题',不许编人数/效果",
    prompt: `经历类别:助教/教学
用户勾选:答疑解惑 [知识表达·沟通能力]
用户自由文本:"就是偶尔帮同学讲过题"
请产出 bullet。用户没给任何数字或效果。`,
  },
];

for (const c of CASES) {
  console.log("\n========== " + c.name + " ==========");
  console.log(await call(c.prompt));
}

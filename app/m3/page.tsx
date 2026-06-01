import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";

/**
 * 模块 3 · 简历整理 — Phase 5 结果展示页(陈昊 sample)
 * 路由 /m3
 */

const PHASES = [
  { no: "1", title: "简历解析", desc: "PDF/Word/MD 转结构化", done: true },
  { no: "2", title: "岗位匹配", desc: "拆 JD + 找命中亮点", done: true },
  { no: "3", title: "隐藏经验挖掘", desc: "选择题挖你没写进简历的素材", done: true },
  { no: "4", title: "学习计划", desc: "按时间预算给突击建议", done: true },
  { no: "5", title: "整理简历", desc: "整合所有对话 → Word 输出", current: true },
];

const CHANGES = [
  { type: "改", text: "「负责数据分析」→「主导用户增长漏斗分析,推动 DAU 留存率提升 18%」(加量化)" },
  { type: "新加", text: "AI 学习助手项目 — 从挖掘对话补:30 个真实用户访谈 / 推 Cursor 教学" },
  { type: "改", text: "「熟悉 Python」→「Python 数据分析 + Pandas / SQL 中等熟练度」(更具体)" },
  { type: "新加", text: "陈昊在 Phase 3 提到的「公众号 5000 粉」 → 加到「个人项目」" },
];

const SAMPLE_RESUME = {
  name: "陈昊",
  contact: "CS 大四 · 北京 · 138-xxxx-xxxx · chenhao@email.com",
  target: "目标:AI 产品经理实习",
  sections: [
    {
      heading: "教育背景",
      items: [
        {
          left: "某高校 计算机科学与技术 本科",
          right: "2022.09 - 2026.06",
          bullets: ["GPA 3.7 / 4.0(专业排名前 15%)", "主要课程:数据结构 / 机器学习 / 数据库"],
        },
      ],
    },
    {
      heading: "实习经历",
      items: [
        {
          left: "字节跳动 · 用户增长 实习生",
          right: "2025.06 - 2025.12",
          bullets: [
            "主导用户增长漏斗分析,定位关键流失节点,推动 DAU 留存率提升 18%",
            "搭建 SQL + Python 自动化日报体系,日报产出从 2h 缩到 15min",
            "参与 3 个 AB test 设计,负责实验数据复盘,撰写 4 篇内部分析报告",
          ],
        },
      ],
    },
    {
      heading: "项目经验",
      items: [
        {
          left: "AI 学习助手(独立开发)· 30+ 真实用户",
          right: "2025.03 - 2025.06",
          bullets: [
            "基于 Claude API + Next.js 开发,辅助高中生数学错题分析",
            "完成 30 个真实用户访谈,挖掘 5 个高频痛点,迭代 3 个版本",
            "推 Cursor 公众号教学,累计 5000+ 阅读",
          ],
        },
      ],
    },
    {
      heading: "技能",
      items: [
        {
          left: "技术栈",
          right: "",
          bullets: [
            "Python 数据分析(Pandas / NumPy)/ SQL 中等熟练度",
            "Next.js / React / 基础前端 / Claude API",
            "用户研究 / AB Test 设计 / 数据可视化",
          ],
        },
      ],
    },
  ],
};

export default async function Module3Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const fromDebrief = params.from === "debrief";

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {/* 从复盘跳来时:顶部固定的返回 banner */}
        {fromDebrief && (
          <section className="bg-esther-yellow/40 border-b-2 border-esther-yellow">
            <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-ink flex items-center gap-2">
                <span className="text-base">↩️</span>
                你刚刚从「模拟面试复盘」跳过来 — 看完简历可以回去继续看剩下复盘
              </p>
              <Link
                href="/m5/debrief"
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm whitespace-nowrap"
              >
                ← 返回复盘
              </Link>
            </div>
          </section>
        )}

        {/* 顶部 */}
        <section className="border-b border-border">
          <div className="max-w-[1200px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 03 · 简历整理
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              把简历改成能过筛的版本
            </h1>
            <p className="text-ink-soft text-sm">
              基于你的目标 JD(字节 AI PM 实习)+ 对话挖出来的隐藏经验,
              整理出可以直接投递的版本
            </p>
          </div>
        </section>

        <div className="max-w-[1200px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8">
          {/* 左:Phase 进度 + AI 改动总结 */}
          <aside className="space-y-6">
            {/* Phase 进度 */}
            <Card className="p-6 border-2 border-border">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                Process
              </p>
              <h3 className="text-base font-semibold text-ink mb-4">
                5 个 Phase 进度
              </h3>
              <ul className="space-y-3">
                {PHASES.map((p) => (
                  <li key={p.no} className="flex items-start gap-3">
                    <span
                      className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        p.current
                          ? "bg-esther-blue text-white animate-pulse"
                          : p.done
                          ? "bg-esther-yellow text-ink"
                          : "bg-warm-bg-deep text-ink-muted border border-border"
                      }`}
                    >
                      {p.done ? "✓" : p.no}
                    </span>
                    <div className="flex-1 pt-0.5">
                      <p
                        className={`text-sm font-medium leading-snug ${
                          p.current
                            ? "text-esther-blue"
                            : p.done
                            ? "text-ink"
                            : "text-ink-muted"
                        }`}
                      >
                        {p.title}
                      </p>
                      <p className="text-xs text-ink-soft mt-0.5">{p.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {/* AI 做的改动 */}
            <Card className="p-6 border-2 border-border bg-warm-bg-deep/30">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                What AI did for you
              </p>
              <h3 className="text-base font-semibold text-ink mb-4">
                💡 AI 帮你做了这 {CHANGES.length} 件事
              </h3>
              <ul className="space-y-3">
                {CHANGES.map((c, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span
                      className={`flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        c.type === "改"
                          ? "bg-esther-blue text-white"
                          : "bg-esther-yellow text-ink"
                      }`}
                    >
                      {c.type}
                    </span>
                    <p className="text-xs text-ink leading-relaxed">{c.text}</p>
                  </li>
                ))}
              </ul>
            </Card>

            {/* 下一步 */}
            <Card className="p-6 border-2 border-esther-blue/30 bg-esther-blue/5">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                Next steps
              </p>
              <h3 className="text-base font-semibold text-ink mb-3">
                简历做好了,接下来?
              </h3>
              <div className="space-y-2">
                <Link
                  href="/m5"
                  className="block p-3 rounded-lg bg-card border border-border hover:border-esther-blue transition-colors"
                >
                  <p className="text-sm font-medium text-esther-blue">
                    练一场模拟面试 →
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    用同一份 JD 跑 1 场,看你能不能讲清楚
                  </p>
                </Link>
                <Link
                  href="/m4"
                  className="block p-3 rounded-lg bg-card border border-border hover:border-esther-blue transition-colors"
                >
                  <p className="text-sm font-medium text-esther-blue">
                    补一段项目 →
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    AI PM 招人偏好「真用户研究」,可以 2-4 周做一个
                  </p>
                </Link>
              </div>
            </Card>
          </aside>

          {/* 右:简历预览 */}
          <div className="space-y-4">
            {/* 工具栏 */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">最终简历预览</span> ·
                陈昊 sample · 1 页布局
              </p>
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-border bg-card text-sm text-ink-soft hover:border-esther-blue transition-colors">
                  📋 复制 Markdown
                </button>
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-esther-blue text-white text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm">
                  ⬇ 下载 Word(.docx)
                </button>
              </div>
            </div>

            {/* 简历卡(Word 样式) */}
            <div className="bg-white border-2 border-border rounded-2xl shadow-md overflow-hidden">
              <div className="bg-warm-bg-deep px-6 py-2 border-b border-border flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-esther-red/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-esther-yellow/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-esther-blue/60" />
                </div>
                <p className="text-[11px] text-ink-muted font-display italic ml-3">
                  chenhao_AIPM_20260601.docx
                </p>
              </div>

              <div className="p-8 md:p-10 font-body-zh text-ink space-y-5">
                {/* 名字 + 联系方式 */}
                <div className="text-center pb-4 border-b border-border">
                  <h2 className="text-2xl font-bold text-ink mb-1">
                    {SAMPLE_RESUME.name}
                  </h2>
                  <p className="text-xs text-ink-soft">{SAMPLE_RESUME.contact}</p>
                  <p className="text-xs text-esther-blue mt-1.5 font-medium">
                    {SAMPLE_RESUME.target}
                  </p>
                </div>

                {/* sections */}
                {SAMPLE_RESUME.sections.map((sec) => (
                  <div key={sec.heading}>
                    <h3 className="text-sm font-bold text-esther-blue border-b border-esther-blue/30 pb-1 mb-3">
                      {sec.heading}
                    </h3>
                    {sec.items.map((item, idx) => (
                      <div key={idx} className="mb-3 last:mb-0">
                        <div className="flex items-baseline justify-between gap-3 mb-1.5">
                          <p className="text-sm font-semibold text-ink">
                            {item.left}
                          </p>
                          {item.right && (
                            <p className="text-xs text-ink-muted flex-shrink-0">
                              {item.right}
                            </p>
                          )}
                        </div>
                        <ul className="space-y-1">
                          {item.bullets.map((b, bi) => (
                            <li
                              key={bi}
                              className="text-xs text-ink-soft leading-relaxed flex items-start gap-2"
                            >
                              <span className="text-esther-blue mt-1.5 text-[6px] flex-shrink-0">
                                ●
                              </span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-ink-muted text-center font-display italic">
              字体:思源黑体 / 苹方 fallback · 1 页 · 无彩色 · 直接投递
            </p>

            {/* ASK AI 对话区(简历预览下方) */}
            <Card className="border-2 border-esther-yellow/60 bg-warm-bg-deep/30 overflow-hidden mt-6">
              <div className="bg-esther-yellow/30 px-5 py-3 border-b border-esther-yellow/60 flex items-center gap-2">
                <span className="text-base">💬</span>
                <p className="text-sm font-semibold text-ink">
                  跟 AI 继续聊 — 改 / 补充 / 调整
                </p>
                <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-card text-ink-muted border border-border">
                  对话历史
                </span>
              </div>

              <div className="p-5 space-y-4 max-h-[420px] overflow-y-auto">
                {/* 用户消息 1 */}
                <div className="flex gap-3 flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-esther-yellow/40 flex items-center justify-center text-sm flex-shrink-0">
                    👤
                  </div>
                  <div className="max-w-[80%] p-3 rounded-2xl rounded-tr-sm bg-esther-yellow text-ink text-sm leading-relaxed">
                    我之前还做过一个山区支教志愿者,3 个月,带 12 个学生数学。这要不要加?
                  </div>
                </div>

                {/* AI 回复 1 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-esther-blue/15 flex items-center justify-center text-sm flex-shrink-0">
                    🤖
                  </div>
                  <div className="max-w-[80%] space-y-2">
                    <div className="p-3 rounded-2xl rounded-tl-sm bg-card border border-border text-sm text-ink leading-relaxed">
                      要加。这跟你的「字节数据分析」形成
                      <span className="bg-esther-yellow/40" style={{ padding: "0 0.15em" }}>
                        「人本 + 数据」双能力
                      </span>
                      ,AI PM 招人正喜欢这种。我建议在「项目经验」加一条 ↓
                    </div>
                    <div className="p-3 rounded-xl bg-warm-bg-deep border-l-4 border-esther-blue">
                      <p className="text-[11px] text-ink-muted mb-1.5 font-display italic">
                        拟稿:
                      </p>
                      <p className="text-sm text-ink leading-relaxed">
                        山区支教志愿者 · 12 名高中学生数学辅导 · 3 个月持续跟进
                        <br />
                        · 设计针对性练习,期末数学平均提升 22 分
                        <br />
                        · 跟家长沟通学情,撰写 3 份学习分析报告
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-1.5 text-xs font-medium hover:bg-esther-blue-dark transition-colors">
                        ✓ 采纳 加进简历
                      </button>
                      <button className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-4 py-1.5 text-xs hover:border-esther-blue transition-colors">
                        ✗ 我自己改
                      </button>
                      <button className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-4 py-1.5 text-xs hover:border-esther-blue transition-colors">
                        🔁 换个拟法
                      </button>
                    </div>
                  </div>
                </div>

                {/* 用户消息 2 */}
                <div className="flex gap-3 flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-esther-yellow/40 flex items-center justify-center text-sm flex-shrink-0">
                    👤
                  </div>
                  <div className="max-w-[80%] p-3 rounded-2xl rounded-tr-sm bg-esther-yellow text-ink text-sm leading-relaxed">
                    那「实习经历」第 1 条 bullet 能不能再短一点?现在看着太长了
                  </div>
                </div>

                {/* AI 回复 2 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-esther-blue/15 flex items-center justify-center text-sm flex-shrink-0">
                    🤖
                  </div>
                  <div className="max-w-[80%] p-3 rounded-2xl rounded-tl-sm bg-card border border-border text-sm text-ink leading-relaxed">
                    OK。原版:「主导用户增长漏斗分析,定位关键流失节点,推动 DAU 留存率提升 18%」
                    <br />
                    精简版:
                    <span className="bg-esther-yellow/40" style={{ padding: "0 0.15em" }}>
                      「主导用户增长漏斗分析,DAU 留存率提升 18%」
                    </span>
                    — 关键数字保留,中间链路去掉。要不?
                  </div>
                </div>
              </div>

              {/* 输入框 */}
              <div className="border-t border-border bg-card p-4">
                <div className="flex items-end gap-2">
                  <textarea
                    placeholder="继续改 / 补充 — 例如「项目经验里加一条志愿者经历」「学历部分换个顺序」"
                    rows={2}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-warm-bg text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-none"
                  />
                  <button className="flex-shrink-0 inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors">
                    发送 →
                  </button>
                </div>
                <p className="text-[11px] text-ink-muted mt-2 leading-relaxed">
                  💡 提示:每改一次都会更新右上方的简历预览;不满意可以一句话回退
                </p>
              </div>
            </Card>
          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}

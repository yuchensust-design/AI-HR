import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";

/**
 * 模块 5 · 模拟面试 配置页
 * 路由 /m5
 * 全部必填,填齐才能点"开始模拟面试" → 跳 /m5/live
 */

const TYPES = [
  { key: "semi", label: "半结构化", desc: "国内校招主流 · 简历过 + 行为题" },
  { key: "bq", label: "行为面 BQ", desc: "STAR 题为主 · 适合外企 / 实习" },
  { key: "tech", label: "技术面", desc: "按 target role 出技术题" },
];

const PERSONAS = [
  {
    key: "gentle",
    emoji: "🌸",
    label: "亲切姐姐",
    desc: "鼓励 + 给提示 + 不打断 · 适合第一次试",
    color: "yellow",
  },
  {
    key: "strict",
    emoji: "⚡",
    label: "严厉压力",
    desc: "直接 + 追细节 + 不轻易点头 · 适合练抗压",
    color: "red",
  },
  {
    key: "rigor",
    emoji: "🔍",
    label: "严谨技术",
    desc: "抠技术细节 + 追原理 · 适合技术深面",
    color: "blue",
  },
];

const COUNTS = [
  { value: 5, label: "5 题", time: "10-15 分钟" },
  { value: 10, label: "10 题", time: "20-30 分钟", recommended: true },
  { value: 15, label: "15 题", time: "35-45 分钟" },
];

export default function Module5ConfigPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {/* 顶部 */}
        <section className="border-b border-border">
          <div className="max-w-[1000px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 05 · 模拟面试
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              先告诉我点信息,然后开始
            </h1>
            <p className="text-ink-soft text-sm">
              填齐下面,我用你的简历 + JD 出题,面试结束后给你 4 维评分复盘
            </p>
          </div>
        </section>

        {/* 表单 */}
        <div className="max-w-[1000px] mx-auto px-6 py-10 space-y-6">
          {/* 1. 简历 */}
          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                01
              </span>
              <h3 className="text-lg font-semibold text-ink">
                上传简历 <span className="text-esther-red">*</span>
              </h3>
            </div>
            <p className="text-xs text-ink-soft mb-4 pl-10">
              支持 PDF / Word / Markdown / 粘贴文本
            </p>
            <div className="pl-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button className="p-4 rounded-xl border-2 border-esther-blue bg-esther-blue/5 text-left hover:bg-esther-blue/10 transition-colors">
                  <p className="text-sm font-medium text-esther-blue mb-1">
                    ✓ 用我已有简历
                  </p>
                  <p className="text-[11px] text-ink-soft">
                    chenhao_AIPM_20260601.docx
                  </p>
                </button>
                <button className="p-4 rounded-xl border-2 border-dashed border-border bg-card text-left hover:border-esther-blue transition-colors">
                  <p className="text-sm font-medium text-ink mb-1">
                    📎 选择文件
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    .pdf / .docx / .md
                  </p>
                </button>
                <button className="p-4 rounded-xl border-2 border-dashed border-border bg-card text-left hover:border-esther-blue transition-colors">
                  <p className="text-sm font-medium text-ink mb-1">📋 粘贴文本</p>
                  <p className="text-[11px] text-ink-muted">直接贴简历内容</p>
                </button>
              </div>
            </div>
          </Card>

          {/* 2. JD */}
          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                02
              </span>
              <h3 className="text-lg font-semibold text-ink">
                目标岗位 JD <span className="text-esther-red">*</span>
              </h3>
            </div>
            <p className="text-xs text-ink-soft mb-4 pl-10">
              粘贴 JD 文本 · 越完整出题越准
            </p>
            <textarea
              className="w-full ml-0 md:ml-10 md:w-[calc(100%-2.5rem)] min-h-[140px] px-4 py-3 rounded-xl border-2 border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y"
              defaultValue={`【字节跳动 · AI 产品经理实习生】

岗位职责:
1. 参与 AI PM 团队的产品需求挖掘、设计与上线
2. 分析用户数据,辅助产品决策
3. 协调技术 / 设计资源推动项目落地

任职要求:
1. 计算机 / 数据 / 数学 等相关专业本科及以上
2. 对 AI 产品有热情,使用过 Claude / ChatGPT / Cursor 等工具
3. 数据分析能力,熟悉 Python / SQL
4. 有 0 → 1 项目经历优先`}
            />
          </Card>

          {/* 3. 面试类型 */}
          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                03
              </span>
              <h3 className="text-lg font-semibold text-ink">
                面试类型 <span className="text-esther-red">*</span>
              </h3>
            </div>
            <p className="text-xs text-ink-soft mb-4 pl-10">
              不同类型出题逻辑不同
            </p>
            <div className="pl-10 grid grid-cols-1 md:grid-cols-3 gap-3">
              {TYPES.map((t, idx) => (
                <button
                  key={t.key}
                  className={`p-4 rounded-xl border-2 text-left transition-colors ${
                    idx === 0
                      ? "border-esther-blue bg-esther-blue/5"
                      : "border-border bg-card hover:border-esther-blue/50"
                  }`}
                >
                  <p className="text-sm font-medium text-ink mb-1">{t.label}</p>
                  <p className="text-[11px] text-ink-soft leading-relaxed">
                    {t.desc}
                  </p>
                </button>
              ))}
            </div>
            <div className="pl-10 mt-3 flex items-center gap-3 flex-wrap">
              <span className="text-[11px] text-ink-muted">v2 即将上线 ·</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-warm-bg-deep text-ink-muted text-[11px] border border-border">
                案例面
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-warm-bg-deep text-ink-muted text-[11px] border border-border">
                群面
              </span>
            </div>
          </Card>

          {/* 4. 面试官性格 */}
          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                04
              </span>
              <h3 className="text-lg font-semibold text-ink">
                面试官性格 <span className="text-esther-red">*</span>
              </h3>
            </div>
            <p className="text-xs text-ink-soft mb-4 pl-10">
              不同性格 = 不同提问风格 + 不同 TTS 音色
            </p>
            <div className="pl-10 grid grid-cols-1 md:grid-cols-3 gap-3">
              {PERSONAS.map((p, idx) => (
                <button
                  key={p.key}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    idx === 0
                      ? "border-esther-blue bg-esther-blue/5"
                      : "border-border bg-card hover:border-esther-blue/50"
                  }`}
                >
                  <div className="text-3xl mb-2">{p.emoji}</div>
                  <p className="text-sm font-medium text-ink mb-1">{p.label}</p>
                  <p className="text-[11px] text-ink-soft leading-relaxed">
                    {p.desc}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          {/* 5. 题数 */}
          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                05
              </span>
              <h3 className="text-lg font-semibold text-ink">题数</h3>
            </div>
            <div className="pl-10 flex flex-wrap gap-3">
              {COUNTS.map((c) => (
                <button
                  key={c.value}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 transition-colors ${
                    c.recommended
                      ? "border-esther-blue bg-esther-blue/5"
                      : "border-border bg-card hover:border-esther-blue/50"
                  }`}
                >
                  <span className="text-sm font-medium text-ink">{c.label}</span>
                  <span className="text-[11px] text-ink-soft">{c.time}</span>
                  {c.recommended && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-esther-yellow text-ink">
                      推荐
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* 6. 摄像头 */}
          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                06
              </span>
              <h3 className="text-lg font-semibold text-ink">摄像头</h3>
            </div>
            <div className="pl-10 flex items-start gap-3">
              <input
                type="checkbox"
                defaultChecked
                className="mt-1 w-5 h-5 accent-esther-blue"
              />
              <div>
                <p className="text-sm text-ink font-medium mb-1">
                  开启摄像头(推荐)
                </p>
                <p className="text-xs text-ink-soft leading-relaxed">
                  可以练表情管理 · 视频流 100% 浏览器本地,绝不上传服务器
                </p>
              </div>
            </div>
          </Card>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3 pt-6">
            <Link
              href="/m5/live"
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-10 py-4 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-md"
            >
              开始模拟面试 →
            </Link>
            <p className="text-xs text-ink-muted">
              开始后不能改配置,中途可以暂停 / 跳过 / 结束
            </p>
          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}

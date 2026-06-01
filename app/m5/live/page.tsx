import Link from "next/link";
import Image from "next/image";

/**
 * 模块 5 · 模拟面试 进行中
 * 路由 /m5/live
 * 视频会议风 UI:左 Tab(答题思路/实时转写) + 右用户摄像头大 + AI 头像小
 */

const CURRENT_Q = {
  no: 3,
  total: 10,
  text: "讲讲你做过的 AI 学习助手项目 — 最关键的设计决策是什么,为什么这么做?",
  examineWhat: [
    "项目复杂度 + 你的具体贡献度",
    "技术选型理由 + trade-off 思考",
    "用户视角 vs 技术视角的平衡",
  ],
};

const ANSWER_TIPS = [
  "用 STAR 结构:背景 / 任务 / 行动 / 结果",
  "至少 1 个具体数字(eg DAU / 留存 / 反馈)",
  "说出 2-3 个你 own 的决策,不要说团队做的",
  "结尾用 1 句反思(我会怎么改进)",
];

const TRANSCRIPT = [
  { from: "interviewer", text: "好,我们直接开始。讲讲你做过的 AI 学习助手项目 — 最关键的设计决策是什么?" },
  { from: "user", text: "嗯…这个项目我做了大概 3 个月,主要是帮助高中生分析数学错题..." },
  { from: "user", text: "最关键的设计决策是,我选了 Claude API 而不是 GPT-4,因为成本更低 + 中文理解更好。我做了 10 个 case 对比测试..." },
];

export default function Module5LivePage() {
  return (
    <main className="h-screen bg-warm-bg-deep flex flex-col">
      {/* 顶部小 header */}
      <header className="bg-card border-b border-border px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/m5"
            className="text-sm text-ink-soft hover:text-esther-blue transition-colors"
          >
            ← 退出面试
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-esther-red/15 text-esther-red text-[11px] font-bold">
              ● LIVE
            </span>
            <span className="text-sm text-ink-soft">
              半结构化 · 亲切姐姐
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-sm text-ink">
            <span className="font-bold text-esther-blue">{CURRENT_Q.no}</span>
            <span className="text-ink-muted"> / {CURRENT_Q.total}</span>
          </p>
          <p className="text-sm text-ink font-mono">
            <span className="text-ink-muted">⏱</span> 08:42
          </p>
        </div>
      </header>

      {/* 主内容 grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] overflow-hidden">
        {/* 左侧文字面板 */}
        <aside className="bg-card border-r border-border flex flex-col overflow-hidden">
          {/* Tab 切换 */}
          <div className="border-b border-border flex">
            <button className="flex-1 py-3 text-sm font-medium text-esther-blue border-b-2 border-esther-blue bg-warm-bg-deep/30">
              答题思路
            </button>
            <button className="flex-1 py-3 text-sm font-medium text-ink-muted hover:text-ink transition-colors">
              实时转写
            </button>
          </div>

          {/* Tab 1 内容: 答题思路 */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* 当前问题 */}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-muted font-display italic mb-2">
                Current question
              </p>
              <p className="text-sm text-ink leading-relaxed font-medium">
                {CURRENT_Q.text}
              </p>
            </div>

            {/* 考察什么 */}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-muted font-display italic mb-2">
                考察什么
              </p>
              <ul className="space-y-1.5">
                {CURRENT_Q.examineWhat.map((e, i) => (
                  <li
                    key={i}
                    className="text-xs text-ink-soft leading-relaxed flex items-start gap-2"
                  >
                    <span className="text-esther-blue mt-1 text-[6px]">●</span>
                    {e}
                  </li>
                ))}
              </ul>
            </div>

            {/* 💡 查看回答思路 */}
            <div className="border border-esther-yellow/60 bg-esther-yellow/15 rounded-xl p-4">
              <p className="text-xs font-semibold text-ink mb-2">
                💡 查看回答思路
              </p>
              <ul className="space-y-1">
                {ANSWER_TIPS.map((t, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-ink leading-relaxed flex items-start gap-1.5"
                  >
                    <span className="text-esther-blue font-bold">→</span>
                    {t}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-ink-muted mt-2 font-display italic">
                * 可随时点,不会影响评分
              </p>
            </div>

            {/* 提示 */}
            <p className="text-[11px] text-ink-muted leading-relaxed font-display italic">
              ↑ 切换「实时转写」可以边说边看你 + 面试官的对话
            </p>
          </div>
        </aside>

        {/* 右侧视频区 */}
        <section className="relative bg-gradient-to-br from-warm-bg-deep to-warm-bg overflow-hidden flex items-center justify-center">
          {/* 用户摄像头大窗(占位) */}
          <div className="absolute inset-6 rounded-2xl bg-gradient-to-br from-ink/80 via-ink/70 to-ink/90 border border-border shadow-2xl flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-white/10 mx-auto mb-4 flex items-center justify-center text-4xl">
                👤
              </div>
              <p className="text-white/60 text-sm font-display italic">
                Your camera preview
              </p>
              <p className="text-white/30 text-[11px] mt-1">
                (实际部署后这里是你的实时画面)
              </p>
            </div>

            {/* 用户名标签 */}
            <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white text-xs">
              <span className="inline-block w-2 h-2 rounded-full bg-esther-yellow mr-2" />
              你
            </div>
          </div>

          {/* AI 头像小窗(右下角) */}
          <div className="absolute bottom-12 right-12 w-44 rounded-xl overflow-hidden shadow-xl border-2 border-esther-yellow z-10">
            <div className="aspect-[4/3] bg-warm-bg-deep flex items-center justify-center relative">
              <Image
                src="/esther-assets/avatar.jpg"
                alt="不二"
                width={120}
                height={120}
                className="rounded-full ring-2 ring-esther-blue"
              />
              {/* 说话指示 */}
              <div className="absolute bottom-2 right-2 flex items-end gap-0.5">
                <div className="w-1 h-2 bg-esther-blue rounded-full" />
                <div className="w-1 h-3 bg-esther-blue rounded-full" />
                <div className="w-1 h-1.5 bg-esther-blue rounded-full" />
              </div>
            </div>
            <div className="bg-card px-3 py-2 text-xs">
              <p className="font-medium text-ink">🌸 亲切姐姐</p>
              <p className="text-[10px] text-ink-muted">面试官</p>
            </div>
          </div>

          {/* 底部控件 */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-full bg-card/95 backdrop-blur-md border border-border shadow-lg">
            <button className="w-11 h-11 rounded-full bg-warm-bg-deep hover:bg-esther-yellow/30 transition-colors flex items-center justify-center text-base">
              ⏸
            </button>
            <button className="w-11 h-11 rounded-full bg-warm-bg-deep hover:bg-esther-yellow/30 transition-colors flex items-center justify-center text-base">
              🔁
            </button>
            <button className="px-4 h-11 rounded-full bg-warm-bg-deep hover:bg-esther-yellow/30 transition-colors text-sm text-ink-soft">
              跳过 这题
            </button>
            <div className="w-px h-6 bg-border mx-1" />
            <Link
              href="/m5/debrief"
              className="px-5 h-11 rounded-full bg-esther-red text-white hover:bg-esther-red/90 transition-colors text-sm font-medium flex items-center"
            >
              结束面试 →
            </Link>
          </div>

          {/* 思考中提示(右下落,延迟掩盖) */}
          <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-sm border border-border text-xs text-ink-soft">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-esther-blue animate-pulse" />
              <span
                className="w-1.5 h-1.5 rounded-full bg-esther-blue animate-pulse"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-esther-blue animate-pulse"
                style={{ animationDelay: "0.4s" }}
              />
            </span>
            听你回答中...
          </div>
        </section>
      </div>

      {/* 表情管理小贴士 */}
      <div className="bg-warm-bg border-t border-border px-6 py-2 flex items-center justify-center gap-4 text-[11px] text-ink-muted">
        <span>🎭 提示:看摄像头(不要看屏幕)</span>
        <span>·</span>
        <span>不皱眉,放松脸</span>
        <span>·</span>
        <span>语速适中,深呼吸</span>
      </div>
    </main>
  );
}

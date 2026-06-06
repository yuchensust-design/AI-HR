/**
 * m3 主页 aside 顶部 — 4 条短承诺(替代原"为什么可靠"长 aside)
 * 借鉴自原型 m3.html 右侧承诺卡 — 不解释技术,只承诺用户能拿到啥
 */

const PROMISES = [
  { icon: "🛡️", text: "不替你编经历" },
  { icon: "👍", text: "每条你拍板" },
  { icon: "📄", text: "格式不会乱" },
  { icon: "📥", text: "完成后下载 Word" },
];

export function ResumePromiseChips() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-display italic text-[11px] text-esther-blue mb-3">
        Our promise
      </p>
      <ul className="grid grid-cols-2 gap-y-2 gap-x-3">
        {PROMISES.map((p) => (
          <li
            key={p.text}
            className="flex items-center gap-1.5 text-[13px] text-ink leading-snug"
          >
            <span className="flex-shrink-0">{p.icon}</span>
            <span>{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { addEntry as addDiaryEntry } from "@/lib/diary";

/**
 * 「不二」情绪陪伴 — 右下角悬浮按钮 + chat panel
 *
 * v1 内存模式(PRD §3.8.6 刷新即清,不入 localStorage)
 * - panel 关闭再打开 → 历史保留
 * - 刷新 / 跳页面 → 清空
 *
 * Streaming chat 由 /api/buer/chat 提供(text/plain ReadableStream)
 *
 * v3 agent 能力:LLM 在文本里 emit [GO:/m3]简历整理[/GO] 这类 marker,
 * 前端 streaming 时隐藏不完整 marker,流末解析 → 渲染成可点 CTA 卡片
 * 点击 → router.push + 关 panel
 */

type Role = "user" | "assistant";
type RouteAction = { route: string; label: string };
type Message = {
  role: Role;
  content: string;
  actions?: RouteAction[];
  /** v3.1 §8.19 §B.2:user 消息可桥接到 /diary;assistant 消息忽略此字段 */
  savedToDiary?: boolean;
};

const INITIAL_GREETING: Message = {
  role: "assistant",
  content:
    "我是不二,你的情绪小窝~\n学业 / 求职 / 自我怀疑,都可以跟我聊聊。",
};

const PRESET_SCENARIOS = [
  "面试焦虑了",
  "简历卡住了",
  "offer 被拒了",
  "又开始否定自己了",
] as const;

// 检测 assistant 响应是否含权威心理援助热线号码 → 加红边突出样式
// 包含历史号码 12320(过渡期老缓存) + 当前权威 12356(2025-05-01 卫健委统一) + 010 北京中心
const HOTLINE_MARKERS = ["12356", "010-82951332", "12320"];

// v3:5 个模块路由白名单(LLM 瞎编路径 → 前端忽略;label 也用白名单值,不信任 LLM)
const ROUTE_WHITELIST: Record<string, string> = {
  "/m1": "兴趣岗位发现",
  "/m2": "经历挖掘",
  "/m3": "简历整理",
  "/m4": "项目设计",
  "/m5": "模拟面试",
};

// 完整 marker:[GO:/m3]简历整理[/GO]
const MARKER_RE = /\[GO:([^\]]+)\]([^\[]*)\[\/GO\]/g;

function isHotlineResponse(content: string): boolean {
  return HOTLINE_MARKERS.some((m) => content.includes(m));
}

// 流末解析:剥离完整 marker → 收集合法 actions(白名单 reject 非 /m1~/m5)
function splitMessageWithActions(raw: string): {
  content: string;
  actions: RouteAction[];
} {
  const actions: RouteAction[] = [];
  const seen = new Set<string>();
  const content = raw
    .replace(MARKER_RE, (_match, route: string) => {
      if (ROUTE_WHITELIST[route] && !seen.has(route)) {
        seen.add(route);
        actions.push({ route, label: ROUTE_WHITELIST[route] });
      }
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { content, actions };
}

// streaming 期间用:剥离完整 marker;若末尾还有"看起来像 marker 开头"的残片,隐藏
// 避免用户瞬时看到 "[GO:/m" 之类的半角字符
function previewDuringStreaming(acc: string): string {
  let s = acc.replace(MARKER_RE, "");
  const lastBracket = s.lastIndexOf("[");
  if (lastBracket >= 0) {
    const tail = s.substring(lastBracket);
    // tail 像 marker 开头(`[`, `[G`, `[GO`, `[GO:...`, `[/`, `[/G`, `[/GO`)且未闭合 → 隐藏
    if (/^\[\/?G?O?[:\]]?[^\[]*$/.test(tail) && !tail.includes("[/GO]")) {
      s = s.substring(0, lastBracket);
    }
  }
  return s;
}

/** v2 §8.20 §C.3 — summarize-diary 预览数据 */
type DiarySummary = {
  title: string;
  content: string;
  eligible: boolean;
  reason?: string;
  rawDialog: string[];
};

type SummaryPhase = "idle" | "loading" | "preview" | "saved" | "error";

const DIARY_HINT_KEY = "buer_floating_diary_hint_dismissed";

export function BuerFloatingButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // v2 §8.20 §C.3 — chat → AI 整理日记
  const [summaryPhase, setSummaryPhase] = useState<SummaryPhase>("idle");
  const [summary, setSummary] = useState<DiarySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // v3 §8.21 §C.7 — 首次打开时提示去 /diary 小窝
  const [showDiaryHint, setShowDiaryHint] = useState(false);
  useEffect(() => {
    if (open && typeof window !== "undefined") {
      const dismissed = window.localStorage.getItem(DIARY_HINT_KEY) === "1";
      if (!dismissed) setShowDiaryHint(true);
    }
  }, [open]);
  const dismissDiaryHint = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DIARY_HINT_KEY, "1");
    }
    setShowDiaryHint(false);
  };

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages, streaming, loading]);

  const handleActionClick = useCallback(
    (action: RouteAction) => {
      setOpen(false);
      router.push(action.route);
    },
    [router]
  );

  // v3.1 §8.19 §B.2 — 用户主动把这条 user 消息存到 /diary
  // 内存模式 (PRD §3.8.6) 不变;只是把这一条 user content 单独写到日记 localStorage
  const handleSaveToDiary = useCallback((idx: number) => {
    setMessages((prev) => {
      const msg = prev[idx];
      if (!msg || msg.role !== "user" || msg.savedToDiary) return prev;
      addDiaryEntry({
        content: msg.content,
        source: "buer-chat",
      });
      const next = [...prev];
      next[idx] = { ...msg, savedToDiary: true };
      return next;
    });
  }, []);

  // v2 §8.20 §C.3 — chat 多轮 → LLM 整理成第一人称日记
  const handleSummarize = useCallback(async () => {
    setSummaryPhase("loading");
    setSummaryError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/buer/summarize-diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `请求失败 ${res.status}`);
      }
      const data = (await res.json()) as DiarySummary;
      setSummary(data);
      setSummaryPhase("preview");
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "整理失败");
      setSummaryPhase("error");
    }
  }, [messages]);

  const handleSaveSummary = useCallback(() => {
    if (!summary || !summary.eligible) return;
    addDiaryEntry({
      title: summary.title,
      content: summary.content,
      source: "ai-summary",
      rawDialog: summary.rawDialog,
    });
    setSummaryPhase("saved");
    // 2 秒后回到 chat
    setTimeout(() => {
      setSummaryPhase("idle");
      setSummary(null);
    }, 2000);
  }, [summary]);

  const handleDiscardSummary = useCallback(() => {
    setSummaryPhase("idle");
    setSummary(null);
    setSummaryError(null);
  }, []);

  // 计算 user 消息数(用于显示"整理今天"按钮)
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const showSummarizeBtn = userMessageCount >= 3 && summaryPhase === "idle";

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const next: Message[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      setMessages(next);
      setInput("");
      setLoading(true);
      setStreaming("");

      try {
        const res = await fetch("/api/buer/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          acc += chunk;
          setStreaming(previewDuringStreaming(acc));
        }
        const tail = decoder.decode();
        if (tail) acc += tail;

        const { content, actions } = splitMessageWithActions(acc);
        setMessages([
          ...next,
          { role: "assistant", content, actions: actions.length ? actions : undefined },
        ]);
        setStreaming("");
      } catch (err) {
        console.warn("不二 chat error:", err);
        setMessages([
          ...next,
          {
            role: "assistant",
            content: "网络打了个嗝,要不再说一遍?",
          },
        ]);
        setStreaming("");
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const showScenarios = messages.length === 1 && !loading && !streaming;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="group fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-card border-2 border-esther-yellow shadow-lg pl-2 pr-5 py-2 hover:bg-warm-bg-deep transition-all"
        aria-label="找不二聊聊"
      >
        <div className="h-10 w-10 rounded-full overflow-hidden ring-2 ring-esther-blue bg-warm-bg">
          <Image
            src="/esther-assets/avatar.jpg"
            alt="不二"
            width={40}
            height={40}
            className="object-cover"
          />
        </div>
        <span className="text-sm font-medium text-ink">找不二聊聊</span>
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-3rem)] bg-card border-2 border-esther-yellow rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxHeight: "calc(100vh - 8rem)" }}
        >
          <div className="bg-warm-bg-deep px-5 py-4 border-b border-border flex items-center gap-3 flex-shrink-0">
            <Image
              src="/esther-assets/avatar.jpg"
              alt="不二"
              width={40}
              height={40}
              className="rounded-full ring-2 ring-esther-blue"
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink leading-tight">不二</p>
              <p className="text-xs text-ink-muted leading-tight mt-0.5">
                你的情绪小窝
              </p>
            </div>
            {/* v2 §8.20 §C.3 — 整理今天对话成日记(>= 3 条 user 消息才显示) */}
            {showSummarizeBtn && (
              <button
                onClick={handleSummarize}
                className="text-xs text-ink hover:text-white bg-esther-yellow/40 hover:bg-esther-blue transition-colors px-2 py-1 rounded-full border border-esther-yellow/70 hover:border-esther-blue font-display italic whitespace-nowrap"
                title="把今天对话整理成第一人称日记"
              >
                ✨ 整理今天
              </button>
            )}
            {/* v3.1 §8.19 §B.2 — 跳 /diary 看所有写过的日记 */}
            <a
              href="/diary"
              className="text-xs text-ink-soft hover:text-esther-blue transition-colors px-2 py-1 rounded-full border border-border bg-card font-display italic"
              title="看所有日记"
            >
              📔 日记
            </a>
            <button
              onClick={() => setOpen(false)}
              className="text-ink-muted hover:text-ink text-2xl leading-none px-1"
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          {/* v2 §8.20 §C.3 — summary modal overlay(覆盖 message 区)*/}
          {summaryPhase !== "idle" && (
            <div className="flex-1 overflow-y-auto px-4 py-4 bg-warm-bg/95 backdrop-blur-sm" style={{ maxHeight: "min(420px, calc(100vh - 16rem))" }}>
              {summaryPhase === "loading" && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="inline-block animate-spin w-8 h-8 border-4 border-esther-blue border-t-transparent rounded-full mb-4" />
                  <p className="text-sm text-ink-soft">不二正在整理今天的事...</p>
                  <p className="text-xs text-ink-muted mt-2 font-display italic">通常 5-10 秒</p>
                </div>
              )}

              {summaryPhase === "error" && (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <p className="text-3xl mb-3">😣</p>
                  <p className="text-sm text-esther-red mb-3">⚠️ {summaryError}</p>
                  <div className="flex gap-2">
                    <button onClick={handleSummarize} className="text-xs px-3 py-1.5 rounded-full bg-esther-blue text-white hover:bg-esther-blue-dark">重试</button>
                    <button onClick={handleDiscardSummary} className="text-xs px-3 py-1.5 rounded-full border border-border text-ink-soft hover:text-ink">取消</button>
                  </div>
                </div>
              )}

              {summaryPhase === "saved" && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <p className="text-4xl mb-3">✨</p>
                  <p className="text-base text-ink font-medium mb-1">已保存到日记!</p>
                  <p className="text-xs text-ink-muted font-display italic">/diary 页能看到</p>
                </div>
              )}

              {summaryPhase === "preview" && summary && (
                <div className="space-y-3">
                  {summary.eligible ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-esther-blue text-white">
                          🤖 AI 整理
                        </span>
                        <span className="text-[11px] text-ink-muted font-display italic">
                          基于你 {summary.rawDialog.length} 条对话
                        </span>
                      </div>
                      {summary.title && (
                        <h3 className="text-base font-bold text-ink leading-snug">
                          {summary.title}
                        </h3>
                      )}
                      <div className="p-3 rounded-lg bg-card border border-border max-h-64 overflow-y-auto">
                        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">
                          {summary.content}
                        </p>
                      </div>
                      <p className="text-[11px] text-ink-muted italic leading-relaxed">
                        💡 AI 重写自你对话,不会编造新信息;保存后 /diary 里可对照原始对话
                      </p>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleSaveSummary}
                          className="flex-1 inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark"
                        >
                          ✓ 保存到日记
                        </button>
                        <button
                          onClick={handleDiscardSummary}
                          className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-4 py-2 text-sm hover:text-ink"
                        >
                          ✗ 不保存
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-3xl mb-3">🌱</p>
                      <p className="text-sm text-ink mb-3 leading-relaxed">
                        {summary.reason || "今天的对话还没特别要记录的事,要不再多聊点?"}
                      </p>
                      <button
                        onClick={handleDiscardSummary}
                        className="text-xs px-4 py-1.5 rounded-full border border-border text-ink-soft hover:text-ink"
                      >
                        回去继续聊 →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* v3 §8.21 §C.7 — 首次提示去 /diary 小窝 */}
          {showDiaryHint && summaryPhase === "idle" && (
            <div className="bg-esther-yellow/20 border-b border-esther-yellow/60 px-4 py-2.5 flex items-start gap-2 flex-shrink-0">
              <span className="text-base flex-shrink-0">💡</span>
              <p className="flex-1 text-[11px] text-ink leading-relaxed">
                想专门写日记?去
                <a href="/diary" className="text-esther-blue font-medium hover:underline mx-0.5">
                  /diary 小窝
                </a>
                有 🖋️ 自己写 + 💬 跟我聊聊 两个专门入口
              </p>
              <button
                onClick={dismissDiaryHint}
                className="text-ink-muted hover:text-ink text-sm leading-none px-1 flex-shrink-0"
                aria-label="关闭提示"
              >
                ✕
              </button>
            </div>
          )}

          <div
            ref={scrollRef}
            className={`flex-1 overflow-y-auto px-4 py-4 space-y-3 ${summaryPhase !== "idle" ? "hidden" : ""}`}
            style={{ maxHeight: "min(420px, calc(100vh - 16rem))" }}
          >
            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                onActionClick={handleActionClick}
                onSaveToDiary={() => handleSaveToDiary(i)}
              />
            ))}

            {streaming && (
              <MessageBubble
                message={{ role: "assistant", content: streaming }}
                streaming
                onActionClick={handleActionClick}
              />
            )}

            {loading && !streaming && <TypingDots />}

            {showScenarios && (
              <div className="pt-2">
                <p className="text-[11px] text-ink-muted mb-2 px-1">
                  点一个最贴近你的:
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_SCENARIOS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-xs px-3 py-1.5 rounded-full bg-warm-bg border border-esther-yellow/50 text-ink hover:bg-esther-yellow/20 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-border bg-warm-bg-deep/40 px-3 py-3 flex items-end gap-2 flex-shrink-0"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="想说点什么..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none rounded-2xl px-3 py-2 text-sm bg-card border border-border focus:outline-none focus:border-esther-blue text-ink placeholder:text-ink-muted/70 disabled:opacity-60 max-h-24"
              style={{
                minHeight: "36px",
                lineHeight: "1.4",
              }}
            />
            <button
              type="submit"
              disabled={loading || input.trim().length === 0}
              className="flex-shrink-0 rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              发送
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function MessageBubble({
  message,
  streaming = false,
  onActionClick,
  onSaveToDiary,
}: {
  message: Message;
  streaming?: boolean;
  onActionClick?: (action: RouteAction) => void;
  /** v3.1 §8.19 §B.2 — 把 user 这条消息写到 /diary localStorage */
  onSaveToDiary?: () => void;
}) {
  const isUser = message.role === "user";
  const isHotline = !isUser && isHotlineResponse(message.content);

  const baseBubble =
    "max-w-[85%] text-sm leading-relaxed rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap break-words";

  const userCls = "bg-esther-blue/10 text-ink rounded-tr-md";
  const assistantCls =
    "bg-warm-bg-deep text-ink rounded-tl-md border border-border/60";
  const hotlineCls =
    "bg-esther-red/5 text-ink border-l-4 border-esther-red rounded-tl-md font-medium";

  const bubbleCls = isUser
    ? `${baseBubble} ${userCls}`
    : isHotline
    ? `${baseBubble} ${hotlineCls}`
    : `${baseBubble} ${assistantCls}`;

  // v3.1 §8.19 §B.2 — 只对 user 消息显示"记成日记"按钮,且字数 ≥ 8(太短没素材价值)
  const showDiaryAction = isUser && !streaming && message.content.trim().length >= 8;

  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} gap-2`}
    >
      <div className={bubbleCls}>
        {message.content}
        {streaming && (
          <span className="inline-block w-1 h-3.5 ml-0.5 -mb-0.5 bg-ink-muted/60 animate-pulse" />
        )}
      </div>
      {showDiaryAction && (
        message.savedToDiary ? (
          <span className="text-[11px] text-esther-blue/80 font-display italic px-2">
            ✓ 已记到日记
          </span>
        ) : (
          <button
            onClick={onSaveToDiary}
            className="text-[11px] text-ink-muted hover:text-esther-blue px-2 py-1 rounded-md hover:bg-esther-yellow/15 transition-colors font-display italic"
            title="把这条记进日记 — 简历整理时 AI 能从这里挖素材"
          >
            📔 记成日记
          </button>
        )
      )}
      {message.actions?.map((a) => (
        <ActionCard
          key={a.route}
          action={a}
          onClick={() => onActionClick?.(a)}
        />
      ))}
    </div>
  );
}

function ActionCard({
  action,
  onClick,
}: {
  action: RouteAction;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full max-w-[85%] text-left rounded-2xl px-4 py-3 bg-warm-bg border-2 border-esther-yellow/70 hover:border-esther-yellow hover:bg-esther-yellow/15 active:scale-[0.98] transition-all flex items-center justify-between gap-3 group shadow-sm"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-lg flex-shrink-0">🧭</span>
        <div className="min-w-0">
          <p className="font-semibold text-ink text-sm leading-tight">
            {action.label}
          </p>
          <p className="text-[11px] text-ink-muted leading-tight mt-0.5">
            不二带你去这里
          </p>
        </div>
      </div>
      <span className="text-esther-blue group-hover:translate-x-0.5 transition-transform text-sm font-medium flex-shrink-0">
        去这里 →
      </span>
    </button>
  );
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="bg-warm-bg-deep border border-border/60 rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-muted/70 animate-bounce" />
        <span
          className="w-1.5 h-1.5 rounded-full bg-ink-muted/70 animate-bounce"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-ink-muted/70 animate-bounce"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  );
}

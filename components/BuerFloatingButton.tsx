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
type Message = { role: Role; content: string; actions?: RouteAction[] };

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

export function BuerFloatingButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
            <button
              onClick={() => setOpen(false)}
              className="text-ink-muted hover:text-ink text-2xl leading-none px-1"
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            style={{ maxHeight: "min(420px, calc(100vh - 16rem))" }}
          >
            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                onActionClick={handleActionClick}
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
}: {
  message: Message;
  streaming?: boolean;
  onActionClick?: (action: RouteAction) => void;
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

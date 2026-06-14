"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { addEntry as addDiaryEntry } from "@/lib/diary";
import { compressImage } from "@/lib/image-compress";

/**
 * 💬 「跟不二聊聊」内嵌对话区 — /diary 温馨小窝 主入口之一
 *
 * 跟右下角 BuerFloatingButton 的区别:
 *   - 不二角色 = 日记引导师(不是情绪疏导员)→ 用 /api/buer/diary-chat endpoint
 *   - chat 仍内存模式(刷新 / onClose 清空)
 *   - "✨ 整理今天" 门槛降为 ≥ 2 条 user(右下角是 3 条)
 *   - 复用 /api/buer/summarize-diary endpoint(§8.20 §C.3 已写,prompt 第一人称生成)
 *
 * Anti-fab 4 层防护完整继承 §8.20
 *
 * plan §8.21 §C.4 lock
 */

type Role = "user" | "assistant";
/** v4 §8.22 — user message 可附图(base64 data URL) */
type Message = { role: Role; content: string; imageBase64?: string };

type SummaryPhase = "idle" | "loading" | "preview" | "saved" | "error";
/** v5 §8.23 — 仪式感日记本格式 */
type DiarySummary = {
  title: string;
  content: string;
  eligible: boolean;
  reason?: string;
  rawDialog: string[];
  highlights?: string[];
  meta?: {
    weather?: string | null;
    mood?: string | null;
    place?: string | null;
  };
};

const WELCOME: Message = {
  role: "assistant",
  content:
    "嗨~ 今天有什么想跟我聊的吗?学校的事 / 心里话 / 小确幸 / 烦恼 都可以,你先说我听着 🌱",
};

/** v5 §8.23 — 今天日期 + 星期(仪式感 modal 顶栏用)*/
function todayDisplayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${y}-${m}-${day} ${wd}`;
}

export function DiaryChatPanel({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  /** 整理保存成日记后回调(父组件 refresh timeline)*/
  onSaved?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // v4 §8.22 — pending image(待发送)
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // v5 §8.23 — 多条短消息队列(LLM 用 <|next|> 分隔,前端逐条延迟显示)
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);
  const [betweenMessages, setBetweenMessages] = useState(false);

  const [summaryPhase, setSummaryPhase] = useState<SummaryPhase>("idle");
  const [summary, setSummary] = useState<DiarySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, loading, betweenMessages]);

  // v5 §8.23 — 多条消息队列逐条延迟渲染
  // pendingQueue 非空 → 显示 typing dots → 600-1200ms 后 pop 第 1 条 add 到 messages
  useEffect(() => {
    if (pendingQueue.length === 0) {
      setBetweenMessages(false);
      return;
    }
    setBetweenMessages(true);
    // 模拟真人打字间隔:600-1200ms typing + 立即 add
    const typingMs = 600 + Math.random() * 600;
    const t = setTimeout(() => {
      const [head, ...rest] = pendingQueue;
      setMessages((prev) => [...prev, { role: "assistant", content: head }]);
      setPendingQueue(rest);
      setBetweenMessages(false);
    }, typingMs);
    return () => clearTimeout(t);
  }, [pendingQueue]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      // 允许:有文字 / 或者只有图(没文字也行)
      if ((!trimmed && !pendingImage) || loading) return;

      const userMsg: Message = {
        role: "user",
        content: trimmed || "(发了一张图)",
        ...(pendingImage ? { imageBase64: pendingImage } : {}),
      };
      const next: Message[] = [...messages, userMsg];
      setMessages(next);
      setInput("");
      setPendingImage(null);
      setLoading(true);
      setStreaming("");

      try {
        // v4 §8.22 — 转 vision content 格式发给后端
        const payloadMessages = next.map((m) => {
          if (m.role === "user" && m.imageBase64) {
            return {
              role: m.role,
              content: [
                { type: "text", text: m.content },
                { type: "image_url", image_url: { url: m.imageBase64 } },
              ],
            };
          }
          return { role: m.role, content: m.content };
        });
        const res = await fetch("/api/buer/diary-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payloadMessages }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          // v5 §8.23 — streaming 预览只显示第 1 段(到首个 <|next|> 为止)。
          // 后续段由 pendingQueue 逐条延迟揭示 —— 避免「先出长句、再闪一下拆成短句」
          setStreaming(acc.split(/<\|next\|>/)[0]);
        }
        const tail = decoder.decode();
        if (tail) acc += tail;

        // v5 §8.23 — 按 <|next|> 切分多条短消息
        const segments = acc
          .split(/<\|next\|>/g)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        setStreaming("");

        if (segments.length === 0) {
          // LLM 返空 — 兜底
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "..." },
          ]);
        } else {
          // 第 1 条立刻显示
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: segments[0] },
          ]);
          // 剩下的 enqueue,useEffect 逐条延迟渲染 + typing dots
          if (segments.length > 1) {
            setPendingQueue(segments.slice(1));
          }
        }
      } catch (err) {
        console.warn("diary chat error:", err);
        setMessages([
          ...next,
          { role: "assistant", content: "网络打了个嗝,要不再说一遍?" },
        ]);
        setStreaming("");
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, pendingImage]
  );

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    sendMessage(input);
  };

  // v4 §8.22 — 选图 → 客户端压缩 → 预览
  const handleImagePick = async (file: File | undefined | null) => {
    if (!file) return;
    setImageError(null);
    setImageBusy(true);
    try {
      const r = await compressImage(file);
      setPendingImage(r.dataUrl);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "图片处理失败");
      setPendingImage(null);
    } finally {
      setImageBusy(false);
    }
  };

  const removePendingImage = () => {
    setPendingImage(null);
    setImageError(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // v3 §8.21 §C.4 — 整理今天对话 → 第一人称日记(复用 §8.20 endpoint)
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
    // v5 §8.23 — 把 highlights / summary_meta 一并存进 entry
    const meta = summary.meta;
    addDiaryEntry({
      title: summary.title,
      content: summary.content,
      source: "ai-summary",
      rawDialog: summary.rawDialog,
      highlights: summary.highlights && summary.highlights.length > 0 ? summary.highlights : undefined,
      summary_meta: meta
        ? {
            weather: (meta.weather as never) || undefined,
            mood: (meta.mood as never) || undefined,
            place: meta.place || undefined,
          }
        : undefined,
    });
    setSummaryPhase("saved");
    if (onSaved) onSaved();
    // 2 秒后自动关闭 panel,回 /diary timeline
    setTimeout(() => {
      setSummaryPhase("idle");
      setSummary(null);
      onClose();
    }, 1800);
  }, [summary, onClose, onSaved]);

  const handleDiscardSummary = useCallback(() => {
    setSummaryPhase("idle");
    setSummary(null);
    setSummaryError(null);
  }, []);

  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const showSummarizeBtn = userMessageCount >= 2 && summaryPhase === "idle";

  return (
    <div className="bg-card border-2 border-esther-yellow/60 rounded-3xl shadow-md overflow-hidden flex flex-col" style={{ minHeight: 480, maxHeight: 640 }}>
      {/* Header */}
      <div className="bg-warm-bg-deep px-5 py-4 border-b border-border flex items-center gap-3 flex-shrink-0">
        <Image
          src="/esther-assets/avatar.jpg"
          alt="不二"
          width={44}
          height={44}
          className="rounded-full ring-2 ring-esther-yellow"
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink leading-tight">不二</p>
          <p className="text-xs text-ink-muted leading-tight mt-0.5 font-display italic">
            日记引导师 · 像朋友一样听你说
          </p>
        </div>
        {showSummarizeBtn && (
          <button
            onClick={handleSummarize}
            className="text-xs text-ink hover:text-white bg-esther-yellow/50 hover:bg-esther-blue transition-colors px-3 py-1.5 rounded-full border border-esther-yellow/70 hover:border-esther-blue font-display italic whitespace-nowrap"
            title="把今天对话整理成第一人称日记"
          >
            ✨ 整理今天
          </button>
        )}
        <button
          onClick={onClose}
          className="text-ink-muted hover:text-ink text-2xl leading-none px-1"
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      {/* Summary overlay */}
      {summaryPhase !== "idle" && (
        <div className="flex-1 overflow-y-auto px-5 py-5 bg-warm-bg/95">
          {summaryPhase === "loading" && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="inline-block animate-spin w-10 h-10 border-4 border-esther-blue border-t-transparent rounded-full mb-4" />
              <p className="text-sm text-ink-soft">
                不二正在整理今天的事...
              </p>
              <p className="text-xs text-ink-muted mt-2 font-display italic">
                通常 5-10 秒
              </p>
            </div>
          )}

          {summaryPhase === "error" && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-3xl mb-3">😣</p>
              <p className="text-sm text-esther-red mb-3">⚠️ {summaryError}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleSummarize}
                  className="text-xs px-3 py-1.5 rounded-full bg-esther-blue text-white hover:bg-esther-blue-dark"
                >
                  重试
                </button>
                <button
                  onClick={handleDiscardSummary}
                  className="text-xs px-3 py-1.5 rounded-full border border-border text-ink-soft hover:text-ink"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {summaryPhase === "saved" && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <p className="text-5xl mb-3">✨</p>
              <p className="text-base text-ink font-medium mb-1">
                已保存到小窝!
              </p>
              <p className="text-xs text-ink-muted font-display italic">
                看下方 timeline
              </p>
            </div>
          )}

          {summaryPhase === "preview" && summary && (
            <div className="space-y-3">
              {summary.eligible ? (
                <>
                  {/* v5 §8.23 — 仪式感日记本格式 */}
                  <div className="p-5 rounded-2xl bg-gradient-to-b from-warm-bg-deep/30 to-warm-bg border-2 border-esther-yellow/40 max-h-96 overflow-y-auto">
                    {/* 顶部 metadata 行 */}
                    <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-esther-blue/20">
                      <p className="text-xs font-display italic text-esther-blue">
                        {todayDisplayDate()}
                      </p>
                      <div className="flex items-center gap-2 text-base">
                        {summary.meta?.weather && (
                          <span title="天气">{summary.meta.weather}</span>
                        )}
                        {summary.meta?.mood && (
                          <span title="心情">{summary.meta.mood}</span>
                        )}
                        {summary.meta?.place && (
                          <span className="text-xs text-ink-muted">
                            📍 {summary.meta.place}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 诗意标题 */}
                    {summary.title && (
                      <h3 className="font-display italic text-2xl font-bold text-ink text-center leading-snug mb-1">
                        {summary.title}
                      </h3>
                    )}
                    <p className="text-center text-xs text-esther-blue/60 mb-4 font-display italic tracking-widest">
                      · · ·
                    </p>

                    {/* highlights 亮点 list */}
                    {summary.highlights && summary.highlights.length > 0 && (
                      <ul className="space-y-1.5 mb-4 pl-2">
                        {summary.highlights.map((h, idx) => (
                          <li
                            key={idx}
                            className="text-sm text-ink leading-relaxed flex items-start gap-2"
                          >
                            <span className="text-esther-yellow mt-1 text-xs flex-shrink-0">
                              ●
                            </span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {summary.highlights && summary.highlights.length > 0 && summary.content && (
                      <p className="text-center text-xs text-esther-blue/60 mb-3 font-display italic tracking-widest">
                        · · ·
                      </p>
                    )}

                    {/* content 自语 */}
                    {summary.content && (
                      <p
                        className="text-sm text-ink-soft leading-loose whitespace-pre-wrap break-words italic"
                        style={{ fontFamily: "var(--font-display, serif)" }}
                      >
                        {summary.content}
                      </p>
                    )}
                  </div>

                  {/* 底部 来源 chip + anti-fab 说明 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-[11px] font-bold bg-esther-blue text-white">
                      💬 不二记录
                    </span>
                    <span className="text-[11px] text-ink-muted font-display italic">
                      基于你 {summary.rawDialog.length} 条对话
                    </span>
                  </div>

                  <p className="text-[11px] text-ink-muted italic leading-relaxed">
                    💡 用你原话重写,没编新信息;保存后 timeline 里可对照
                  </p>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveSummary}
                      className="flex-1 inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2.5 text-sm font-medium hover:bg-esther-blue-dark"
                    >
                      ✓ 保存到小窝
                    </button>
                    <button
                      onClick={handleDiscardSummary}
                      className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-4 py-2.5 text-sm hover:text-ink"
                    >
                      ✗ 不保存
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-3xl mb-3">🌱</p>
                  <p className="text-sm text-ink mb-3 leading-relaxed">
                    {summary.reason ||
                      "今天的对话还没特别要记录的事,要不再多聊点?"}
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

      {/* Chat region */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-5 py-4 space-y-3 ${summaryPhase !== "idle" ? "hidden" : ""}`}
      >
        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} />
        ))}
        {streaming && (
          <ChatBubble message={{ role: "assistant", content: streaming }} streaming />
        )}
        {loading && !streaming && <TypingDots />}
        {/* v5 §8.23 — 多条消息之间的 typing dots(模拟真人连续打字)*/}
        {betweenMessages && <TypingDots />}

        {/* 提示 */}
        {messages.length === 1 && !loading && (
          <p className="text-[11px] text-ink-muted text-center pt-3 font-display italic">
            说几句聊聊今天 · 聊 2 条以上就能整理成日记
          </p>
        )}
      </div>

      {/* Input region */}
      <div className="border-t border-border bg-warm-bg-deep/30 flex-shrink-0">
        {/* v4 §8.22 — pending image 预览(在 input 上方)*/}
        {(pendingImage || imageError) && (
          <div className="px-4 pt-3">
            {pendingImage && (
              <div className="relative inline-block">
                <img
                  src={pendingImage}
                  alt="待发送"
                  className="max-h-24 rounded-lg border border-border"
                />
                <button
                  onClick={removePendingImage}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-ink/70 hover:bg-ink text-white text-xs leading-none flex items-center justify-center"
                  aria-label="撤回图片"
                >
                  ×
                </button>
              </div>
            )}
            {imageError && (
              <p className="text-xs text-esther-red mt-1">⚠️ {imageError}</p>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="px-4 py-3 flex items-end gap-2"
        >
          {/* v4 §8.22 — 图片上传按钮 */}
          <label className="flex-shrink-0 w-10 h-10 rounded-full border border-border bg-card hover:border-esther-blue hover:bg-esther-yellow/10 transition-colors cursor-pointer flex items-center justify-center text-lg"
            title={imageBusy ? "压缩中..." : "发张图给不二看"}>
            {imageBusy ? "⏳" : "🖼️"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={imageBusy || loading || summaryPhase !== "idle"}
              onChange={(e) => {
                handleImagePick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingImage ? "配个文字?(可选,直接发也行)" : "今天怎么样?"}
            rows={1}
            disabled={loading || summaryPhase !== "idle"}
            className="flex-1 resize-none rounded-2xl px-3 py-2 text-sm bg-card border border-border focus:outline-none focus:border-esther-blue text-ink placeholder:text-ink-muted/70 disabled:opacity-60 max-h-32"
            style={{ minHeight: 40, lineHeight: 1.4 }}
          />
          <button
            type="submit"
            disabled={
              loading ||
              (input.trim().length === 0 && !pendingImage) ||
              summaryPhase !== "idle"
            }
            className="flex-shrink-0 rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            发送
          </button>
        </form>
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  streaming = false,
}: {
  message: Message;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const baseBubble =
    "max-w-[80%] text-sm leading-relaxed rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap break-words";
  const userCls = "bg-esther-blue/15 text-ink rounded-tr-md";
  const assistantCls =
    "bg-warm-bg-deep text-ink rounded-tl-md border border-border/60";

  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
      {/* v4 §8.22 — user 附图(在文本气泡上方) */}
      {isUser && message.imageBase64 && (
        <img
          src={message.imageBase64}
          alt="附图"
          className="max-w-[80%] max-h-56 rounded-2xl border border-esther-blue/20"
        />
      )}
      <div className={`${baseBubble} ${isUser ? userCls : assistantCls}`}>
        {message.content}
        {streaming && (
          <span className="inline-block w-1 h-3.5 ml-0.5 -mb-0.5 bg-ink-muted/60 animate-pulse" />
        )}
      </div>
    </div>
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

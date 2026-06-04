"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import {
  submitM1Recommendation,
  type M1Evidence,
} from "@/lib/m1-recommend-submit";

/**
 * 模块 1 - 补充信息 Path B:简单聊聊
 *
 * 轻量自由聊(不是结构化 STAR 挖掘):
 *   - AI 开场 1 句问开放问题
 *   - 用户回 1-2 句
 *   - AI 简短回复 + 顺势问要不要再补(1-3 turn)
 *   - 用户随时点「够了 → 看推荐」收尾
 *   - 收尾调 /api/m1/evidence-chat?mode=finalize 拿 summary + tags + userNotes
 *   - 调 recommend → 跳 /m1/result
 *
 * 边界:不做 STAR / 不预设 5 题问题序列 / 不持久跨设备。
 */

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

const OPENING: ChatMessage = {
  role: "assistant",
  content:
    "想跟我说点啥让推荐更准吗?方向倾向、忌讳、其他想法都可以 — 比如「我想做硬件」「不想 996」「家里希望我考公」。1-2 句就够,不想说就直接点上面「够了 → 看推荐」。",
};

const MAX_USER_TURNS = 3; // 用户最多说 3 turn,够用了

type Mode = "chatting" | "finalizing";

type FinalizeResponse = {
  summary: string;
  tags: string[];
  userNotes: string;
};

export default function M1EvidenceChatPage() {
  const router = useRouter();
  const [hasAnswers, setHasAnswers] = useState<boolean | null>(null);
  const [riasecCode, setRiasecCode] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([OPENING]);
  const [input, setInput] = useState("");
  const [turnLoading, setTurnLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("chatting");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setHasAnswers(Boolean(window.localStorage.getItem("m1_quiz_answers")));
      // 已有 riasec_result 的话,可以提示 LLM 用户的 RIASEC code 做轻量上下文
      const raw = window.localStorage.getItem("riasec_result");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { code?: string };
          if (parsed.code) setRiasecCode(parsed.code);
        } catch {
          // ignore
        }
      }
    } catch {
      setHasAnswers(false);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, turnLoading]);

  const userTurnsUsed = messages.filter((m) => m.role === "user").length;
  const canSend = userTurnsUsed < MAX_USER_TURNS && !turnLoading && mode === "chatting";

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !canSend) return;
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(newMessages);
    setInput("");
    setError(null);
    setTurnLoading(true);
    try {
      const res = await fetch("/api/m1/evidence-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "turn",
          messages: newMessages,
          riasecCode: riasecCode ?? null,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `请求失败: ${res.status}`);
      }
      const data = (await res.json()) as { reply: string };
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.reply },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setTurnLoading(false);
    }
  };

  const handleFinalize = async () => {
    setMode("finalizing");
    setError(null);
    try {
      const res = await fetch("/api/m1/evidence-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "finalize",
          messages,
          riasecCode: riasecCode ?? null,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `finalize 失败: ${res.status}`);
      }
      const fin = (await res.json()) as FinalizeResponse;
      const evidence: M1Evidence = {
        source: "chat",
        summary: fin.summary,
        tags: fin.tags ?? [],
        userNotes: fin.userNotes ?? "",
        createdAt: new Date().toISOString(),
      };
      const sub = await submitM1Recommendation({ evidence });
      if (sub.ok) {
        router.push("/m1/result");
        return;
      }
      if (sub.fellBackToSample) {
        router.push("/m1/result");
        return;
      }
      throw new Error(sub.error);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMode("chatting");
    }
  };

  if (hasAnswers === null) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex items-center justify-center">
          <p className="text-sm text-ink-muted font-display italic">加载中…</p>
        </main>
      </>
    );
  }
  if (!hasAnswers) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg pt-32 px-6">
          <div className="max-w-md mx-auto text-center">
            <p className="text-5xl mb-5">🧭</p>
            <h2 className="text-xl font-bold text-ink mb-3">先做测评</h2>
            <p className="text-sm text-ink-soft mb-6 leading-relaxed">
              测评结果是推荐的主信号,先答完 19 题再回来聊。
            </p>
            <Link
              href="/m1/quiz"
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              去做测评 →
            </Link>
          </div>
        </main>
      </>
    );
  }

  const userHasSaidSomething = userTurnsUsed > 0;

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg flex flex-col" id="top">
        <div className="h-20" />

        {/* 顶部进度 */}
        <section className="border-b border-border bg-card">
          <div className="max-w-[800px] mx-auto px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
            <Link
              href="/m1/evidence"
              className="text-xs text-ink-soft hover:text-esther-blue transition-colors"
            >
              ← 换个方式
            </Link>
            <div className="flex items-center gap-2 text-xs font-display italic">
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-esther-blue/10 text-esther-blue font-medium">
                ✓ 测评
              </span>
              <span className="text-ink-muted">›</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-esther-yellow text-ink font-bold">
                💬 聊聊
              </span>
              <span className="text-ink-muted">›</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-warm-bg-deep text-ink-muted">
                推荐
              </span>
            </div>
            <button
              onClick={handleFinalize}
              disabled={mode === "finalizing" || !userHasSaidSomething}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-1.5 text-xs font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                userHasSaidSomething
                  ? "把你说的喂给推荐 LLM"
                  : "至少说一句再收尾"
              }
            >
              {mode === "finalizing" ? "分析中…" : "够了 → 看推荐"}
            </button>
          </div>
        </section>

        {/* chat 主区 */}
        <div className="flex-1 flex flex-col max-w-[800px] mx-auto w-full px-6 py-6">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-[400px]"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <Card
                  className={`max-w-[85%] p-4 ${
                    m.role === "user"
                      ? "bg-esther-blue text-white border-esther-blue"
                      : "bg-card border-border"
                  }`}
                >
                  <p
                    className={`text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user" ? "text-white" : "text-ink"
                    }`}
                  >
                    {m.content}
                  </p>
                </Card>
              </div>
            ))}
            {turnLoading && (
              <div className="flex justify-start">
                <Card className="bg-card border-border p-4 max-w-[60%]">
                  <p className="text-sm text-ink-muted font-display italic">
                    不二在想…
                  </p>
                </Card>
              </div>
            )}
            {mode === "finalizing" && (
              <div className="flex justify-center pt-4">
                <p className="text-xs text-ink-muted font-display italic animate-pulse">
                  正在结合简历 + 测评 + 你说的话挑方向…
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-3 p-3 rounded-xl bg-esther-red/5 border border-esther-red/30 text-sm text-esther-red">
              ⚠️ {error}
            </div>
          )}

          {/* 输入区 */}
          {mode === "chatting" && (
            <>
              {userTurnsUsed >= MAX_USER_TURNS ? (
                <Card className="p-4 border-2 border-esther-yellow bg-esther-yellow/10 text-sm text-ink leading-relaxed">
                  已经聊 {MAX_USER_TURNS} 轮 — 够用了。点上方「够了 →
                  看推荐」让我们去挑方向。
                </Card>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        (e.metaKey || e.ctrlKey)
                      ) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={3}
                    placeholder="说说你的方向倾向、忌讳、想法… (Cmd/Ctrl + Enter 发送)"
                    className="flex-1 p-3 rounded-xl border-2 border-border bg-card text-sm text-ink leading-relaxed focus:border-esther-blue focus:outline-none resize-none"
                    disabled={!canSend}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!canSend || input.trim().length === 0}
                    className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-3 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    发送
                  </button>
                </div>
              )}
              <p className="text-[11px] text-ink-muted mt-2 font-display italic text-right">
                还能说 {Math.max(0, MAX_USER_TURNS - userTurnsUsed)} 轮 · 随时可点上方「够了」收尾
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}

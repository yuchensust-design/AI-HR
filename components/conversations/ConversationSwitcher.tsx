/**
 * 左侧会话栏 — plan §8.24 §E.2(ChatGPT 风格)
 *
 * 用法:在 m2/m3/m4/m5 模块 layout 顶部
 *   <ConversationSwitcher module="m3" basePath="/m3" defaultTitle="简历" />
 *
 * 数据隔离:每个 conversation 的业务数据独立(DB 表按 conversation_id 关联 + RLS 防越权)
 * URL 协议:?c={conversationId} 决定当前会话
 *
 * 游客 → 显示"登录可保存多份"提示,sidebar 简化
 * 登录 → 完整列表 + 新建 + 改名 + 删除
 */
"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/lib/auth/useUser";
import {
  type Conversation,
  type ConversationModule,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
} from "@/lib/conversations";

type Props = {
  module: ConversationModule;
  basePath: string;
  defaultTitle?: string;
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return `${Math.floor(day / 30)}mo`;
}

export default function ConversationSwitcher({
  module,
  basePath,
  defaultTitle = "新会话",
}: Props) {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const sp = useSearchParams();
  const currentId = sp.get("c");

  const [list, setList] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    listConversations(module).then((data) => {
      setList(data);
      setLoading(false);
    });
  }, [user, userLoading, module]);

  useEffect(() => {
    if (!menuOpenId && !renameId && !confirmDeleteId) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpenId(null);
        setRenameId(null);
        setConfirmDeleteId(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpenId, renameId, confirmDeleteId]);

  async function onNew() {
    const id = await createConversation(module, `${defaultTitle} ${list.length + 1}`);
    if (id) {
      setList(await listConversations(module));
      router.push(`${basePath}?c=${id}`);
      router.refresh();
    }
  }

  async function onRename(id: string) {
    if (!renameText.trim()) return;
    const ok = await renameConversation(id, renameText.trim());
    if (ok) {
      setList((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: renameText.trim() } : c)),
      );
      setRenameId(null);
    }
  }

  async function onDelete(id: string) {
    const ok = await deleteConversation(id);
    if (ok) {
      setList((prev) => prev.filter((c) => c.id !== id));
      setConfirmDeleteId(null);
      if (id === currentId) router.push(basePath);
    }
  }

  // ===== 游客视图(简化) =====
  if (!userLoading && !user) {
    return (
      <aside className="w-60 flex-shrink-0 sticky top-20 self-start h-[calc(100vh-80px)] overflow-y-auto border-r border-black/10 bg-white/40 backdrop-blur-sm">
        <div className="p-4">
          <p className="text-xs text-ink-muted mb-1">游客模式</p>
          <p className="text-sm text-ink mb-4 leading-relaxed">
            数据存浏览器本地,
            <br />
            不支持多会话
          </p>
          <Link
            href="/login"
            className="block w-full text-center px-3 py-2 rounded-xl bg-esther-blue text-white text-sm hover:bg-esther-blue-dark transition"
          >
            登录解锁多会话 →
          </Link>
          <p className="text-xs text-ink-muted mt-3 leading-relaxed">
            登录后数据加密存云,
            <br />
            可同时进行多份
          </p>
        </div>
      </aside>
    );
  }

  // ===== 登录视图(完整列表) =====
  return (
    <aside
      ref={ref}
      className="w-60 flex-shrink-0 sticky top-20 self-start h-[calc(100vh-80px)] overflow-y-auto border-r border-black/10 bg-white/40 backdrop-blur-sm"
    >
      <div className="p-3">
        <button
          onClick={onNew}
          data-m3-create-conversation
          className="w-full mb-3 px-3 py-2 rounded-xl bg-esther-blue text-white text-sm hover:bg-esther-blue-dark transition flex items-center justify-center gap-1"
        >
          <span className="text-base">+</span>
          <span>新建会话</span>
        </button>

        {loading && (
          <div className="space-y-2">
            <div className="h-12 bg-black/5 rounded-xl animate-pulse" />
            <div className="h-12 bg-black/5 rounded-xl animate-pulse" />
          </div>
        )}

        {!loading && list.length === 0 && (
          <p className="text-xs text-ink-muted text-center py-6 leading-relaxed">
            还没有会话
            <br />
            点上面新建第一个
          </p>
        )}

        {!loading && list.length > 0 && (
          <ul className="space-y-1">
            {list.map((c) => (
              <li
                key={c.id}
                className={`group relative rounded-xl transition ${
                  c.id === currentId
                    ? "bg-esther-yellow/30"
                    : "hover:bg-warm-bg-deep"
                }`}
              >
                {confirmDeleteId === c.id ? (
                  <div className="flex items-center gap-1.5 px-3 py-2">
                    <span className="text-xs text-esther-red flex-1 truncate">删除「{c.title}」?</span>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs px-2 py-0.5 rounded-lg border border-black/15 text-ink-muted hover:bg-warm-bg-deep transition"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => onDelete(c.id)}
                      className="text-xs px-2 py-0.5 rounded-lg bg-esther-red text-white hover:opacity-80 transition"
                    >
                      确认
                    </button>
                  </div>
                ) : renameId === c.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => onRename(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onRename(c.id);
                      if (e.key === "Escape") setRenameId(null);
                    }}
                    className="w-full text-sm px-3 py-2 rounded-xl border border-esther-blue focus:outline-none"
                  />
                ) : (
                  <>
                    <Link
                      href={`${basePath}?c=${c.id}`}
                      className="block px-3 py-2 pr-7 min-w-0"
                    >
                      <p className="text-sm text-ink truncate">{c.title}</p>
                      <p className="text-xs text-ink-muted">
                        {timeAgo(c.updated_at)}
                      </p>
                    </Link>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setMenuOpenId(menuOpenId === c.id ? null : c.id);
                      }}
                      className="absolute top-1/2 -translate-y-1/2 right-1 opacity-0 group-hover:opacity-100 text-ink-muted hover:text-ink px-1.5 py-1 rounded transition"
                    >
                      ⋯
                    </button>
                    {menuOpenId === c.id && (
                      <div className="absolute top-full right-0 mt-1 w-32 rounded-xl bg-white border border-black/10 shadow-lg py-1 z-50">
                        <button
                          onClick={() => {
                            setRenameId(c.id);
                            setRenameText(c.title);
                            setMenuOpenId(null);
                          }}
                          className="block w-full text-left px-3 py-1.5 text-sm text-ink hover:bg-warm-bg-deep transition"
                        >
                          ✎ 改名
                        </button>
                        <button
                          onClick={() => {
                            setConfirmDeleteId(c.id);
                            setMenuOpenId(null);
                          }}
                          className="block w-full text-left px-3 py-1.5 text-sm text-esther-red hover:bg-warm-bg-deep transition"
                        >
                          ✕ 删除
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/**
 * 多会话 CRUD — plan §8.24 §C.2
 *
 * conversations 表是 m2/m3/m4/m5 共用的多会话主表(类 ChatGPT 多对话)
 * 业务子表(m2_intakes / m3_resumes / m4_projects / m5_interviews)按 conversation_id 1:1 关联
 *
 * 仅登录用户使用。游客在 page 层用单 localStorage 卡片伪装"单会话"
 */
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationModule = "m2" | "m3" | "m4" | "m5";

export type Conversation = {
  id: string;
  user_id: string;
  module: ConversationModule;
  title: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

const MODULE_TABLES: Record<ConversationModule, string> = {
  m2: "m2_intakes",
  m3: "m3_resumes",
  m4: "m4_projects",
  m5: "m5_interviews",
};

function client(c?: SupabaseClient) {
  return c ?? createClient();
}

/** 列出某模块下用户所有会话(按 updated_at desc),不含 archived */
export async function listConversations(
  module: ConversationModule,
  c?: SupabaseClient,
): Promise<Conversation[]> {
  const supabase = client(c);
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("module", module)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[conversations] list failed:", error);
    return [];
  }
  return (data as Conversation[]) ?? [];
}

/** 新建一个空 conversation + 业务子表空行,返回 id */
export async function createConversation(
  module: ConversationModule,
  title: string,
  c?: SupabaseClient,
): Promise<string | null> {
  const supabase = client(c);
  // RLS 要求 user_id = auth.uid(),我们 insert 时手动填(supabase-js 不会自动填)
  // 用 getSession()(读本地 JWT,无网络往返)而非 getUser()(每次都打服务器验证,首次点击慢的主因);
  // user_id 真伪由服务端 RLS 兜底,本地读取够用
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("conversations")
    .insert({ module, title, user_id: uid })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[conversations] create failed:", error);
    return null;
  }

  // 同时 insert 空的业务子表 row(便于后续 update,不用 upsert)
  const businessTable = MODULE_TABLES[module];
  await supabase.from(businessTable).insert({ conversation_id: data.id });

  return data.id as string;
}

// 自动建会话去重 —— 同一 module 的"找或建"并发/重入只跑一次,共享同一个 Promise。
// 防:① React StrictMode(dev)effect 双触发 ② 网络慢时多次渲染各建一条 → 建出重复会话。
const autoCreateInFlight: Partial<Record<ConversationModule, Promise<string | null>>> = {};

/**
 * 找到该 module 最近的会话;没有就新建一条。并发调用共享同一 Promise(只建一条)。
 * 用于 m2 的"进页面自动落到一个会话"场景。
 */
export async function getOrCreateConversation(
  module: ConversationModule,
  defaultTitle: string,
  c?: SupabaseClient,
): Promise<string | null> {
  const inflight = autoCreateInFlight[module];
  if (inflight) return inflight;
  const p = (async () => {
    const existing = await listConversations(module, c);
    if (existing.length > 0) return existing[0].id;
    return await createConversation(module, defaultTitle, c);
  })();
  autoCreateInFlight[module] = p;
  void p.finally(() => {
    if (autoCreateInFlight[module] === p) delete autoCreateInFlight[module];
  });
  return p;
}

/** 改名 */
export async function renameConversation(
  id: string,
  title: string,
  c?: SupabaseClient,
): Promise<boolean> {
  const supabase = client(c);
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", id);
  if (error) console.error("[conversations] rename failed:", error);
  return !error;
}

/** 删除(cascade 删业务子表) */
export async function deleteConversation(
  id: string,
  c?: SupabaseClient,
): Promise<boolean> {
  const supabase = client(c);
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) console.error("[conversations] delete failed:", error);
  return !error;
}

/** 归档(软删,UI 不显示但数据保留)*/
export async function archiveConversation(
  id: string,
  c?: SupabaseClient,
): Promise<boolean> {
  const supabase = client(c);
  const { error } = await supabase
    .from("conversations")
    .update({ is_archived: true })
    .eq("id", id);
  return !error;
}

/** 取单个 conversation(带业务子表 join 在 page 层各自处理)*/
export async function getConversation(
  id: string,
  c?: SupabaseClient,
): Promise<Conversation | null> {
  const supabase = client(c);
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    console.error("[conversations] get failed:", error);
    return null;
  }
  return data as Conversation;
}

/** 触发 updated_at 刷新(用户活跃时调,但只 m3/m5 等业务 update 时已经自动触发,通常不用手动调)*/
export async function touchConversation(
  id: string,
  c?: SupabaseClient,
): Promise<void> {
  const supabase = client(c);
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);
}

-- 004_m5_llm_traces.sql
-- 模块 5 v5-O1：LLM 调用可观测性 trace 表
-- 用途：线上复盘每场面试用了哪个方法论/什么输入/多少 token/多慢/有无报错 + 评分 eval 校准底座。
-- 写入方：各 m5 路由经 service_role(createAdminClient) fire-and-forget 插入，绕过 RLS。
-- 读取方：内部 admin（service_role）。不开放给 anon/authenticated。
-- 幂等：IF NOT EXISTS，安全重跑。
--
-- ⚠️ 本文件仅为 migration，未对线上库执行。上线前由人工在 Supabase 执行。
-- trace 代码 fire-and-forget：即使本表尚未创建，m5 主流程也不受影响（写失败仅 warn）。

CREATE TABLE IF NOT EXISTS m5_llm_traces (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        text,                         -- m5 session id（可空，游客也记）
  route             text NOT NULL,                -- prep | follow-up | capability | debrief
  methodology_id    text,                         -- bq | backend | generic-tech（"" → null）
  model             text NOT NULL,                -- chat | reasoner
  input_snapshot    text,                         -- 截断(≤2000) + 公司名 scrub
  output_snapshot   text,                         -- 截断(≤2000) + scrub
  prompt_tokens     integer DEFAULT 0,            -- 实测或估算
  completion_tokens integer DEFAULT 0,
  latency_ms        integer DEFAULT 0,
  ok                boolean NOT NULL DEFAULT true,
  err_msg           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_m5_traces_created_at ON m5_llm_traces (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_m5_traces_session    ON m5_llm_traces (session_id);
CREATE INDEX IF NOT EXISTS idx_m5_traces_route      ON m5_llm_traces (route);

-- 开启 RLS 且不加任何 policy → anon/authenticated 默认无权限；service_role 绕过 RLS 正常读写。
ALTER TABLE m5_llm_traces ENABLE ROW LEVEL SECURITY;

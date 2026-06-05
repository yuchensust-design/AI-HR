-- Offer Catcher v1.5 — 登录 + 多会话隔离 schema
-- plan §8.24 §C
-- 使用方法:在 Supabase Dashboard → SQL Editor 里整段粘贴,Run 一次

-- ============================================================================
-- 扩展
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. profiles — 扩展 auth.users
-- ============================================================================
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  persona_tag text,  -- Landing 场景自选 6 选 1(沿用现有 user_profile)
  created_at timestamptz default now()
);

-- ============================================================================
-- 2. conversations — m2/m3/m4/m5 共用的多会话主表
-- ============================================================================
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module in ('m2','m3','m4','m5')),
  title text not null,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists conversations_user_module_idx
  on conversations(user_id, module, updated_at desc);

-- ============================================================================
-- 3. 模块业务表(每个 conversation 1 row)
-- ============================================================================

create table if not exists m2_intakes (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  intake_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists m3_resumes (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  parsed_resume_json jsonb,
  jd_context_json jsonb,
  hidden_experience_json jsonb,
  final_resume_md text,
  final_resume_docx_url text,
  updated_at timestamptz default now()
);

create table if not exists m4_projects (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  brief_md text,
  learning_cards_json jsonb,
  status text default 'proposed' check (status in ('proposed','in-progress','shipped')),
  updated_at timestamptz default now()
);

create table if not exists m5_interviews (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  config_json jsonb not null default '{}'::jsonb,
  turns_json jsonb,
  debrief_md text,
  rubric_scores_json jsonb,
  updated_at timestamptz default now()
);

-- ============================================================================
-- 4. 单条数据表(无多会话)
-- ============================================================================

create table if not exists m1_assessments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  riasec_json jsonb not null,
  recommendation_json jsonb,
  completed_at timestamptz default now()
);

create table if not exists diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  title text,
  source text,
  raw_dialog_json jsonb,
  metadata_json jsonb,
  summary_meta_json jsonb,
  highlights_json jsonb,
  image_url text,
  created_at timestamptz default now()
);
create index if not exists diary_user_created_idx
  on diary_entries(user_id, created_at desc);

create table if not exists tracker_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  applied_at timestamptz,
  status_updated_at timestamptz,
  data_json jsonb not null,
  created_at timestamptz default now()
);
create index if not exists tracker_user_applied_idx
  on tracker_applications(user_id, applied_at desc);

-- ============================================================================
-- 5. updated_at 自动触发器
-- ============================================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger conversations_updated_at before update on conversations
  for each row execute function set_updated_at();
create trigger m2_intakes_updated_at before update on m2_intakes
  for each row execute function set_updated_at();
create trigger m3_resumes_updated_at before update on m3_resumes
  for each row execute function set_updated_at();
create trigger m4_projects_updated_at before update on m4_projects
  for each row execute function set_updated_at();
create trigger m5_interviews_updated_at before update on m5_interviews
  for each row execute function set_updated_at();

-- ============================================================================
-- 6. RLS — 强制 user 隔离(关键安全)
-- ============================================================================

alter table profiles enable row level security;
create policy "own profile select" on profiles for select using (auth.uid() = user_id);
create policy "own profile insert" on profiles for insert with check (auth.uid() = user_id);
create policy "own profile update" on profiles for update using (auth.uid() = user_id);
create policy "own profile delete" on profiles for delete using (auth.uid() = user_id);

alter table conversations enable row level security;
create policy "own conv" on conversations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table m2_intakes enable row level security;
create policy "own m2 via conv" on m2_intakes for all using (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
);

alter table m3_resumes enable row level security;
create policy "own m3 via conv" on m3_resumes for all using (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
);

alter table m4_projects enable row level security;
create policy "own m4 via conv" on m4_projects for all using (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
);

alter table m5_interviews enable row level security;
create policy "own m5 via conv" on m5_interviews for all using (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
);

alter table m1_assessments enable row level security;
create policy "own m1" on m1_assessments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table diary_entries enable row level security;
create policy "own diary" on diary_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table tracker_applications enable row level security;
create policy "own tracker" on tracker_applications for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

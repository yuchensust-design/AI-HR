-- M1→M4 flow: target_role_json — 记录用户从 M1 result 页点击的目标岗位
ALTER TABLE m1_assessments
  ADD COLUMN IF NOT EXISTS target_role_json jsonb;

-- COMMENT: 字段结构 { role_type, industry, employability_level, saved_at }

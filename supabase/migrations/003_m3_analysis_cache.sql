-- 003_m3_analysis_cache.sql
-- 模块 3 分析产物落库(m3-db-persistence + 关键词语义命中缓存)
-- 全部 IF NOT EXISTS,幂等 —— 前 4 列若已手动加过,这里是 no-op,安全重跑。
-- RLS 由 001 的 "own m3 via conv"(for all)覆盖,新列自动继承。

ALTER TABLE m3_resumes
  ADD COLUMN IF NOT EXISTS edits_json          jsonb,  -- { sig, result: SuggestEditsResult }
  ADD COLUMN IF NOT EXISTS decisions_json      jsonb,  -- { decisions, rewritten, srAnswers, keywordResponses }
  ADD COLUMN IF NOT EXISTS metrics_json        jsonb,  -- { sig, metrics: LlmMetrics }
  ADD COLUMN IF NOT EXISTS interview_prep_json jsonb,  -- { sig, prep: PrepCategory[] }
  ADD COLUMN IF NOT EXISTS keyword_match_json  jsonb;  -- { sig, results: [{keyword, hit, evidence}] }

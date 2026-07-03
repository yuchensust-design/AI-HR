/**
 * 挖经历 → 改简历素材池转换器(飞轮:挖经历→改简历)。
 *
 * 挖经历产出 CandidateBullet(STAR {s,t,a,r} + competency + anti_fab_note),
 * 与改简历素材池 HiddenExperience({situation,task,action,result})结构兼容,这里做映射。
 * 调用方先把 text 用 assembleBullet 拼好(把【请补充】换成用户填的真实数字)再传进来。
 * question_id 用 m2-${稳定key} 前缀,跨来源(面试 m5- / 补项目 m4-)去重。纯函数 → 可单测。
 */
import type { HiddenExperience } from "@/lib/sync/hidden-experience";

export type M2BulletLike = {
  id?: string;
  source_story_id?: string;
  text: string;
  star_breakdown?: { s?: string; t?: string; a?: string; r?: string };
  competency?: string;
  anti_fab_note?: string;
};

/** 文本兜底 key:无 id 时用规整后的 text 前缀,保证同一条 bullet 重复导入稳定去重。 */
function stableKey(b: M2BulletLike): string {
  if (b.id) return b.id;
  if (b.source_story_id) return b.source_story_id;
  return (b.text ?? "").replace(/\s+/g, "").slice(0, 24) || "empty";
}

export function bulletToHiddenExperience(b: M2BulletLike): HiddenExperience {
  const star = b.star_breakdown;
  const hasStar = !!(star && (star.s || star.t || star.a || star.r));
  // 关键:b.text 是调用方已 assembleBullet 拼好的成稿(把【请补充】换成了用户填的真实数字)。
  // hasStar 时若只用原始 STAR 当 raw_user_material,会丢掉用户刚填的数字(STAR.r 仍是占位符)。
  // → 始终把成稿文本并进 raw_user_material,保证用户填的数字进入 suggest-edits 的主素材与反编造语料。
  const filledBulletText = (b.text ?? "").trim();
  return {
    question_id: `m2-${stableKey(b)}`,
    material_kind: "experience",
    topic_name: `挖经历 · ${b.competency ?? "经历亮点"}`,
    raw_user_material: hasStar
      ? [
          star!.s && `情境:${star!.s}`,
          star!.t && `任务:${star!.t}`,
          star!.a && `行动:${star!.a}`,
          star!.r && `结果:${star!.r}`,
          filledBulletText && `成稿(以此处数字为准):${filledBulletText}`,
        ]
          .filter(Boolean)
          .join("\n")
      : filledBulletText,
    star_breakdown: hasStar
      ? {
          situation: star!.s,
          task: star!.t,
          action: star!.a,
          result: star!.r,
        }
      : null,
    candidate_bullets: [
      {
        text: b.text,
        anti_fab_note:
          b.anti_fab_note ?? "来自挖经历,STAR 由你口述整理,数字以你所述为准,不得脑补",
      },
    ],
  };
}

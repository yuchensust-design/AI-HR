/**
 * ParsedResume → 可读文本(给 m5 出题等需要"简历正文字符串"的地方用)
 *
 * 为什么需要它:m5 出题 route 收的是 resume_text 字符串,直接把 parsed_resume_json
 * 原始 JSON 喂进去,模型会读到 `{"basic":{...}}` 这种结构噪声、甚至脑补出错误字段
 * (实测见过把 "机械/拧螺丝" 脑补成 "你用过 CAD")。这里把结构化简历摊平成
 * 人能读、模型也好读的纯文本。
 *
 * 与 m4 的 summarizeResume(500 字 brief、只取 top3)不同:这里**尽量完整**
 * (全部经历/项目/bullet + 教育 + 技能 + 自评),给出题足够素材,末尾再统一截断。
 */

type Bullet = { text?: unknown } | string;
type Exp = { org?: unknown; role?: unknown; period?: unknown; bullets?: unknown };
type Proj = { name?: unknown; role?: unknown; period?: unknown; tech_stack?: unknown; bullets?: unknown };
type Edu = { school?: unknown; major?: unknown; degree?: unknown; period?: unknown };

const s = (v: unknown): string => (v == null ? "" : String(v).trim());

function bulletText(b: Bullet): string {
  if (typeof b === "string") return b.trim();
  return s((b as { text?: unknown })?.text);
}

function bulletsOf(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((b) => bulletText(b as Bullet)).filter(Boolean);
}

/** 把 parsed_resume_json 摊平成简历正文文本。空/无效 → 空串。 */
export function formatParsedResumeToText(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  const pr = parsed as Record<string, unknown>;
  const lines: string[] = [];

  const basic = (pr.basic ?? {}) as Record<string, unknown>;
  const name = s(basic.name);
  const headerBits = [
    s(basic.major) && `专业:${s(basic.major)}`,
    s(basic.school) && `学校:${s(basic.school)}`,
    s(basic.year_level) && `年级:${s(basic.year_level)}`,
  ].filter(Boolean);
  if (name) lines.push(`姓名:${name}`);
  if (headerBits.length) lines.push(headerBits.join(" · "));

  const education = Array.isArray(pr.education) ? (pr.education as Edu[]) : [];
  if (education.length) {
    lines.push("\n教育:");
    education.forEach((e) => {
      const bits = [s(e.school), s(e.major), s(e.degree), s(e.period)].filter(Boolean);
      if (bits.length) lines.push(`- ${bits.join(" / ")}`);
    });
  }

  const experience = Array.isArray(pr.experience) ? (pr.experience as Exp[]) : [];
  if (experience.length) {
    lines.push("\n经历:");
    experience.forEach((e) => {
      const head = [s(e.org), s(e.role), s(e.period)].filter(Boolean).join(" / ");
      if (head) lines.push(`【${head}】`);
      bulletsOf(e.bullets).forEach((b) => lines.push(`- ${b}`));
    });
  }

  const projects = Array.isArray(pr.projects) ? (pr.projects as Proj[]) : [];
  if (projects.length) {
    lines.push("\n项目:");
    projects.forEach((p) => {
      const head = [s(p.name), s(p.role), s(p.period)].filter(Boolean).join(" / ");
      const tech = Array.isArray(p.tech_stack) ? p.tech_stack.map(s).filter(Boolean).join(", ") : s(p.tech_stack);
      if (head) lines.push(`【${head}】${tech ? ` · 技术:${tech}` : ""}`);
      bulletsOf(p.bullets).forEach((b) => lines.push(`- ${b}`));
    });
  }

  const skills = (pr.skills ?? {}) as Record<string, unknown>;
  const allSkills = Object.values(skills)
    .flatMap((v) => (Array.isArray(v) ? v.map(s) : []))
    .filter(Boolean);
  if (allSkills.length) lines.push(`\n技能:${allSkills.join(", ")}`);

  // self_eval 可能是 string[] 或 {text}[](不同解析版本)——用 bulletText 兼容,
  // 否则对象项会被 String() 成 "[object Object]" 喂进出题/简历正文。
  const selfEval = Array.isArray(pr.self_eval)
    ? (pr.self_eval as Bullet[]).map(bulletText).filter(Boolean)
    : [];
  if (selfEval.length) lines.push(`\n自我评价:${selfEval.join(" ")}`);

  return lines.join("\n").trim();
}

/**
 * 选一份"简历正文字符串":优先用 final markdown(已经是人写的成稿),
 * 否则把 parsed 摊平成文本。两者都没有 → 空串。
 */
export function resumeTextFrom(
  finalMarkdown: string | null | undefined,
  parsed: unknown,
): string {
  const md = (finalMarkdown ?? "").trim();
  if (md.length > 20) return md;
  return formatParsedResumeToText(parsed);
}

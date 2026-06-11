import { describe, it, expect } from "vitest";
import {
  normalizeSuggestedText,
  buildSourceCorpus,
  PLACEHOLDER,
} from "./m3-normalize";

// corpus 里只有一个年份 2024,没有任何业绩数字
const corpusWithYearOnly = "在校经历 2024 年加入产品社团,做过用户访谈";

describe("m3-normalize 数字溯源(反编造)", () => {
  it("中文数字编造会被替换为占位符(旧 bug:整段逃逸)", () => {
    const [out, report] = normalizeSuggestedText(
      "访谈了二十名用户",
      corpusWithYearOnly,
    );
    expect(out).toContain(PLACEHOLDER);
    expect(out).not.toContain("二十名");
    expect(report.replacedTokens.length).toBeGreaterThan(0);
  });

  it('"带领十人团队"中文量级编造会被替换', () => {
    const [out] = normalizeSuggestedText("带领十人团队", corpusWithYearOnly);
    expect(out).toContain(PLACEHOLDER);
  });

  it("年份 2024 不会让 20% 借位放行(旧 bug:子串命中)", () => {
    const [out, report] = normalizeSuggestedText(
      "转化率提升20%",
      corpusWithYearOnly,
    );
    expect(out).toContain(PLACEHOLDER);
    expect(report.resolvedClaimType).toBe("needs_confirmation");
  });

  it('"1万人"放大器编造会被替换(旧 bug:单位数豁免)', () => {
    const [out] = normalizeSuggestedText("覆盖1万人", corpusWithYearOnly);
    expect(out).toContain(PLACEHOLDER);
  });

  it("有出处的中文数字保留", () => {
    const corpus = "我在社团访谈了二十名同学,整理成报告";
    const [out, report] = normalizeSuggestedText("访谈二十名同学", corpus);
    expect(out).toBe("访谈二十名同学");
    expect(report.modified).toBe(false);
  });

  it("有出处的阿拉伯数字保留(精确 token)", () => {
    const corpus = "运营公众号,单篇阅读 30 次";
    const [out] = normalizeSuggestedText("单篇阅读30次", corpus);
    expect(out).toContain("30");
  });

  it("单个小数字豁免(中英文一致),不强制溯源", () => {
    const [outCn] = normalizeSuggestedText("负责三人小组", "");
    const [outEn] = normalizeSuggestedText("参与3个项目", "");
    expect(outCn).toBe("负责三人小组");
    expect(outEn).toBe("参与3个项目");
  });

  it('"十分感谢"等非计量短语不被误伤', () => {
    const [out, report] = normalizeSuggestedText("十分感谢导师的指导", "");
    expect(out).toBe("十分感谢导师的指导");
    expect(report.modified).toBe(false);
  });
});

describe("buildSourceCorpus 不含 JD(P2-9)", () => {
  it("JD 里的数字不进 corpus,不能给简历数字背书", () => {
    const corpus = buildSourceCorpus({
      parsedResume: { summary: "产品社团成员" },
      // jdContext 已不再是入参;即便外部塞了 JD 文本也不该被采纳
    });
    expect(corpus).not.toContain("200");
    const [out] = normalizeSuggestedText("负责200万DAU产品", corpus);
    expect(out).toContain(PLACEHOLDER);
  });
});

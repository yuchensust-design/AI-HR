import { describe, it, expect } from "vitest";
import {
  computeFollowUpBudget,
  hasNumericEvidence,
  shouldSkipFollowUpClientGate,
  shouldRequestFollowUp,
} from "./follow-up";

describe("computeFollowUpBudget", () => {
  it("5→3 / 10→6 / 15→9", () => {
    expect(computeFollowUpBudget(5)).toBe(3);
    expect(computeFollowUpBudget(10)).toBe(6);
    expect(computeFollowUpBudget(15)).toBe(9);
  });
  it("非法输入 → 0", () => {
    expect(computeFollowUpBudget(0)).toBe(0);
    expect(computeFollowUpBudget(NaN)).toBe(0);
  });
});

describe("hasNumericEvidence", () => {
  it("含数字/百分比/倍/万 → true", () => {
    expect(hasNumericEvidence("提升了 30%")).toBe(true);
    expect(hasNumericEvidence("快了三倍")).toBe(true);
    expect(hasNumericEvidence("覆盖十万用户")).toBe(true);
  });
  it("纯定性 → false", () => {
    expect(hasNumericEvidence("效果挺好的，提升很多")).toBe(false);
  });
});

describe("shouldSkipFollowUpClientGate", () => {
  const longGood =
    "我负责重构了订单服务的缓存层，把缓存命中率从 60% 提到 92%，QPS 峰值扛住了 8000，" +
    "做法是引入多级缓存加布隆过滤器防穿透，并对热点 key 做逻辑过期防击穿，" +
    "同时给过期时间加随机抖动防雪崩，灰度上线两周后线上零超卖，平均响应从 120ms 降到 35ms。";
  it("明显答得好（口水话少+够长+含数字）→ 跳过", () => {
    expect(
      shouldSkipFollowUpClientGate({ transcript: longGood, filler_count: 2 }),
    ).toBe(true);
  });
  it("流利但空洞（够长但无数字）→ 不跳过（防误判）", () => {
    const fluffy =
      "我觉得这个项目整体做得挺好的，团队配合也很默契，大家都很努力，" +
      "我学到了很多东西，对我帮助很大，以后也会继续努力做得更好更优秀。";
    expect(
      shouldSkipFollowUpClientGate({ transcript: fluffy, filler_count: 1 }),
    ).toBe(false);
  });
  it("口水话多 → 不跳过", () => {
    expect(
      shouldSkipFollowUpClientGate({ transcript: longGood, filler_count: 20 }),
    ).toBe(false);
  });
  it("跳过题 → true（不追问）", () => {
    expect(
      shouldSkipFollowUpClientGate({ transcript: "", skipped: true }),
    ).toBe(true);
  });
});

describe("shouldRequestFollowUp", () => {
  const vague = { transcript: "效果挺好的", filler_count: 3 };
  it("预算耗尽 → false", () => {
    expect(
      shouldRequestFollowUp({
        followUpsUsed: 6,
        budget: 6,
        parentIsFollowUp: false,
        gateInput: vague,
      }),
    ).toBe(false);
  });
  it("母题本身是追问 → false（不追问追问）", () => {
    expect(
      shouldRequestFollowUp({
        followUpsUsed: 0,
        budget: 6,
        parentIsFollowUp: true,
        gateInput: vague,
      }),
    ).toBe(false);
  });
  it("含糊回答 + 预算够 → true", () => {
    expect(
      shouldRequestFollowUp({
        followUpsUsed: 1,
        budget: 6,
        parentIsFollowUp: false,
        gateInput: vague,
      }),
    ).toBe(true);
  });
});

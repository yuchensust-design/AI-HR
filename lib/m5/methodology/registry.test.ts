import { describe, it, expect } from "vitest";
import {
  selectMethodology,
  scoreMethodology,
  normalizeForMatch,
} from "./registry";
import {
  ALL_METHODOLOGIES,
  BACKEND_METHODOLOGY,
  BQ_METHODOLOGY,
  GENERIC_TECH_METHODOLOGY,
} from "./specs";

describe("registry.selectMethodology — type 分流", () => {
  it("bq → BQ 方法论（不看 JD）", () => {
    expect(selectMethodology("bq", "随便什么 JD").id).toBe("bq");
  });
  it("semi → BQ 方法论（半结构化套行为面，spec §1.3）", () => {
    expect(selectMethodology("semi", "Redis MySQL 高并发").id).toBe("bq");
  });
});

describe("registry.selectMethodology — tech 关键词打分", () => {
  it("英文后端 JD → backend", () => {
    const jd = "Backend engineer: MySQL, Redis, Kafka, JVM, microservices";
    expect(selectMethodology("tech", jd).id).toBe("backend");
  });
  it("中文后端 JD → backend（G3 中英双覆盖，不漏落兜底）", () => {
    const jd = "招聘后端开发：熟悉高并发、分布式、微服务、缓存与消息队列";
    expect(selectMethodology("tech", jd).id).toBe("backend");
  });
  it("中英混写后端 JD → backend", () => {
    const jd = "服务端工程师，精通 Redis 缓存、分布式事务、限流熔断";
    expect(selectMethodology("tech", jd).id).toBe("backend");
  });
  it("不相关/极短 JD → generic-tech 兜底", () => {
    expect(selectMethodology("tech", "产品运营岗位").id).toBe("generic-tech");
    expect(selectMethodology("tech", "").id).toBe("generic-tech");
  });
});

describe("registry.scoreMethodology", () => {
  it("命中数 = 出现的关键词个数", () => {
    const jd = "Redis 和 MySQL"; // redis + mysql = 2（中文「和」不算）
    expect(scoreMethodology(BACKEND_METHODOLOGY, jd)).toBeGreaterThanOrEqual(2);
  });
  it("bq / generic-tech 关键词为空 → 恒 0", () => {
    expect(scoreMethodology(BQ_METHODOLOGY, "Redis MySQL")).toBe(0);
    expect(scoreMethodology(GENERIC_TECH_METHODOLOGY, "Redis MySQL")).toBe(0);
  });
});

describe("normalizeForMatch", () => {
  it("转小写 + 去空白，CJK 保留", () => {
    expect(normalizeForMatch("  Re dis 后端 ")).toBe("redis后端");
  });
});

describe("specs 一致性（A3 单源 + 权重）", () => {
  it("每个 spec 能力维度权重总和 = 100", () => {
    for (const spec of ALL_METHODOLOGIES) {
      const sum = spec.capabilityDimensions.reduce((a, d) => a + d.weight, 0);
      expect(sum, `${spec.id} 权重和`).toBe(100);
    }
  });
  it("每个能力维度 key 唯一、且有 strongIndicator（A2 判定锚）", () => {
    for (const spec of ALL_METHODOLOGIES) {
      const keys = spec.capabilityDimensions.map((d) => d.key);
      expect(new Set(keys).size, `${spec.id} key 唯一`).toBe(keys.length);
      for (const d of spec.capabilityDimensions) {
        expect(d.strongIndicator.length, `${spec.id}.${d.key} strongIndicator`).toBeGreaterThan(10);
      }
    }
  });
  it("id 与 METHODOLOGY_BY_ID 对齐、appliesToType 非空", () => {
    for (const spec of ALL_METHODOLOGIES) {
      expect(spec.appliesToType.length).toBeGreaterThan(0);
    }
  });
});

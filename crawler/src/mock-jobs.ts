/**
 * Mock 岗位生成 — 反爬封锁时的 fallback,demo 友好
 *
 * 触发场景:所有 platform 都被招聘站反爬封 → /search 返 mock 岗位
 * 前端能看到完整 m6 UX(候选卡片 + 4 阶段 Agent 评分)而不挂
 *
 * 数据风格:不写具体公司名(沿用 plan §1.5 永不推公司);
 *          薪资 / 区域 / experience / education / tags 真实感
 */
import type { Job, Platform } from "./crawler/adapters/types.js";

type MockTemplate = {
  companyType: string;
  district: string;
  salaryMin: number;
  salaryMax: number;
  experience: string;
  education: string;
  tags: string[];
  jdSummary: string;
};

const CITY_DISTRICTS: Record<string, string[]> = {
  上海: ["浦东新区", "徐汇区", "静安区", "长宁区", "杨浦区"],
  北京: ["朝阳区", "海淀区", "西城区", "东城区"],
  深圳: ["南山区", "福田区", "宝安区", "罗湖区"],
  广州: ["天河区", "海珠区", "越秀区", "黄埔区"],
  杭州: ["余杭区", "西湖区", "滨江区"],
  成都: ["高新区", "锦江区", "武侯区"],
  南京: ["建邺区", "鼓楼区", "雨花台区"],
  武汉: ["东湖高新区", "江汉区", "武昌区"],
  西安: ["高新区", "雁塔区"],
  全国: ["远程", "总部"],
};

const COMPANY_TEMPLATES: MockTemplate[] = [
  {
    companyType: "AI Agent 创业公司",
    district: "",
    salaryMin: 25,
    salaryMax: 45,
    experience: "1-3年",
    education: "本科",
    tags: ["大模型", "Agent", "Python", "扁平团队"],
    jdSummary: "参与 AI Agent 产品从 0-1 设计与落地,与算法 + 工程紧密协作,验证 PMF",
  },
  {
    companyType: "独角兽 SaaS 公司",
    district: "",
    salaryMin: 30,
    salaryMax: 55,
    experience: "3-5年",
    education: "本科",
    tags: ["SaaS", "B2B", "数据驱动", "成长期"],
    jdSummary: "负责核心模块迭代,主导 OKR 拆解,与设计 / 工程协同打磨用户体验",
  },
  {
    companyType: "互联网大厂",
    district: "",
    salaryMin: 35,
    salaryMax: 70,
    experience: "3-5年",
    education: "本科及以上",
    tags: ["规模化", "成熟业务", "数据分析", "完善培训"],
    jdSummary: "负责某条业务线的迭代节奏,跟产品 / 运营 / 算法多角色协作",
  },
  {
    companyType: "外企在华团队",
    district: "",
    salaryMin: 28,
    salaryMax: 50,
    experience: "3-5年",
    education: "本科",
    tags: ["英语", "外企", "Work-Life Balance", "扁平"],
    jdSummary: "Member of a global product team; English working environment; flexible WFH",
  },
  {
    companyType: "新消费品牌",
    district: "",
    salaryMin: 18,
    salaryMax: 35,
    experience: "1-3年",
    education: "本科",
    tags: ["年轻团队", "DTC", "增长", "内容"],
    jdSummary: "用户洞察 + 产品迭代 + 增长策略闭环,适合愿意快速试错的同学",
  },
  {
    companyType: "金融科技公司",
    district: "",
    salaryMin: 30,
    salaryMax: 60,
    experience: "3-5年",
    education: "本科",
    tags: ["合规", "稳定", "高质量代码", "数据敏感"],
    jdSummary: "金融业务线产品,强调严谨与合规;有金融背景或 CS 背景皆可",
  },
  {
    companyType: "教育科技初创",
    district: "",
    salaryMin: 20,
    salaryMax: 40,
    experience: "1-3年",
    education: "本科",
    tags: ["教育", "C端", "AI 应用", "Mission-driven"],
    jdSummary: "教育 + AI 结合,K-12 / 高等教育 / 职业培训方向,关心结果而非过程",
  },
  {
    companyType: "工业软件公司",
    district: "",
    salaryMin: 25,
    salaryMax: 50,
    experience: "3-5年",
    education: "本科及以上",
    tags: ["B2B", "工业", "深耕", "扎实"],
    jdSummary: "面向制造业 / 能源等垂直行业的软件产品,需要业务领域 + 软件素养",
  },
];

function pick<T>(arr: T[], n?: number): T[] {
  if (!n) return [arr[Math.floor((arr.length * 7) % arr.length)]!];
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(n, arr.length));
}

/**
 * 生成 5-8 个 mock 岗位 — 反爬封锁时 fallback
 * @param role  岗位关键词(用户搜索的)
 * @param city  城市(可选)
 * @param limit 需要数量,默认 6
 */
export function generateMockJobs(
  role: string,
  city: string = "上海",
  limit: number = 6,
): Job[] {
  const now = new Date().toISOString();
  const districts = CITY_DISTRICTS[city] ?? CITY_DISTRICTS["上海"]!;
  // 轮换不同 platform 让 demo 看起来更真
  const platforms: Platform[] = ["51job", "liepin", "zhilian"];

  const templates = pick(COMPANY_TEMPLATES, Math.min(limit, COMPANY_TEMPLATES.length));

  return templates.map((tpl, idx) => {
    const platform = platforms[idx % platforms.length]!;
    const district = districts[idx % districts.length]!;
    const id = `mock-${platform}-${Date.now()}-${idx}`;
    return {
      id,
      platform,
      title: `${role}(${tpl.experience})`,
      company: tpl.companyType,
      city,
      district,
      salary: `${tpl.salaryMin}-${tpl.salaryMax}K · 14薪`,
      salaryMin: tpl.salaryMin,
      salaryMax: tpl.salaryMax,
      experience: tpl.experience,
      education: tpl.education,
      tags: tpl.tags,
      jdText: tpl.jdSummary,
      jdUrl: `https://example.com/job/${id}`,
      publishedAt: now,
      scrapedAt: now,
    };
  });
}

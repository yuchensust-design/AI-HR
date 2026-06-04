/**
 * scrubCompanyNames — server-side safety net
 *
 * Prompt 里已 hard-rule "永远不输出公司名",这层 regex 是兜底:LLM 偶尔会 echo 用户简历/JD 里
 * 出现的具名大厂。覆盖最常见的中外大厂,不是详尽清单。
 *
 * 同步自 `app/api/m2/chat/route.ts` 的 COMPANY_REPLACEMENTS — 这里独立一份,避免跨模块耦合。
 */

const COMPANY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/字节跳动|字节(?![一-龥])|抖音|TikTok|ByteDance/gi, "某互联网大厂"],
  [/阿里巴巴|阿里(?![一-龥])|淘宝|天猫|蚂蚁集团|蚂蚁金服|Alibaba/gi, "某互联网大厂"],
  [/腾讯|微信|QQ(?![一-龥])|Tencent/gi, "某互联网大厂"],
  [/美团|大众点评|Meituan/gi, "某互联网大厂"],
  [/百度|Baidu/gi, "某互联网大厂"],
  [/华为|Huawei/gi, "某科技公司"],
  [/京东|JD\.com/gi, "某互联网大厂"],
  [/拼多多|Pinduoduo|PDD/gi, "某互联网大厂"],
  [/网易(?![一-龥])|NetEase/gi, "某互联网大厂"],
  [/小米|Xiaomi/gi, "某科技公司"],
  [/滴滴|Didi/gi, "某互联网大厂"],
  [/快手|Kuaishou/gi, "某互联网大厂"],
  [/B 站|B站|哔哩哔哩|bilibili/gi, "某互联网大厂"],
  [/(?<![A-Za-z])Google(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Microsoft(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Meta(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Amazon(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Apple(?![A-Za-z])/g, "某科技公司"],
];

export function scrubCompanyNames(text: string): string {
  let out = text;
  for (const [re, repl] of COMPANY_REPLACEMENTS) {
    out = out.replace(re, repl);
  }
  return out;
}

export function scrubCompanyNamesDeep<T>(value: T): T {
  if (typeof value === "string") {
    return scrubCompanyNames(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubCompanyNamesDeep(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubCompanyNamesDeep(v);
    }
    return out as T;
  }
  return value;
}

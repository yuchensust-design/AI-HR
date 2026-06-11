import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC, Fraunces } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

const notoSerif = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  subsets: ["latin"],
  weight: ["400", "600", "900"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Offer 捕手 · 学生求职智能体",
  description: "敢说真话的求职 AI · 从兴趣发现到模拟面试,全程陪你走完闭环",
};

/**
 * 新标签页隐私清扫 —— 在 React 注水前同步执行,杜绝残留数据闪现。
 * 公用电脑场景:上一个人没登出(直接关页面)也会在 localStorage 留下简历/测评等;
 * 下一个人开新标签 + 未登录时,这段脚本把残留清掉,只留 UI 偏好 / 鉴权 / 同意。
 * 用 sessionStorage('oc_sess') 标记区分"全新标签页"与"本会话内导航/刷新",
 * 后者(含活动游客、已登录用户)不清,不影响正常使用。登出仍由 clearLocalUserData 处理。
 */
const PRIVACY_SWEEP = `(function(){try{
var ss=window.sessionStorage,ls=window.localStorage;
if(ss.getItem('oc_sess'))return;
ss.setItem('oc_sess','1');
for(var i=0;i<ls.length;i++){var k=ls.key(i);if(k&&/^sb-.*-auth-token$/.test(k))return;}
var keep=function(k){return /^sb-/.test(k)||k==='theme'||k==='conv_sidebar_collapsed'||k==='cookie_consent';};
var rm=[];for(var j=0;j<ls.length;j++){var key=ls.key(j);if(key&&!keep(key))rm.push(key);}
for(var n=0;n<rm.length;n++)ls.removeItem(rm[n]);
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSans.variable} ${notoSerif.variable} ${fraunces.variable} h-full antialiased scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRIVACY_SWEEP }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
